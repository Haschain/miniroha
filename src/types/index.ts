// Core types for Miniroha blockchain engine

// Basic entities
export interface Domain {
  id: string;
  created_at: number;
}

export interface Account {
  id: string; // Format: "account_name@domain"
  public_key: string; // Ed25519 public key
  roles: string[];
  created_at: number;
}

export interface Asset {
  id: string; // Format: "asset_id#domain"
  precision: number;
  created_at: number;
}

export interface Balance {
  asset_id: string;
  account_id: string;
  amount: string; // String to handle large numbers
}

export interface Role {
  id: string;
  permissions: string[];
}

export interface Validator {
  id: string;
  public_key: string; // Ed25519 public key
}

// Instruction types
export type Instruction = 
  | RegisterDomain
  | RegisterAccount
  | RegisterAsset
  | MintAsset
  | BurnAsset
  | TransferAsset
  | GrantRole
  | RevokeRole;

export interface RegisterDomain {
  type: "RegisterDomain";
  id: string;
}

export interface RegisterAccount {
  type: "RegisterAccount";
  id: string;
  public_key: string;
}

export interface RegisterAsset {
  type: "RegisterAsset";
  id: string;
  precision: number;
}

export interface MintAsset {
  type: "MintAsset";
  asset_id: string;
  account_id: string;
  amount: string;
}

export interface BurnAsset {
  type: "BurnAsset";
  asset_id: string;
  account_id: string;
  amount: string;
}

export interface TransferAsset {
  type: "TransferAsset";
  asset_id: string;
  src_account: string;
  dest_account: string;
  amount: string;
}

export interface GrantRole {
  type: "GrantRole";
  role_id: string;
  account_id: string;
}

export interface RevokeRole {
  type: "RevokeRole";
  role_id: string;
  account_id: string;
}

// Transaction and signature
export interface TransactionBody {
  chain_id: string;
  signer_id: string;
  nonce: number;
  created_at: number;
  instructions: Instruction[];
}

export interface Signature {
  public_key: string; // Ed25519 public key
  signature: string; // Base58 encoded signature
}

export interface Transaction {
  body: TransactionBody;
  signature: Signature;
}

// Block structure
export interface BlockHeader {
  height: number;
  prev_hash: string;
  timestamp: number;
  tx_root?: string; // Optional in v1
  state_root?: string; // Optional in v1
}

export interface Block {
  header: BlockHeader;
  transactions: Transaction[];
  proposer_id: string;
  signature: Signature;
}

// Consensus messages
export interface Proposal {
  block: Block;
  height: number;
  round: number;
  proposer_id: string;
  signature: Signature;
}

export interface Vote {
  block_hash?: string; // undefined for nil votes
  height: number;
  round: number;
  voter_id: string;
  signature: Signature;
}

export type PreVote = Vote;
export type PreCommit = Vote;

// Genesis configuration
export interface GenesisConfig {
  chain_id: string;
  genesis: {
    domains: Domain[];
    accounts: Account[];
    assets: Asset[];
    balances: Balance[];
    roles: Role[];
    validators: Validator[];
  };
}

// API request/response types
export interface SubmitTxRequest {
  tx: Transaction;
}

export interface QueryRequest {
  type: "domain" | "account" | "asset" | "balance" | "block";
  id?: string;
  asset_id?: string;
  account_id?: string;
  height?: number;
}

export interface ConsensusRequest {
  message: Proposal | PreVote | PreCommit;
}

// Error types
export interface ValidationError {
  code: string;
  message: string;
  details?: any;
}

// State store interface
export interface StateStore {
  get(key: string): Promise<any>;
  put(key: string, value: any): Promise<void>;
  del(key: string): Promise<void>;
  batch(operations: Array<{type: 'put' | 'del', key: string, value?: any}>): Promise<void>;
  createReadStream(options?: any): NodeJS.ReadableStream;
}

// Mempool interface
export interface Mempool {
  add(tx: Transaction): Promise<void>;
  remove(txHash: string): Promise<void>;
  getPending(limit?: number): Promise<Transaction[]>;
  size(): Promise<number>;
}

// Consensus state
export interface ConsensusState {
  height: number;
  round: number;
  step: 'propose' | 'prevote' | 'precommit' | 'commit';
  lockedBlock?: Block;
  lockedRound?: number;
  validBlock?: Block;
  validRound?: number;
  votes: {
    prevotes: Map<string, Vote>;
    precommits: Map<string, Vote>;
  };
}