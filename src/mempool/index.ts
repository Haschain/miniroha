import type { Transaction, Mempool } from '../types';
import type { LevelDBStateStore } from '../state';
import { hash } from '../crypto';

export class TransactionMempool implements Mempool {
  private pendingTransactions: Map<string, Transaction> = new Map();
  private sortedTxHashes: string[] = [];
  private maxSize: number = 10000; // Maximum number of transactions in mempool

  constructor(private stateStore: LevelDBStateStore, maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  async add(tx: Transaction): Promise<void> {
    const txHash = await this.calculateTransactionHash(tx);
    
    // Check if transaction already exists
    if (this.pendingTransactions.has(txHash)) {
      throw new Error(`Transaction ${txHash} already exists in mempool`);
    }

    // Check if mempool is full
    if (this.pendingTransactions.size >= this.maxSize) {
      // Remove oldest transaction
      const oldestHash = this.sortedTxHashes[0];
      if (oldestHash) {
        this.pendingTransactions.delete(oldestHash);
        this.sortedTxHashes.shift();
      }
    }

    // Add transaction to mempool
    this.pendingTransactions.set(txHash, tx);
    this.sortedTxHashes.push(txHash);
    
    // Sort by fee (for now, sort by nonce - can be enhanced with fee-based sorting)
    this.sortedTxHashes.sort((a, b) => {
      const txA = this.pendingTransactions.get(a)!;
      const txB = this.pendingTransactions.get(b)!;
      return txA.body.nonce - txB.body.nonce;
    });
  }

  async remove(txHash: string): Promise<void> {
    if (this.pendingTransactions.has(txHash)) {
      this.pendingTransactions.delete(txHash);
      this.sortedTxHashes = this.sortedTxHashes.filter(hash => hash !== txHash);
    }
  }

  async getPending(limit?: number): Promise<Transaction[]> {
    const txHashes = limit ? this.sortedTxHashes.slice(0, limit) : this.sortedTxHashes;
    return txHashes.map(hash => this.pendingTransactions.get(hash)!);
  }

  async size(): Promise<number> {
    return this.pendingTransactions.size;
  }

  async getTransaction(txHash: string): Promise<Transaction | null> {
    return this.pendingTransactions.get(txHash) || null;
  }

  async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    
    for (const tx of this.pendingTransactions.values()) {
      if (tx.body.signer_id === accountId) {
        transactions.push(tx);
      }
    }
    
    // Sort by nonce
    return transactions.sort((a, b) => a.body.nonce - b.body.nonce);
  }

  async clear(): Promise<void> {
    this.pendingTransactions.clear();
    this.sortedTxHashes = [];
  }

  async removeTransactionsForBlock(transactions: Transaction[]): Promise<void> {
    for (const tx of transactions) {
      const txHash = await this.calculateTransactionHash(tx);
      await this.remove(txHash);
    }
  }

  private async calculateTransactionHash(tx: Transaction): Promise<string> {
    const canonicalTx = JSON.stringify(tx);
    return hash(canonicalTx);
  }

  // Get transactions for block production
  async getBlockTransactions(maxTransactions: number = 100, maxSizeBytes: number = 1000000): Promise<Transaction[]> {
    const blockTransactions: Transaction[] = [];
    let currentSize = 0;
    
    for (const txHash of this.sortedTxHashes) {
      if (blockTransactions.length >= maxTransactions) {
        break;
      }
      
      const tx = this.pendingTransactions.get(txHash)!;
      const txSize = JSON.stringify(tx).length;
      
      if (currentSize + txSize > maxSizeBytes) {
        break;
      }
      
      blockTransactions.push(tx);
      currentSize += txSize;
    }
    
    return blockTransactions;
  }

  // Check for conflicting transactions (same account with same nonce)
  async hasConflictingTransaction(tx: Transaction): Promise<boolean> {
    const accountTransactions = await this.getTransactionsByAccount(tx.body.signer_id);
    
    for (const existingTx of accountTransactions) {
      if (existingTx.body.nonce === tx.body.nonce) {
        return true;
      }
    }
    
    return false;
  }

  // Get mempool statistics
  async getStats(): Promise<{
    size: number;
    byAccount: Map<string, number>;
    oldestTimestamp: number;
    newestTimestamp: number;
  }> {
    const byAccount = new Map<string, number>();
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    
    for (const tx of this.pendingTransactions.values()) {
      // Count by account
      const count = byAccount.get(tx.body.signer_id) || 0;
      byAccount.set(tx.body.signer_id, count + 1);
      
      // Track timestamps
      if (tx.body.created_at < oldestTimestamp) {
        oldestTimestamp = tx.body.created_at;
      }
      if (tx.body.created_at > newestTimestamp) {
        newestTimestamp = tx.body.created_at;
      }
    }
    
    return {
      size: this.pendingTransactions.size,
      byAccount,
      oldestTimestamp,
      newestTimestamp
    };
  }

  // Remove old transactions (cleanup)
  async removeOldTransactions(maxAge: number = 3600000): Promise<number> { // 1 hour default
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [txHash, tx] of this.pendingTransactions.entries()) {
      if (now - tx.body.created_at > maxAge) {
        toRemove.push(txHash);
      }
    }
    
    for (const txHash of toRemove) {
      await this.remove(txHash);
    }
    
    return toRemove.length;
  }
}