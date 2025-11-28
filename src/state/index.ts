import { Level } from 'level';
import type { StateStore } from '../types';

export class LevelDBStateStore implements StateStore {
  private db: Level;

  constructor(dbPath: string = './miniroha-db') {
    this.db = new Level(dbPath, { valueEncoding: 'json' });
  }

  async get(key: string): Promise<any> {
    try {
      return await this.db.get(key);
    } catch (error: any) {
      if (error.notFound) {
        return null;
      }
      throw error;
    }
  }

  async put(key: string, value: any): Promise<void> {
    await this.db.put(key, value);
  }

  async del(key: string): Promise<void> {
    await this.db.del(key);
  }

  async batch(operations: Array<{type: 'put' | 'del', key: string, value?: any}>): Promise<void> {
    const batch = this.db.batch();
    
    for (const op of operations) {
      if (op.type === 'put') {
        batch.put(op.key, op.value);
      } else if (op.type === 'del') {
        batch.del(op.key);
      }
    }
    
    await batch.write();
  }

  createReadStream(options?: any): NodeJS.ReadableStream {
    // @ts-ignore - LevelDB has createReadStream but TypeScript types might not include it
    return this.db.createReadStream(options);
  }

  // Helper methods for specific entity types
  async getDomain(domainId: string): Promise<any> {
    return this.get(`domains/${domainId}`);
  }

  async putDomain(domain: any): Promise<void> {
    await this.put(`domains/${domain.id}`, domain);
  }

  async getAccount(accountId: string): Promise<any> {
    return this.get(`accounts/${accountId}`);
  }

  async putAccount(account: any): Promise<void> {
    await this.put(`accounts/${account.id}`, account);
  }

  async getAsset(assetId: string): Promise<any> {
    return this.get(`assets/${assetId}`);
  }

  async putAsset(asset: any): Promise<void> {
    await this.put(`assets/${asset.id}`, asset);
  }

  async getBalance(assetId: string, accountId: string): Promise<any> {
    return this.get(`balances/${assetId}/${accountId}`);
  }

  async putBalance(balance: any): Promise<void> {
    await this.put(`balances/${balance.asset_id}/${balance.account_id}`, balance);
  }

  async getRole(roleId: string): Promise<any> {
    return this.get(`roles/${roleId}`);
  }

  async putRole(role: any): Promise<void> {
    await this.put(`roles/${role.id}`, role);
  }

  async getAccountRoles(accountId: string): Promise<string[]> {
    return this.get(`account_roles/${accountId}`) || [];
  }

  async putAccountRoles(accountId: string, roles: string[]): Promise<void> {
    await this.put(`account_roles/${accountId}`, roles);
  }

  async getBlock(height: number): Promise<any> {
    return this.get(`blocks/${height}`);
  }

  async putBlock(block: any): Promise<void> {
    await this.put(`blocks/${block.header.height}`, block);
    await this.put(`blocks_by_hash/${await this.calculateBlockHash(block)}`, block.header.height);
  }

  async getBlockByHash(hash: string): Promise<any> {
    const height = await this.get(`blocks_by_hash/${hash}`);
    if (height) {
      return this.getBlock(height);
    }
    return null;
  }

  async getTransaction(txHash: string): Promise<any> {
    return this.get(`txs/${txHash}`);
  }

  async putTransaction(tx: any, txHash: string): Promise<void> {
    await this.put(`txs/${txHash}`, tx);
  }

  async getValidator(validatorId: string): Promise<any> {
    return this.get(`validators/${validatorId}`);
  }

  async putValidator(validator: any): Promise<void> {
    await this.put(`validators/${validator.id}`, validator);
  }

  async getLastHeight(): Promise<number> {
    const height = await this.get('last_height');
    return height || 0;
  }

  async setLastHeight(height: number): Promise<void> {
    await this.put('last_height', height);
  }

  async calculateBlockHash(block: any): Promise<string> {
    const { hash } = await import('../crypto');
    return hash(JSON.stringify(block.header));
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

// Singleton instance for the application
let stateStore: LevelDBStateStore | null = null;

export function getStateStore(dbPath?: string): LevelDBStateStore {
  if (!stateStore) {
    stateStore = new LevelDBStateStore(dbPath);
  }
  return stateStore;
}