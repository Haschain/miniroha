/**
 * Simplified BFT Consensus Engine
 * Implements a Tendermint-style consensus: Propose → PreVote → PreCommit → Commit
 * 
 * Byzantine Fault Tolerance: Can tolerate up to f = (n-1)/3 faulty validators
 * where n is the total number of validators.
 * 
 * Requires 2f+1 votes (>2/3 of validators) to reach consensus.
 */

import type {
  Block,
  Validator,
  Vote,
  Proposal,
  ConsensusState,
  Signature
} from '../types';
import type { LevelDBStateStore } from '../state';
import type { BlockProducer } from '../block';
import { sign, verify, hash, canonicalJsonStringify } from '../crypto';

export type ConsensusStep = 'propose' | 'prevote' | 'precommit' | 'commit';

export interface ConsensusMessage {
  type: 'proposal' | 'prevote' | 'precommit';
  height: number;
  round: number;
  validatorId: string;
  blockHash?: string;
  block?: Block;
  signature: Signature;
}

export interface ConsensusConfig {
  proposalTimeout: number;    // ms to wait for proposal
  prevoteTimeout: number;     // ms to wait for prevotes
  precommitTimeout: number;   // ms to wait for precommits
  blockInterval: number;      // ms between blocks
}

const DEFAULT_CONFIG: ConsensusConfig = {
  proposalTimeout: 3000,
  prevoteTimeout: 2000,
  precommitTimeout: 2000,
  blockInterval: 10000
};

export class BFTConsensus {
  private state: ConsensusState;
  private validators: Map<string, Validator> = new Map();
  private config: ConsensusConfig;
  private isRunning: boolean = false;
  private roundTimer: ReturnType<typeof setTimeout> | null = null;
  
  // Message handlers for networking (to be set by the node)
  public onBroadcast?: (message: ConsensusMessage) => Promise<void>;
  public onBlockCommit?: (block: Block) => Promise<void>;

  constructor(
    private stateStore: LevelDBStateStore,
    private blockProducer: BlockProducer,
    private validatorId: string,
    private privateKey: string,
    config: Partial<ConsensusConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  private createInitialState(): ConsensusState {
    return {
      height: 0,
      round: 0,
      step: 'propose',
      votes: {
        prevotes: new Map(),
        precommits: new Map()
      }
    };
  }

  /**
   * Initialize consensus with validators from state store
   */
  async initialize(): Promise<void> {
    // Load validators from state store
    const validatorIds = await this.loadValidators();
    console.log(`[Consensus] Initialized with ${validatorIds.length} validators`);
    
    // Get current height
    const lastHeight = await this.stateStore.getLastHeight();
    this.state.height = lastHeight + 1;
    
    console.log(`[Consensus] Starting at height ${this.state.height}`);
  }

  private async loadValidators(): Promise<string[]> {
    const validatorIds: string[] = [];
    
    // Load validators from state store
    // In a real implementation, this would iterate over all validators
    for (let i = 1; i <= 10; i++) {
      const validator = await this.stateStore.get(`validators/node${i}`);
      if (validator) {
        this.validators.set(validator.id, validator);
        validatorIds.push(validator.id);
      }
    }
    
    return validatorIds;
  }

  /**
   * Get the number of validators required for consensus (2f+1 where f = (n-1)/3)
   */
  getQuorumSize(): number {
    const n = this.validators.size;
    const f = Math.floor((n - 1) / 3);
    return 2 * f + 1;
  }

  /**
   * Check if we have enough votes for quorum
   */
  hasQuorum(votes: Map<string, Vote>, blockHash?: string): boolean {
    const quorum = this.getQuorumSize();
    let count = 0;
    
    for (const vote of votes.values()) {
      if (blockHash === undefined || vote.block_hash === blockHash) {
        count++;
      }
    }
    
    return count >= quorum;
  }

  /**
   * Get the proposer for a given height and round (round-robin)
   */
  getProposer(height: number, round: number): string {
    const validatorList = Array.from(this.validators.keys()).sort();
    if (validatorList.length === 0) {
      throw new Error('No validators available');
    }
    const index = (height + round) % validatorList.length;
    return validatorList[index]!;
  }

  /**
   * Check if this node is the proposer for current height/round
   */
  isProposer(): boolean {
    return this.getProposer(this.state.height, this.state.round) === this.validatorId;
  }

  /**
   * Start the consensus engine
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    await this.initialize();
    this.isRunning = true;
    
    console.log(`[Consensus] Started for validator ${this.validatorId}`);
    this.startRound();
  }

  /**
   * Stop the consensus engine
   */
  stop(): void {
    this.isRunning = false;
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    console.log(`[Consensus] Stopped`);
  }

  /**
   * Start a new round
   */
  private startRound(): void {
    if (!this.isRunning) return;
    
    console.log(`[Consensus] Starting round ${this.state.round} at height ${this.state.height}`);
    
    // Reset votes for new round
    this.state.votes.prevotes.clear();
    this.state.votes.precommits.clear();
    this.state.step = 'propose';
    
    // If we're the proposer, create and broadcast proposal
    if (this.isProposer()) {
      this.propose();
    } else {
      // Wait for proposal with timeout
      this.scheduleTimeout('propose', this.config.proposalTimeout);
    }
  }

  /**
   * Create and broadcast a proposal
   */
  private async propose(): Promise<void> {
    if (this.state.step !== 'propose') return;
    
    console.log(`[Consensus] Creating proposal for height ${this.state.height}`);
    
    try {
      // Get chain ID
      const chainId = await this.stateStore.get('chain_id') || 'miniroha-testnet';
      
      // Create block
      const block = await this.blockProducer.produceBlock(chainId);
      const blockHash = await this.blockProducer.calculateBlockHash(block);
      
      // Create proposal message
      const proposal: ConsensusMessage = {
        type: 'proposal',
        height: this.state.height,
        round: this.state.round,
        validatorId: this.validatorId,
        blockHash,
        block,
        signature: await this.signMessage({ type: 'proposal', height: this.state.height, round: this.state.round, blockHash })
      };
      
      // Store the proposed block
      this.state.validBlock = block;
      this.state.validRound = this.state.round;
      
      // Broadcast proposal
      await this.broadcast(proposal);
      
      // Move to prevote step and vote for our own proposal
      this.state.step = 'prevote';
      await this.prevote(blockHash);
      
    } catch (error) {
      console.log(`[Consensus] No transactions to propose, voting nil`);
      this.state.step = 'prevote';
      await this.prevote(undefined); // nil vote
    }
  }

  /**
   * Handle incoming proposal
   */
  async handleProposal(proposal: ConsensusMessage): Promise<void> {
    if (proposal.type !== 'proposal') return;
    if (proposal.height !== this.state.height) return;
    if (proposal.round !== this.state.round) return;
    if (this.state.step !== 'propose') return;
    
    // Verify proposer
    const expectedProposer = this.getProposer(proposal.height, proposal.round);
    if (proposal.validatorId !== expectedProposer) {
      console.log(`[Consensus] Invalid proposer: expected ${expectedProposer}, got ${proposal.validatorId}`);
      return;
    }
    
    // Verify signature
    if (!await this.verifyMessage(proposal)) {
      console.log(`[Consensus] Invalid proposal signature`);
      return;
    }
    
    // Verify block
    if (proposal.block && await this.blockProducer.verifyBlock(proposal.block)) {
      console.log(`[Consensus] Received valid proposal for height ${proposal.height}`);
      
      this.state.validBlock = proposal.block;
      this.state.validRound = proposal.round;
      this.state.step = 'prevote';
      
      // Vote for the block
      await this.prevote(proposal.blockHash);
    } else {
      console.log(`[Consensus] Invalid block in proposal`);
      this.state.step = 'prevote';
      await this.prevote(undefined); // nil vote
    }
  }

  /**
   * Cast a prevote
   */
  private async prevote(blockHash?: string): Promise<void> {
    console.log(`[Consensus] Prevoting for ${blockHash || 'nil'}`);
    
    const vote: ConsensusMessage = {
      type: 'prevote',
      height: this.state.height,
      round: this.state.round,
      validatorId: this.validatorId,
      blockHash,
      signature: await this.signMessage({ type: 'prevote', height: this.state.height, round: this.state.round, blockHash })
    };
    
    // Add our own vote
    this.state.votes.prevotes.set(this.validatorId, {
      block_hash: blockHash,
      height: this.state.height,
      round: this.state.round,
      voter_id: this.validatorId,
      signature: vote.signature
    });
    
    // Broadcast vote
    await this.broadcast(vote);
    
    // Check if we have quorum
    this.checkPrevoteQuorum();
    
    // Schedule timeout for prevote step
    this.scheduleTimeout('prevote', this.config.prevoteTimeout);
  }

  /**
   * Handle incoming prevote
   */
  async handlePrevote(vote: ConsensusMessage): Promise<void> {
    if (vote.type !== 'prevote') return;
    if (vote.height !== this.state.height) return;
    if (vote.round !== this.state.round) return;
    
    // Verify validator
    if (!this.validators.has(vote.validatorId)) {
      console.log(`[Consensus] Unknown validator: ${vote.validatorId}`);
      return;
    }
    
    // Verify signature
    if (!await this.verifyMessage(vote)) {
      console.log(`[Consensus] Invalid prevote signature`);
      return;
    }
    
    // Store vote
    this.state.votes.prevotes.set(vote.validatorId, {
      block_hash: vote.blockHash,
      height: vote.height,
      round: vote.round,
      voter_id: vote.validatorId,
      signature: vote.signature
    });
    
    console.log(`[Consensus] Received prevote from ${vote.validatorId} for ${vote.blockHash || 'nil'}`);
    
    // Check if we have quorum
    this.checkPrevoteQuorum();
  }

  /**
   * Check if we have prevote quorum and move to precommit
   */
  private checkPrevoteQuorum(): void {
    if (this.state.step !== 'prevote') return;
    
    // Check for quorum on valid block
    if (this.state.validBlock) {
      const blockHash = hash(canonicalJsonStringify(this.state.validBlock.header));
      if (this.hasQuorum(this.state.votes.prevotes, blockHash)) {
        console.log(`[Consensus] Prevote quorum reached for block`);
        this.state.lockedBlock = this.state.validBlock;
        this.state.lockedRound = this.state.round;
        this.state.step = 'precommit';
        this.precommit(blockHash);
        return;
      }
    }
    
    // Check for quorum on nil
    if (this.hasQuorum(this.state.votes.prevotes, undefined)) {
      console.log(`[Consensus] Prevote quorum reached for nil`);
      this.state.step = 'precommit';
      this.precommit(undefined);
    }
  }

  /**
   * Cast a precommit
   */
  private async precommit(blockHash?: string): Promise<void> {
    console.log(`[Consensus] Precommitting for ${blockHash || 'nil'}`);
    
    const vote: ConsensusMessage = {
      type: 'precommit',
      height: this.state.height,
      round: this.state.round,
      validatorId: this.validatorId,
      blockHash,
      signature: await this.signMessage({ type: 'precommit', height: this.state.height, round: this.state.round, blockHash })
    };
    
    // Add our own vote
    this.state.votes.precommits.set(this.validatorId, {
      block_hash: blockHash,
      height: this.state.height,
      round: this.state.round,
      voter_id: this.validatorId,
      signature: vote.signature
    });
    
    // Broadcast vote
    await this.broadcast(vote);
    
    // Check if we have quorum
    this.checkPrecommitQuorum();
    
    // Schedule timeout for precommit step
    this.scheduleTimeout('precommit', this.config.precommitTimeout);
  }

  /**
   * Handle incoming precommit
   */
  async handlePrecommit(vote: ConsensusMessage): Promise<void> {
    if (vote.type !== 'precommit') return;
    if (vote.height !== this.state.height) return;
    if (vote.round !== this.state.round) return;
    
    // Verify validator
    if (!this.validators.has(vote.validatorId)) {
      console.log(`[Consensus] Unknown validator: ${vote.validatorId}`);
      return;
    }
    
    // Verify signature
    if (!await this.verifyMessage(vote)) {
      console.log(`[Consensus] Invalid precommit signature`);
      return;
    }
    
    // Store vote
    this.state.votes.precommits.set(vote.validatorId, {
      block_hash: vote.blockHash,
      height: vote.height,
      round: vote.round,
      voter_id: vote.validatorId,
      signature: vote.signature
    });
    
    console.log(`[Consensus] Received precommit from ${vote.validatorId} for ${vote.blockHash || 'nil'}`);
    
    // Check if we have quorum
    this.checkPrecommitQuorum();
  }

  /**
   * Check if we have precommit quorum and commit
   */
  private checkPrecommitQuorum(): void {
    if (this.state.step !== 'precommit') return;
    
    // Check for quorum on locked block
    if (this.state.lockedBlock) {
      const blockHash = hash(canonicalJsonStringify(this.state.lockedBlock.header));
      if (this.hasQuorum(this.state.votes.precommits, blockHash)) {
        console.log(`[Consensus] Precommit quorum reached - committing block`);
        this.commit();
        return;
      }
    }
    
    // Check for quorum on nil - move to next round
    if (this.hasQuorum(this.state.votes.precommits, undefined)) {
      console.log(`[Consensus] Precommit quorum reached for nil - moving to next round`);
      this.nextRound();
    }
  }

  /**
   * Commit the locked block
   */
  private async commit(): Promise<void> {
    if (!this.state.lockedBlock) {
      console.log(`[Consensus] No block to commit`);
      return;
    }
    
    this.state.step = 'commit';
    
    console.log(`[Consensus] Committing block at height ${this.state.height}`);
    
    try {
      // Apply the block
      await this.blockProducer.applyBlock(this.state.lockedBlock);
      
      // Notify listeners
      if (this.onBlockCommit) {
        await this.onBlockCommit(this.state.lockedBlock);
      }
      
      console.log(`[Consensus] Block committed at height ${this.state.height}`);
      
      // Move to next height
      this.nextHeight();
      
    } catch (error) {
      console.error(`[Consensus] Failed to commit block:`, error);
      this.nextRound();
    }
  }

  /**
   * Move to next height
   */
  private nextHeight(): void {
    this.state.height++;
    this.state.round = 0;
    this.state.lockedBlock = undefined;
    this.state.lockedRound = undefined;
    this.state.validBlock = undefined;
    this.state.validRound = undefined;
    
    // Schedule next round after block interval
    setTimeout(() => this.startRound(), this.config.blockInterval);
  }

  /**
   * Move to next round (on timeout or nil quorum)
   */
  private nextRound(): void {
    this.state.round++;
    console.log(`[Consensus] Moving to round ${this.state.round}`);
    this.startRound();
  }

  /**
   * Schedule a timeout for the current step
   */
  private scheduleTimeout(step: ConsensusStep, timeout: number): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
    }
    
    this.roundTimer = setTimeout(() => {
      if (this.state.step === step) {
        console.log(`[Consensus] Timeout in ${step} step`);
        this.handleTimeout(step);
      }
    }, timeout);
  }

  /**
   * Handle timeout for a step
   */
  private handleTimeout(step: ConsensusStep): void {
    switch (step) {
      case 'propose':
        // No proposal received, vote nil
        this.state.step = 'prevote';
        this.prevote(undefined);
        break;
      case 'prevote':
        // No prevote quorum, move to precommit with nil
        this.state.step = 'precommit';
        this.precommit(undefined);
        break;
      case 'precommit':
        // No precommit quorum, move to next round
        this.nextRound();
        break;
    }
  }

  /**
   * Handle incoming consensus message
   */
  async handleMessage(message: ConsensusMessage): Promise<void> {
    switch (message.type) {
      case 'proposal':
        await this.handleProposal(message);
        break;
      case 'prevote':
        await this.handlePrevote(message);
        break;
      case 'precommit':
        await this.handlePrecommit(message);
        break;
    }
  }

  /**
   * Broadcast a consensus message
   */
  private async broadcast(message: ConsensusMessage): Promise<void> {
    if (this.onBroadcast) {
      await this.onBroadcast(message);
    }
  }

  /**
   * Sign a message
   */
  private async signMessage(data: object): Promise<Signature> {
    const nacl = await import('tweetnacl');
    const bs58 = await import('bs58');
    
    const keyPair = nacl.sign.keyPair.fromSecretKey(bs58.default.decode(this.privateKey));
    const publicKey = 'ed25519:' + bs58.default.encode(keyPair.publicKey);
    
    const canonical = canonicalJsonStringify(data);
    const signature = sign(canonical, this.privateKey);
    
    return { public_key: publicKey, signature };
  }

  /**
   * Verify a message signature
   */
  private async verifyMessage(message: ConsensusMessage): Promise<boolean> {
    const validator = this.validators.get(message.validatorId);
    if (!validator) return false;
    
    const data = {
      type: message.type,
      height: message.height,
      round: message.round,
      blockHash: message.blockHash
    };
    
    const canonical = canonicalJsonStringify(data);
    return verify(canonical, message.signature.signature, validator.public_key);
  }

  /**
   * Get current consensus state (for debugging/monitoring)
   */
  getState(): ConsensusState {
    return { ...this.state };
  }

  /**
   * Get consensus statistics
   */
  getStats(): {
    height: number;
    round: number;
    step: ConsensusStep;
    validators: number;
    quorumSize: number;
    prevotes: number;
    precommits: number;
    isProposer: boolean;
  } {
    return {
      height: this.state.height,
      round: this.state.round,
      step: this.state.step,
      validators: this.validators.size,
      quorumSize: this.getQuorumSize(),
      prevotes: this.state.votes.prevotes.size,
      precommits: this.state.votes.precommits.size,
      isProposer: this.isProposer()
    };
  }
}

export { BFTConsensus as default };
