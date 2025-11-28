import { Elysia } from 'elysia';
import type { 
  SubmitTxRequest, 
  ConsensusRequest,
  Transaction,
  Block,
  Domain,
  Account,
  Asset,
  Balance,
  Role,
  Validator
} from '../types';
import type { LevelDBStateStore } from '../state';
import type { TransactionMempool } from '../mempool';
import type { TransactionValidator } from '../transaction';
import type { BlockProducer } from '../block';

export class ApiServer {
  private app: any;

  constructor(
    private stateStore: LevelDBStateStore,
    private mempool: TransactionMempool,
    private transactionValidator: TransactionValidator,
    private blockProducer: BlockProducer
  ) {
    this.app = new Elysia()
      .get('/health', () => ({ status: 'healthy' }))
      .get('/info', () => this.getInfo())
      .get('/mempool', () => this.getMempoolInfo())
      .post('/tx', ({ body }) => this.handleSubmitTx(body))
      .get('/query/domain/:id', ({ params: { id } }) => this.handleQuery('domain', id))
      .get('/query/account/:id', ({ params: { id } }) => this.handleQuery('account', id))
      .get('/query/asset/:id', ({ params: { id } }) => this.handleQuery('asset', id))
      .get('/query/balance/:assetId/:accountId', ({ params: { assetId, accountId } }) => this.handleQuery('balance', assetId, accountId))
      .get('/query/block/:height', ({ params: { height } }) => this.handleQuery('block', height))
      .post('/consensus', ({ body }) => this.handleConsensus(body));
  }

  async start(port: number = 3000): Promise<void> {
    console.log(`Miniroha API server starting on port ${port}`);
    
    await this.app.listen(port);
    
    console.log(`Miniroha API server started on port ${port}`);
  }

  private async handleSubmitTx(body: any): Promise<any> {
    try {
      if (!body.tx) {
        return {
          error: 'Invalid request',
          message: 'Transaction is required'
        };
      }

      // Validate transaction
      const validationError = await this.transactionValidator.validateTransaction(body.tx);
      if (validationError) {
        return {
          error: 'Transaction validation failed',
          details: validationError
        };
      }

      // Check for conflicting transactions
      const hasConflict = await this.mempool.hasConflictingTransaction(body.tx);
      if (hasConflict) {
        return {
          error: 'Conflicting transaction',
          message: 'Transaction with same nonce already exists in mempool'
        };
      }

      // Add to mempool
      await this.mempool.add(body.tx);

      // Calculate transaction hash
      const { hash } = await import('../crypto');
      const txHash = hash(JSON.stringify(body.tx));

      return {
        success: true,
        tx_hash: txHash,
        message: 'Transaction submitted to mempool'
      };
    } catch (error) {
      return {
        error: 'Failed to submit transaction',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async handleQuery(type: string, id: string, assetId?: string, accountId?: string): Promise<any> {
    try {
      let result: any;

      switch (type) {
        case 'domain':
          result = await this.stateStore.getDomain(id);
          break;

        case 'account':
          result = await this.stateStore.getAccount(id);
          if (result) {
            // Add account roles
            result.roles = await this.stateStore.getAccountRoles(id);
          }
          break;

        case 'asset':
          result = await this.stateStore.getAsset(id);
          break;

        case 'balance':
          if (!assetId || !accountId) {
            return {
              error: 'Invalid balance query',
              message: 'Expected format: /query/balance/{asset_id}/{account_id}'
            };
          }
          result = await this.stateStore.getBalance(assetId, accountId);
          break;

        case 'block':
          const height = parseInt(id);
          if (isNaN(height)) {
            return {
              error: 'Invalid block height',
              message: 'Block height must be a number'
            };
          }
          result = await this.stateStore.getBlock(height);
          break;

        default:
          return {
            error: 'Unknown query type',
            message: `Supported types: domain, account, asset, balance, block`
          };
      }

      if (!result) {
        return {
          error: 'Not found',
          message: `${type} not found`
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        error: 'Query failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async handleConsensus(body: any): Promise<any> {
    try {
      if (!body.message) {
        return {
          error: 'Invalid request',
          message: 'Consensus message is required'
        };
      }

      // TODO: Implement consensus message handling
      // This will be implemented in Phase 2 when we add BFT consensus
      
      return {
        success: true,
        message: 'Consensus message received (not yet implemented)'
      };
    } catch (error) {
      return {
        error: 'Failed to process consensus message',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getInfo(): Promise<any> {
    try {
      const stats = await this.blockProducer.getStats();
      const mempoolStats = await this.mempool.getStats();

      return {
        success: true,
        data: {
          blockchain: stats,
          mempool: {
            size: mempoolStats.size,
            oldestTimestamp: mempoolStats.oldestTimestamp,
            newestTimestamp: mempoolStats.newestTimestamp
          },
          version: '1.0.0'
        }
      };
    } catch (error) {
      return {
        error: 'Failed to get node info',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getMempoolInfo(): Promise<any> {
    try {
      const stats = await this.mempool.getStats();
      const pendingTxs = await this.mempool.getPending(10); // Get first 10 transactions

      return {
        success: true,
        data: {
          size: stats.size,
          byAccount: Object.fromEntries(stats.byAccount),
          oldestTimestamp: stats.oldestTimestamp,
          newestTimestamp: stats.newestTimestamp,
          pendingTransactions: pendingTxs.map(tx => ({
            hash: JSON.stringify(tx.body), // Simplified hash for demo
            signer: tx.body.signer_id,
            nonce: tx.body.nonce,
            instructionCount: tx.body.instructions.length,
            createdAt: tx.body.created_at
          }))
        }
      };
    } catch (error) {
      return {
        error: 'Failed to get mempool info',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}