import type { 
  Block, 
  BlockHeader, 
  Transaction, 
  Signature,
  Validator
} from '../types';
import type { LevelDBStateStore } from '../state';
import type { TransactionMempool } from '../mempool';
import { hash, canonicalJsonStringify } from '../crypto';

export class BlockProducer {
  constructor(
    private stateStore: LevelDBStateStore,
    private mempool: TransactionMempool,
    private validatorId: string,
    private privateKey: string
  ) {}

  async produceBlock(chainId: string, maxTransactions: number = 100): Promise<Block> {
    // Get current blockchain state
    const lastHeight = await this.stateStore.getLastHeight();
    const lastBlock = lastHeight > 0 ? await this.stateStore.getBlock(lastHeight) : null;
    
    // Get transactions from mempool
    const transactions = await this.mempool.getBlockTransactions(maxTransactions);
    
    if (transactions.length === 0) {
      throw new Error('No transactions available to produce block');
    }

    // Create block header
    const header: BlockHeader = {
      height: lastHeight + 1,
      prev_hash: lastBlock ? await this.calculateBlockHash(lastBlock) : '',
      timestamp: Date.now()
    };

    // Create block
    const block: Block = {
      header,
      transactions,
      proposer_id: this.validatorId,
      signature: {
        public_key: '', // Will be set below
        signature: ''   // Will be set below
      }
    };

    // Sign the block
    const blockSignature = await this.signBlock(block);
    block.signature = blockSignature;

    return block;
  }

  async createGenesisBlock(genesisConfig: any): Promise<Block> {
    // Create genesis block header
    const header: BlockHeader = {
      height: 1,
      prev_hash: '',
      timestamp: Date.now()
    };

    // Genesis block has no transactions
    const block: Block = {
      header,
      transactions: [],
      proposer_id: 'genesis',
      signature: {
        public_key: '',
        signature: ''
      }
    };

    // Sign the genesis block
    const blockSignature = await this.signBlock(block);
    block.signature = blockSignature;

    return block;
  }

  private async signBlock(block: Block): Promise<Signature> {
    // Get public key from private key
    const nacl = await import('tweetnacl');
    const bs58 = await import('bs58');
    
    const keyPair = nacl.sign.keyPair.fromSecretKey(bs58.default.decode(this.privateKey));
    const publicKey = 'ed25519:' + bs58.default.encode(keyPair.publicKey);

    // Create canonical representation of block (without signature)
    const blockForSigning = {
      header: block.header,
      transactions: block.transactions,
      proposer_id: block.proposer_id
    };

    const canonicalBlock = canonicalJsonStringify(blockForSigning);
    const blockBytes = new TextEncoder().encode(canonicalBlock);
    const signatureBytes = nacl.sign.detached(blockBytes, bs58.default.decode(this.privateKey));
    const signature = bs58.default.encode(signatureBytes);

    return {
      public_key: publicKey,
      signature
    };
  }

  async verifyBlock(block: Block): Promise<boolean> {
    try {
      // Verify block signature
      const isValidSignature = await this.verifyBlockSignature(block);
      if (!isValidSignature) {
        return false;
      }

      // Verify block structure
      if (!this.validateBlockStructure(block)) {
        return false;
      }

      // Verify previous hash
      if (block.header.height > 1) {
        const prevBlock = await this.stateStore.getBlock(block.header.height - 1);
        if (!prevBlock) {
          return false;
        }
        
        const expectedPrevHash = await this.calculateBlockHash(prevBlock);
        if (block.header.prev_hash !== expectedPrevHash) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async verifyBlockSignature(block: Block): Promise<boolean> {
    try {
      const { verify } = await import('../crypto');
      
      // Create canonical representation of block (without signature)
      const blockForVerification = {
        header: block.header,
        transactions: block.transactions,
        proposer_id: block.proposer_id
      };

      const canonicalBlock = canonicalJsonStringify(blockForVerification);
      return verify(canonicalBlock, block.signature.signature, block.signature.public_key);
    } catch (error) {
      return false;
    }
  }

  private validateBlockStructure(block: Block): boolean {
    // Check required fields
    if (!block.header) {
      return false;
    }

    if (typeof block.header.height !== 'number' || block.header.height <= 0) {
      return false;
    }

    if (typeof block.header.prev_hash !== 'string') {
      return false;
    }

    if (typeof block.header.timestamp !== 'number' || block.header.timestamp <= 0) {
      return false;
    }

    if (!Array.isArray(block.transactions)) {
      return false;
    }

    if (!block.proposer_id || typeof block.proposer_id !== 'string') {
      return false;
    }

    if (!block.signature || !block.signature.public_key || !block.signature.signature) {
      return false;
    }

    return true;
  }

  async calculateBlockHash(block: Block): Promise<string> {
    const canonicalHeader = canonicalJsonStringify(block.header);
    return hash(canonicalHeader);
  }

  async applyBlock(block: Block): Promise<void> {
    // Create batch operations for all state changes
    const operations: Array<{type: 'put' | 'del', key: string, value?: any}> = [];

    // Store the block
    operations.push({
      type: 'put',
      key: `blocks/${block.header.height}`,
      value: block
    });

    // Store block by hash
    const blockHash = await this.calculateBlockHash(block);
    operations.push({
      type: 'put',
      key: `blocks_by_hash/${blockHash}`,
      value: block.header.height
    });

    // Process transactions
    const { InstructionEngine } = await import('../instruction');
    const instructionEngine = new InstructionEngine(this.stateStore);

    for (const tx of block.transactions) {
      // Store transaction
      const txHash = await this.calculateTransactionHash(tx);
      operations.push({
        type: 'put',
        key: `txs/${txHash}`,
        value: tx
      });

      // Execute instructions
      for (const instruction of tx.body.instructions) {
        await instructionEngine.execute(instruction, tx.body.signer_id);
      }
    }

    // Update last height
    operations.push({
      type: 'put',
      key: 'last_height',
      value: block.header.height
    });

    // Apply all operations in a batch
    await this.stateStore.batch(operations);

    // Remove processed transactions from mempool
    await this.mempool.removeTransactionsForBlock(block.transactions);
  }

  private async calculateTransactionHash(tx: Transaction): Promise<string> {
    const canonicalTx = canonicalJsonStringify(tx);
    return hash(canonicalTx);
  }

  // Get block producer statistics
  async getStats(): Promise<{
    lastHeight: number;
    lastBlockTime: number;
    totalTransactions: number;
    averageBlockTime: number;
  }> {
    const lastHeight = await this.stateStore.getLastHeight();
    let totalTransactions = 0;
    let lastBlockTime = 0;
    let firstBlockTime = 0;

    if (lastHeight > 0) {
      const lastBlock = await this.stateStore.getBlock(lastHeight);
      if (lastBlock) {
        lastBlockTime = lastBlock.header.timestamp;
      }

      // Calculate total transactions and first block time
      for (let height = 1; height <= lastHeight; height++) {
        const block = await this.stateStore.getBlock(height);
        if (block) {
          totalTransactions += block.transactions.length;
          if (height === 1) {
            firstBlockTime = block.header.timestamp;
          }
        }
      }
    }

    const averageBlockTime = lastHeight > 1 && firstBlockTime > 0 
      ? (lastBlockTime - firstBlockTime) / (lastHeight - 1) 
      : 0;

    return {
      lastHeight,
      lastBlockTime,
      totalTransactions,
      averageBlockTime
    };
  }
}