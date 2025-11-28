import { getStateStore } from './src/state';
import { TransactionMempool } from './src/mempool';
import { TransactionValidator } from './src/transaction';
import { BlockProducer } from './src/block';
import { ApiServer } from './src/api';
import { GenesisBootstrap } from './src/genesis';
import { BFTConsensus } from './src/consensus';
import { generateKeyPair } from './src/crypto';
import type { GenesisConfig } from './src/types';

class MinirohaNode {
  private stateStore = getStateStore('./miniroha-db');
  private mempool = new TransactionMempool(this.stateStore);
  private transactionValidator = new TransactionValidator(this.stateStore);
  private blockProducer: BlockProducer;
  private apiServer: ApiServer;
  private genesisBootstrap: GenesisBootstrap;
  private consensus?: BFTConsensus;
  private validatorKeys = generateKeyPair();
  private useBFTConsensus: boolean = false;

  constructor(options: { useBFTConsensus?: boolean } = {}) {
    this.useBFTConsensus = options.useBFTConsensus ?? false;
    
    this.blockProducer = new BlockProducer(
      this.stateStore,
      this.mempool,
      'node1', // Default validator ID
      this.validatorKeys.privateKey
    );
    this.apiServer = new ApiServer(
      this.stateStore,
      this.mempool,
      this.transactionValidator,
      this.blockProducer
    );
    this.genesisBootstrap = new GenesisBootstrap(this.stateStore, this.blockProducer);
  }

  async start(port: number = 3000): Promise<void> {
    try {
      console.log('🚀 Starting Miniroha Node...');
      
      // Check if blockchain is already bootstrapped
      const isBootstrapped = await this.genesisBootstrap.isBootstrapped();
      
      if (!isBootstrapped) {
        console.log('📦 Bootstrapping genesis block...');
        
        // Create sample genesis configuration
        const genesisConfig = this.genesisBootstrap.createSampleGenesisConfig();
        
        // Generate validator keys for this node
        const validatorKeys = generateKeyPair();
        
        // Update block producer with actual validator keys
        this.blockProducer = new BlockProducer(
          this.stateStore,
          this.mempool,
          'node1',
          validatorKeys.privateKey
        );
        
        // Update API server with new block producer
        this.apiServer = new ApiServer(
          this.stateStore,
          this.mempool,
          this.transactionValidator,
          this.blockProducer
        );
        
        // Bootstrap genesis
        await this.genesisBootstrap.bootstrap(genesisConfig);
        console.log('✅ Genesis block created successfully');
      } else {
        console.log('📚 Blockchain already bootstrapped');
        
        // Load existing chain ID
        const chainId = await this.genesisBootstrap.getChainId();
        console.log(`🔗 Chain ID: ${chainId}`);
      }

      // Start API server
      await this.apiServer.start(port);
      
      // Start block production
      if (this.useBFTConsensus) {
        // Phase 2: BFT Consensus
        this.startBFTConsensus();
      } else {
        // Phase 1: Simple block production
        this.startBlockProduction();
      }
      
      console.log(`🎉 Miniroha Node started successfully on port ${port}`);
      console.log('📊 API endpoints available:');
      console.log('   GET  /health - Health check');
      console.log('   GET  /info - Node information');
      console.log('   GET  /mempool - Mempool information');
      console.log('   POST /tx - Submit transaction');
      console.log('   GET  /query/domain/:id - Query domain');
      console.log('   GET  /query/account/:id - Query account');
      console.log('   GET  /query/asset/:id - Query asset');
      console.log('   GET  /query/balance/:assetId/:accountId - Query balance');
      console.log('   GET  /query/block/:height - Query block');
      console.log('   POST /consensus - Consensus messages (not yet implemented)');
      
    } catch (error) {
      console.error('❌ Failed to start Miniroha Node:', error);
      process.exit(1);
    }
  }

  private startBlockProduction(): void {
    // Simple block production for Phase 1
    console.log('📦 Starting simple block production (Phase 1)');
    setInterval(async () => {
      try {
        const mempoolSize = await this.mempool.size();
        if (mempoolSize > 0) {
          console.log(`🔨 Producing block with ${mempoolSize} transactions...`);
          
          const block = await this.blockProducer.produceBlock('miniroha-testnet');
          
          // Verify block before applying
          const isValid = await this.blockProducer.verifyBlock(block);
          if (isValid) {
            await this.blockProducer.applyBlock(block);
            console.log(`✅ Block ${block.header.height} produced and applied`);
          } else {
            console.error('❌ Block verification failed');
          }
        }
      } catch (error) {
        console.error('❌ Block production failed:', error);
      }
    }, 10000); // Produce block every 10 seconds if there are transactions
  }

  private startBFTConsensus(): void {
    console.log('🔐 Starting BFT Consensus (Phase 2)');
    
    this.consensus = new BFTConsensus(
      this.stateStore,
      this.blockProducer,
      'node1',
      this.validatorKeys.privateKey,
      {
        proposalTimeout: 3000,
        prevoteTimeout: 2000,
        precommitTimeout: 2000,
        blockInterval: 10000
      }
    );

    // Set up consensus event handlers
    this.consensus.onBlockCommit = async (block) => {
      console.log(`✅ Block ${block.header.height} committed via BFT consensus`);
    };

    // In a real implementation, this would broadcast to other nodes
    this.consensus.onBroadcast = async (message) => {
      console.log(`📡 Broadcasting ${message.type} for height ${message.height}, round ${message.round}`);
      // For single-node testing, we handle our own messages
      // In multi-node setup, this would send to other validators
    };

    // Start consensus
    this.consensus.start().catch(error => {
      console.error('❌ BFT Consensus failed to start:', error);
    });
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Miniroha Node...');
    if (this.consensus) {
      this.consensus.stop();
    }
    await this.stateStore.close();
    console.log('✅ Miniroha Node stopped');
  }

  getConsensusStats() {
    return this.consensus?.getStats();
  }
}

// Handle graceful shutdown
const useBFT = process.env.USE_BFT === 'true';
const node = new MinirohaNode({ useBFTConsensus: useBFT });

process.on('SIGINT', async () => {
  console.log('\n📡 Received SIGINT, shutting down gracefully...');
  await node.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📡 Received SIGTERM, shutting down gracefully...');
  await node.stop();
  process.exit(0);
});

// Start the node
const port = parseInt(process.env.PORT || '3000');
node.start(port).catch((error) => {
  console.error('❌ Failed to start node:', error);
  process.exit(1);
});

export { MinirohaNode };