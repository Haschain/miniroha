
### Integration Test
```bash
$ miniroha % bun run examples/full-test.ts                
🚀 Miniroha Full Integration Test

🧹 Cleaned up test database

============================================================
🔷 1. Key Generation
============================================================
✅ Generated key pairs for: admin, alice, bob, treasury, validator, charlie
📋 Admin public key: ed25519:AgwaWtXzKiNUULkcuHERQH...

============================================================
🔷 2. Initialize Blockchain Components
============================================================
✅ Initialized: StateStore, InstructionEngine, TransactionValidator, Mempool, BlockProducer

============================================================
🔷 3. Genesis Bootstrap
============================================================
Bootstrapping genesis block...
Genesis block created and stored successfully
Chain ID: miniroha-test
Domains: 1
Accounts: 4
Assets: 2
Balances: 3
Roles: 3
Validators: 1
✅ Genesis block created at height 1
✅ Admin account exists: true
✅ Alice USD balance: 100000

============================================================
🔷 4. Test RegisterDomain
============================================================
✅ RegisterDomain (admin creates "finance" domain): Passed
✅ RegisterDomain (duplicate domain should fail): Correctly rejected - Domain finance already exists
📋 Finance domain exists: true

============================================================
🔷 5. Test RegisterAccount
============================================================
✅ RegisterAccount (admin creates charlie@finance): Passed
✅ RegisterAccount (duplicate account should fail): Correctly rejected - Account charlie@finance already exists
✅ RegisterAccount (non-existent domain should fail): Correctly rejected - Domain nonexistent does not exist
📋 Charlie account exists: true

============================================================
🔷 6. Test RegisterAsset
============================================================
✅ RegisterAsset (admin creates stock#finance): Passed
✅ RegisterAsset (duplicate asset should fail): Correctly rejected - Asset stock#finance already exists
📋 Stock asset exists: true, precision: 0

============================================================
🔷 7. Test MintAsset
============================================================
✅ MintAsset (treasury mints 1000 USD to charlie): Passed
📋 Charlie USD balance after mint: 10000000
✅ MintAsset (user without permission should fail): Correctly rejected - Signer alice@root does not have permission MintAsset for instruction MintAsset

============================================================
🔷 8. Test TransferAsset
============================================================
✅ GrantRole (admin grants user role to charlie for transfer): Passed
✅ TransferAsset (alice transfers 100 USD to bob): Passed
📋 Alice USD after transfer: 90000
📋 Bob USD after transfer: 60000
✅ TransferAsset (insufficient balance should fail): Correctly rejected - Insufficient balance. Current: 90000, trying to transfer: 9999999900

============================================================
🔷 9. Test BurnAsset
============================================================
✅ BurnAsset (treasury burns 50 USD from charlie): Passed
📋 Charlie USD balance after burn: 9500000
✅ BurnAsset (user without permission should fail): Correctly rejected - Signer alice@root does not have permission BurnAsset for instruction BurnAsset
✅ BurnAsset (burn more than balance should fail): Correctly rejected - Insufficient balance. Current: 9500000, trying to burn: 9999999900

============================================================
🔷 10. Test GrantRole
============================================================
✅ GrantRole (admin grants issuer role to charlie): Passed
📋 Charlie roles after grant: ["user","issuer"]
✅ MintAsset (charlie with issuer role can now mint): Passed
📋 Charlie stock balance after self-mint: 500

============================================================
🔷 11. Test RevokeRole
============================================================
✅ RevokeRole (admin revokes issuer role from charlie): Passed
📋 Charlie roles after revoke: ["user"]
✅ MintAsset (charlie without issuer role should fail): Correctly rejected - Signer charlie@finance does not have permission MintAsset for instruction MintAsset

============================================================
🔷 12. Test Permission System
============================================================
✅ RegisterDomain (user without admin should fail): Correctly rejected - Signer alice@root does not have permission RegisterDomain for instruction RegisterDomain
✅ GrantRole (user without admin should fail): Correctly rejected - Signer alice@root does not have permission GrantRole for instruction GrantRole

============================================================
🔷 13. Test Block Production
============================================================
📋 Mempool size: 1
✅ Block produced at height 2 with 1 transactions
✅ Block applied successfully
📋 Mempool size after block: 0

============================================================
🔷 14. Test BFT Consensus
============================================================
[Consensus] Initialized with 1 validators
[Consensus] Starting at height 3
📋 Validators: 1, Quorum size: 1
📋 Proposer for height 1, round 0: node1
📋 Initial consensus state: height=3, round=0, step=propose
✅ Consensus stats: validators=1, quorum=1, isProposer=true

============================================================
🔷 Test Summary
============================================================

✅ Tests Passed: 22
❌ Tests Failed: 0
📊 Total Tests: 22

🎉 All tests passed! Miniroha is working correctly.
🧹 Cleaned up test database
```