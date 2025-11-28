import { generateKeyPair, signTransaction } from '../src/crypto';
import type { Transaction, Instruction } from '../src/types';

// Example: Create and submit transactions to the Miniroha blockchain

async function basicUsageExample() {
  console.log('🔐 Generating key pairs...');
  
  // Generate key pairs for different users
  const aliceKeys = generateKeyPair();
  const bobKeys = generateKeyPair();
  
  console.log('Alice Public Key:', aliceKeys.publicKey);
  console.log('Bob Public Key:', bobKeys.publicKey);
  
  // Example 1: Register a new domain
  console.log('\n📝 Creating RegisterDomain transaction...');
  const registerDomainTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'admin@root',
      nonce: 1,
      created_at: Date.now(),
      instructions: [{
        type: 'RegisterDomain',
        id: 'finance'
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by admin
      signature: ''  // Would be signed by admin
    }
  };
  
  // Example 2: Register a new account
  console.log('\n👤 Creating RegisterAccount transaction...');
  const registerAccountTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'admin@root',
      nonce: 2,
      created_at: Date.now(),
      instructions: [{
        type: 'RegisterAccount',
        id: 'charlie@finance',
        public_key: aliceKeys.publicKey
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by admin
      signature: ''  // Would be signed by admin
    }
  };
  
  // Example 3: Register a new asset
  console.log('\n💰 Creating RegisterAsset transaction...');
  const registerAssetTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'admin@root',
      nonce: 3,
      created_at: Date.now(),
      instructions: [{
        type: 'RegisterAsset',
        id: 'stock#finance',
        precision: 0
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by admin
      signature: ''  // Would be signed by admin
    }
  };
  
  // Example 4: Mint assets
  console.log('\n🏭 Creating MintAsset transaction...');
  const mintAssetTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'treasury@root',
      nonce: 1,
      created_at: Date.now(),
      instructions: [{
        type: 'MintAsset',
        asset_id: 'stock#finance',
        account_id: 'charlie@finance',
        amount: '1000'
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by treasury
      signature: ''  // Would be signed by treasury
    }
  };
  
  // Example 5: Transfer assets
  console.log('\n💸 Creating TransferAsset transaction...');
  const transferAssetTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'charlie@finance',
      nonce: 1,
      created_at: Date.now(),
      instructions: [{
        type: 'TransferAsset',
        asset_id: 'stock#finance',
        src_account: 'charlie@finance',
        dest_account: 'alice@root',
        amount: '100'
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by charlie
      signature: ''  // Would be signed by charlie
    }
  };
  
  // Example 6: Grant role
  console.log('\n👑 Creating GrantRole transaction...');
  const grantRoleTx: Transaction = {
    body: {
      chain_id: 'miniroha-testnet',
      signer_id: 'admin@root',
      nonce: 4,
      created_at: Date.now(),
      instructions: [{
        type: 'GrantRole',
        role_id: 'issuer',
        account_id: 'charlie@finance'
      } as Instruction]
    },
    signature: {
      public_key: '', // Would be signed by admin
      signature: ''  // Would be signed by admin
    }
  };
  
  console.log('\n📋 Transaction examples created:');
  console.log('1. RegisterDomain - Create "finance" domain');
  console.log('2. RegisterAccount - Create "charlie@finance" account');
  console.log('3. RegisterAsset - Create "stock#finance" asset');
  console.log('4. MintAsset - Mint 1000 stock for charlie');
  console.log('5. TransferAsset - Transfer 100 stock to alice');
  console.log('6. GrantRole - Grant issuer role to charlie');
  
  console.log('\n🌐 To submit these transactions, use the API:');
  console.log('curl -X POST http://localhost:3000/tx \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"tx": ' + JSON.stringify(registerDomainTx) + '}\'');
}

// API interaction examples
async function apiInteractionExamples() {
  console.log('\n🔗 API Interaction Examples:');
  
  console.log('\n1. Check node health:');
  console.log('curl http://localhost:3000/health');
  
  console.log('\n2. Get node info:');
  console.log('curl http://localhost:3000/info');
  
  console.log('\n3. Get mempool info:');
  console.log('curl http://localhost:3000/mempool');
  
  console.log('\n4. Query domain:');
  console.log('curl http://localhost:3000/query/domain/root');
  
  console.log('\n5. Query account:');
  console.log('curl http://localhost:3000/query/account/alice@root');
  
  console.log('\n6. Query asset:');
  console.log('curl http://localhost:3000/query/asset/usd#root');
  
  console.log('\n7. Query balance:');
  console.log('curl http://localhost:3000/query/balance/usd#root/alice@root');
  
  console.log('\n8. Query block:');
  console.log('curl http://localhost:3000/query/block/1');
}

// Run examples
async function runExamples() {
  console.log('🚀 Miniroha Blockchain Examples\n');
  
  await basicUsageExample();
  await apiInteractionExamples();
  
  console.log('\n✅ Examples completed!');
  console.log('\n💡 Tips:');
  console.log('- Start the node with: bun run index.ts');
  console.log('- The node will automatically create a genesis block on first run');
  console.log('- Transactions are processed every 10 seconds if there are pending transactions');
  console.log('- Use the API endpoints to interact with the blockchain');
}

if (import.meta.main) {
  runExamples().catch(console.error);
}

export { basicUsageExample, apiInteractionExamples };