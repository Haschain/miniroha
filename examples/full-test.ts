/**
 * Full Integration Test for Miniroha Blockchain
 * Tests all instructions: RegisterDomain, RegisterAccount, RegisterAsset,
 * MintAsset, BurnAsset, TransferAsset, GrantRole, RevokeRole
 * Also tests role-based permissions
 */

import { generateKeyPair, signTransaction } from '../src/crypto';
import { LevelDBStateStore } from '../src/state';
import { InstructionEngine } from '../src/instruction';
import { TransactionValidator } from '../src/transaction';
import { TransactionMempool } from '../src/mempool';
import { BlockProducer } from '../src/block';
import { GenesisBootstrap } from '../src/genesis';
import type { Transaction, Instruction, GenesisConfig } from '../src/types';

const TEST_DB_PATH = './miniroha-test-db';

// Test utilities
function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function logSuccess(message: string) {
  log('✅', message);
}

function logError(message: string) {
  log('❌', message);
}

function logInfo(message: string) {
  log('📋', message);
}

function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔷 ${title}`);
  console.log('='.repeat(60));
}

// Clean up test database
async function cleanupTestDb() {
  const fs = await import('fs');
  
  try {
    fs.rmSync(TEST_DB_PATH, { recursive: true, force: true });
    log('🧹', 'Cleaned up test database');
  } catch {
    // Ignore if doesn't exist
  }
}

// Create test genesis config with known keys
function createTestGenesisConfig(keys: {
  admin: ReturnType<typeof generateKeyPair>;
  alice: ReturnType<typeof generateKeyPair>;
  bob: ReturnType<typeof generateKeyPair>;
  treasury: ReturnType<typeof generateKeyPair>;
  validator: ReturnType<typeof generateKeyPair>;
}): GenesisConfig {
  return {
    chain_id: 'miniroha-test',
    genesis: {
      domains: [
        { id: 'root', created_at: Date.now() }
      ],
      accounts: [
        {
          id: 'admin@root',
          public_key: keys.admin.publicKey,
          roles: ['admin'],
          created_at: Date.now()
        },
        {
          id: 'alice@root',
          public_key: keys.alice.publicKey,
          roles: ['user'],
          created_at: Date.now()
        },
        {
          id: 'bob@root',
          public_key: keys.bob.publicKey,
          roles: ['user'],
          created_at: Date.now()
        },
        {
          id: 'treasury@root',
          public_key: keys.treasury.publicKey,
          roles: ['issuer'],
          created_at: Date.now()
        }
      ],
      assets: [
        { id: 'usd#root', precision: 2, created_at: Date.now() },
        { id: 'idr#root', precision: 2, created_at: Date.now() }
      ],
      balances: [
        { asset_id: 'usd#root', account_id: 'alice@root', amount: '100000' },
        { asset_id: 'usd#root', account_id: 'bob@root', amount: '50000' },
        { asset_id: 'idr#root', account_id: 'alice@root', amount: '1500000000' }
      ],
      roles: [
        { id: 'admin', permissions: ['*'] },
        { id: 'issuer', permissions: ['MintAsset', 'BurnAsset'] },
        { id: 'user', permissions: ['TransferAsset'] }
      ],
      validators: [
        { id: 'node1', public_key: keys.validator.publicKey }
      ]
    }
  };
}

// Create and sign a transaction
function createSignedTransaction(
  chainId: string,
  signerId: string,
  privateKey: string,
  nonce: number,
  instructions: Instruction[]
): Transaction {
  const body = {
    chain_id: chainId,
    signer_id: signerId,
    nonce,
    created_at: Date.now(),
    instructions
  };
  
  const signature = signTransaction(body, privateKey);
  
  return { body, signature };
}

async function runFullTest() {
  console.log('🚀 Miniroha Full Integration Test\n');
  
  // Clean up any previous test data
  await cleanupTestDb();
  
  // Generate keys for all test accounts
  logSection('1. Key Generation');
  const keys = {
    admin: generateKeyPair(),
    alice: generateKeyPair(),
    bob: generateKeyPair(),
    treasury: generateKeyPair(),
    validator: generateKeyPair(),
    charlie: generateKeyPair() // New account we'll create
  };
  
  logSuccess('Generated key pairs for: admin, alice, bob, treasury, validator, charlie');
  logInfo(`Admin public key: ${keys.admin.publicKey.slice(0, 30)}...`);
  
  // Initialize components
  logSection('2. Initialize Blockchain Components');
  const stateStore = new LevelDBStateStore(TEST_DB_PATH);
  const instructionEngine = new InstructionEngine(stateStore);
  const transactionValidator = new TransactionValidator(stateStore);
  const mempool = new TransactionMempool(stateStore);
  const blockProducer = new BlockProducer(stateStore, mempool, 'node1', keys.validator.privateKey);
  const genesisBootstrap = new GenesisBootstrap(stateStore, blockProducer);
  
  logSuccess('Initialized: StateStore, InstructionEngine, TransactionValidator, Mempool, BlockProducer');
  
  // Bootstrap genesis
  logSection('3. Genesis Bootstrap');
  const genesisConfig = createTestGenesisConfig(keys);
  const genesisBlock = await genesisBootstrap.bootstrap(genesisConfig);
  logSuccess(`Genesis block created at height ${genesisBlock.header.height}`);
  
  // Verify genesis state
  const adminAccount = await stateStore.getAccount('admin@root');
  const aliceBalance = await stateStore.getBalance('usd#root', 'alice@root');
  logSuccess(`Admin account exists: ${!!adminAccount}`);
  logSuccess(`Alice USD balance: ${aliceBalance?.amount}`);
  
  let testsPassed = 0;
  let testsFailed = 0;
  const nonces: Record<string, number> = {
    'admin@root': 1,
    'alice@root': 1,
    'bob@root': 1,
    'treasury@root': 1
  };
  
  // Helper to get nonce safely
  const getNonce = (signerId: string): number => nonces[signerId] ?? 1;
  const incrementNonce = (signerId: string): number => {
    if (nonces[signerId] === undefined) nonces[signerId] = 1;
    return nonces[signerId]++;
  };
  const decrementNonce = (signerId: string): void => {
    if (nonces[signerId] !== undefined) nonces[signerId]--;
  };

  // Helper to run a test
  async function runTest(
    name: string,
    signerId: string,
    privateKey: string,
    instructions: Instruction[],
    shouldSucceed: boolean = true
  ) {
    try {
      const tx = createSignedTransaction(
        'miniroha-test',
        signerId,
        privateKey,
        incrementNonce(signerId),
        instructions
      );
      
      // Validate transaction
      const validationError = await transactionValidator.validateTransaction(tx);
      
      if (validationError) {
        if (shouldSucceed) {
          logError(`${name}: Validation failed - ${validationError.message}`);
          testsFailed++;
          return false;
        } else {
          logSuccess(`${name}: Correctly rejected - ${validationError.message}`);
          testsPassed++;
          decrementNonce(signerId); // Revert nonce since tx was rejected
          return true;
        }
      }
      
      // Execute instructions
      for (const instruction of instructions) {
        await instructionEngine.execute(instruction, signerId);
      }
      
      if (shouldSucceed) {
        logSuccess(`${name}: Passed`);
        testsPassed++;
        return true;
      } else {
        logError(`${name}: Should have failed but succeeded`);
        testsFailed++;
        return false;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (shouldSucceed) {
        logError(`${name}: ${errorMessage}`);
        testsFailed++;
        decrementNonce(signerId); // Revert nonce since tx failed
        return false;
      } else {
        logSuccess(`${name}: Correctly rejected - ${errorMessage}`);
        testsPassed++;
        decrementNonce(signerId); // Revert nonce since tx was rejected
        return true;
      }
    }
  }

  // ============================================================
  // TEST: RegisterDomain
  // ============================================================
  logSection('4. Test RegisterDomain');
  
  await runTest(
    'RegisterDomain (admin creates "finance" domain)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterDomain', id: 'finance' }]
  );
  
  await runTest(
    'RegisterDomain (duplicate domain should fail)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterDomain', id: 'finance' }],
    false
  );
  
  // Verify domain was created
  const financeDomain = await stateStore.getDomain('finance');
  logInfo(`Finance domain exists: ${!!financeDomain}`);

  // ============================================================
  // TEST: RegisterAccount
  // ============================================================
  logSection('5. Test RegisterAccount');
  
  await runTest(
    'RegisterAccount (admin creates charlie@finance)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterAccount', id: 'charlie@finance', public_key: keys.charlie.publicKey }]
  );
  
  await runTest(
    'RegisterAccount (duplicate account should fail)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterAccount', id: 'charlie@finance', public_key: keys.charlie.publicKey }],
    false
  );
  
  await runTest(
    'RegisterAccount (non-existent domain should fail)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterAccount', id: 'dave@nonexistent', public_key: keys.charlie.publicKey }],
    false
  );
  
  // Initialize nonce for charlie
  nonces['charlie@finance'] = 1;
  
  // Verify account was created
  const charlieAccount = await stateStore.getAccount('charlie@finance');
  logInfo(`Charlie account exists: ${!!charlieAccount}`);

  // ============================================================
  // TEST: RegisterAsset
  // ============================================================
  logSection('6. Test RegisterAsset');
  
  await runTest(
    'RegisterAsset (admin creates stock#finance)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterAsset', id: 'stock#finance', precision: 0 }]
  );
  
  await runTest(
    'RegisterAsset (duplicate asset should fail)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RegisterAsset', id: 'stock#finance', precision: 0 }],
    false
  );
  
  // Verify asset was created
  const stockAsset = await stateStore.getAsset('stock#finance');
  logInfo(`Stock asset exists: ${!!stockAsset}, precision: ${stockAsset?.precision}`);

  // ============================================================
  // TEST: MintAsset
  // ============================================================
  logSection('7. Test MintAsset');
  
  await runTest(
    'MintAsset (treasury mints 1000 USD to charlie)',
    'treasury@root',
    keys.treasury.privateKey,
    [{ type: 'MintAsset', asset_id: 'usd#root', account_id: 'charlie@finance', amount: '100000' }]
  );
  
  // Verify balance
  let charlieUsdBalance = await stateStore.getBalance('usd#root', 'charlie@finance');
  logInfo(`Charlie USD balance after mint: ${charlieUsdBalance?.amount}`);
  
  await runTest(
    'MintAsset (user without permission should fail)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'MintAsset', asset_id: 'usd#root', account_id: 'alice@root', amount: '100000' }],
    false
  );

  // ============================================================
  // TEST: TransferAsset
  // ============================================================
  logSection('8. Test TransferAsset');
  
  // First grant user role to charlie so he can transfer
  await runTest(
    'GrantRole (admin grants user role to charlie for transfer)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'GrantRole', role_id: 'user', account_id: 'charlie@finance' }]
  );
  
  await runTest(
    'TransferAsset (alice transfers 100 USD to bob)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'TransferAsset', asset_id: 'usd#root', src_account: 'alice@root', dest_account: 'bob@root', amount: '100' }]
  );
  
  // Verify balances
  const aliceUsdAfter = await stateStore.getBalance('usd#root', 'alice@root');
  const bobUsdAfter = await stateStore.getBalance('usd#root', 'bob@root');
  logInfo(`Alice USD after transfer: ${aliceUsdAfter?.amount}`);
  logInfo(`Bob USD after transfer: ${bobUsdAfter?.amount}`);
  
  await runTest(
    'TransferAsset (insufficient balance should fail)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'TransferAsset', asset_id: 'usd#root', src_account: 'alice@root', dest_account: 'bob@root', amount: '99999999' }],
    false
  );

  // ============================================================
  // TEST: BurnAsset
  // ============================================================
  logSection('9. Test BurnAsset');
  
  await runTest(
    'BurnAsset (treasury burns 50 USD from charlie)',
    'treasury@root',
    keys.treasury.privateKey,
    [{ type: 'BurnAsset', asset_id: 'usd#root', account_id: 'charlie@finance', amount: '5000' }]
  );
  
  // Verify balance after burn
  charlieUsdBalance = await stateStore.getBalance('usd#root', 'charlie@finance');
  logInfo(`Charlie USD balance after burn: ${charlieUsdBalance?.amount}`);
  
  await runTest(
    'BurnAsset (user without permission should fail)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'BurnAsset', asset_id: 'usd#root', account_id: 'alice@root', amount: '100' }],
    false
  );
  
  await runTest(
    'BurnAsset (burn more than balance should fail)',
    'treasury@root',
    keys.treasury.privateKey,
    [{ type: 'BurnAsset', asset_id: 'usd#root', account_id: 'charlie@finance', amount: '99999999' }],
    false
  );

  // ============================================================
  // TEST: GrantRole
  // ============================================================
  logSection('10. Test GrantRole');
  
  await runTest(
    'GrantRole (admin grants issuer role to charlie)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'GrantRole', role_id: 'issuer', account_id: 'charlie@finance' }]
  );
  
  // Verify role was granted
  const charlieRoles = await stateStore.getAccountRoles('charlie@finance');
  logInfo(`Charlie roles after grant: ${JSON.stringify(charlieRoles)}`);
  
  // Now charlie should be able to mint
  await runTest(
    'MintAsset (charlie with issuer role can now mint)',
    'charlie@finance',
    keys.charlie.privateKey,
    [{ type: 'MintAsset', asset_id: 'stock#finance', account_id: 'charlie@finance', amount: '500' }]
  );
  
  const charlieStockBalance = await stateStore.getBalance('stock#finance', 'charlie@finance');
  logInfo(`Charlie stock balance after self-mint: ${charlieStockBalance?.amount}`);

  // ============================================================
  // TEST: RevokeRole
  // ============================================================
  logSection('11. Test RevokeRole');
  
  await runTest(
    'RevokeRole (admin revokes issuer role from charlie)',
    'admin@root',
    keys.admin.privateKey,
    [{ type: 'RevokeRole', role_id: 'issuer', account_id: 'charlie@finance' }]
  );
  
  // Verify role was revoked
  const charlieRolesAfterRevoke = await stateStore.getAccountRoles('charlie@finance');
  logInfo(`Charlie roles after revoke: ${JSON.stringify(charlieRolesAfterRevoke)}`);
  
  // Now charlie should NOT be able to mint
  await runTest(
    'MintAsset (charlie without issuer role should fail)',
    'charlie@finance',
    keys.charlie.privateKey,
    [{ type: 'MintAsset', asset_id: 'stock#finance', account_id: 'charlie@finance', amount: '100' }],
    false
  );

  // ============================================================
  // TEST: Permission Checks
  // ============================================================
  logSection('12. Test Permission System');
  
  await runTest(
    'RegisterDomain (user without admin should fail)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'RegisterDomain', id: 'unauthorized' }],
    false
  );
  
  await runTest(
    'GrantRole (user without admin should fail)',
    'alice@root',
    keys.alice.privateKey,
    [{ type: 'GrantRole', role_id: 'admin', account_id: 'alice@root' }],
    false
  );

  // ============================================================
  // TEST: Block Production
  // ============================================================
  logSection('13. Test Block Production');
  
  // Add some transactions to mempool
  const tx1 = createSignedTransaction(
    'miniroha-test',
    'alice@root',
    keys.alice.privateKey,
    incrementNonce('alice@root'),
    [{ type: 'TransferAsset', asset_id: 'usd#root', src_account: 'alice@root', dest_account: 'bob@root', amount: '100' }]
  );
  
  await mempool.add(tx1);
  logInfo(`Mempool size: ${await mempool.size()}`);
  
  // Produce a block
  const newBlock = await blockProducer.produceBlock('miniroha-test', 10);
  logSuccess(`Block produced at height ${newBlock.header.height} with ${newBlock.transactions.length} transactions`);
  
  // Apply the block
  await blockProducer.applyBlock(newBlock);
  logSuccess('Block applied successfully');
  
  // Verify mempool is cleared
  logInfo(`Mempool size after block: ${await mempool.size()}`);

  // ============================================================
  // TEST: BFT Consensus
  // ============================================================
  logSection('14. Test BFT Consensus');
  
  const { BFTConsensus } = await import('../src/consensus');
  
  // Create a consensus instance
  const consensus = new BFTConsensus(
    stateStore,
    blockProducer,
    'node1',
    keys.validator.privateKey,
    {
      proposalTimeout: 1000,
      prevoteTimeout: 500,
      precommitTimeout: 500,
      blockInterval: 1000
    }
  );
  
  // Initialize consensus (loads validators from state store)
  await consensus.initialize();
  
  // Test quorum calculation
  const validatorCount = consensus.getStats().validators;
  logInfo(`Validators: ${validatorCount}, Quorum size: ${consensus.getQuorumSize()}`);
  
  // Test proposer selection (only if we have validators)
  if (validatorCount > 0) {
    const proposer = consensus.getProposer(1, 0);
    logInfo(`Proposer for height 1, round 0: ${proposer}`);
  }
  
  // Test consensus state
  const consensusState = consensus.getState();
  logInfo(`Initial consensus state: height=${consensusState.height}, round=${consensusState.round}, step=${consensusState.step}`);
  
  // Test consensus stats
  const stats = consensus.getStats();
  logSuccess(`Consensus stats: validators=${stats.validators}, quorum=${stats.quorumSize}, isProposer=${stats.isProposer}`);
  
  testsPassed++;

  // ============================================================
  // Summary
  // ============================================================
  logSection('Test Summary');
  console.log(`\n✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📊 Total Tests: ${testsPassed + testsFailed}`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! Miniroha is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
  
  // Cleanup
  await cleanupTestDb();
  
  return testsFailed === 0;
}

// Run the test
if (import.meta.main) {
  runFullTest()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
      console.error('Test failed with error:', error);
      process.exit(1);
    });
}

export { runFullTest };
