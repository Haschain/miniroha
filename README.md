# Miniroha - A Minimal Hyperledger Iroha 2-like Blockchain Engine

*A lightweight permissioned blockchain inspired by Hyperledger Iroha 2, built with Bun + TypeScript + LevelDB*

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start the blockchain node
bun run index.ts
```

The node will automatically:
1. Create a genesis block on first run
2. Start the API server on port 3000
3. Begin block production every 10 seconds (if there are pending transactions)

## 📋 Features

### ✅ Phase 1 - Core Ledger (Implemented)
- [x] LevelDB state storage
- [x] Ed25519 cryptographic signatures
- [x] Iroha-like instruction set
- [x] Role-based permissions
- [x] Signed transactions
- [x] Mempool management
- [x] Block production (simplified)
- [x] REST API for queries and transactions
- [x] Genesis bootstrapping

### ✅ Phase 2 - BFT Consensus (Implemented)
- [x] Tendermint-style Propose/PreVote/PreCommit consensus
- [x] Static validator set
- [x] Byzantine fault tolerance (tolerates f = (n-1)/3 faulty validators)
- [x] Quorum-based voting (requires 2f+1 votes)
- [x] Round-robin proposer selection
- [x] Timeout handling and round changes
- [ ] Multi-node networking (in progress)

### 🔮 Phase 3 - Hardening (Planned)
- [ ] State root hashes
- [ ] Transaction hash indexing
- [ ] CLI and wallet tools

## 🏗️ Architecture

### Core Components

1. **State Store** - LevelDB-based persistent storage
2. **Instruction Engine** - Processes blockchain instructions
3. **Transaction Validator** - Validates signatures, permissions, and structure
4. **Mempool** - Manages pending transactions
5. **Block Producer** - Creates and validates blocks
6. **BFT Consensus** - Tendermint-style Byzantine fault tolerant consensus
7. **API Server** - HTTP REST API using ElysiaJS
8. **Genesis Bootstrap** - Initializes the blockchain

### Data Model

```
domains/{domain_id}
accounts/{account_id}            // alice@finance
assets/{asset_id}                // idr#finance
balances/{asset_id}/{account_id}
roles/{role_id}
account_roles/{account_id}
blocks/{height}
blocks_by_hash/{hash}
txs/{tx_hash}
validators/{validator_id}
last_height
```

## 🔐 Identity & Cryptography

- **Algorithm**: Ed25519
- **Encoding**: Base58 for public keys and signatures
- **Account Format**: `name@domain`
- **Asset Format**: `asset_id#domain`

## 📦 Instruction Set

| Instruction | Description | Required Permission |
|-------------|-------------|-------------------|
| RegisterDomain | Create a new domain | RegisterDomain |
| RegisterAccount | Create a new account | RegisterAccount |
| RegisterAsset | Create a new asset | RegisterAsset |
| MintAsset | Create new asset units | MintAsset |
| BurnAsset | Destroy asset units | BurnAsset |
| TransferAsset | Transfer between accounts | TransferAsset |
| GrantRole | Assign role to account | GrantRole |
| RevokeRole | Remove role from account | RevokeRole |

## 🌐 API Endpoints

### Node Information
- `GET /health` - Health check
- `GET /info` - Node statistics
- `GET /mempool` - Mempool information

### Transactions
- `POST /tx` - Submit a transaction

### Queries
- `GET /query/domain/:id` - Query domain
- `GET /query/account/:id` - Query account
- `GET /query/asset/:id` - Query asset
- `GET /query/balance/:assetId/:accountId` - Query balance
- `GET /query/block/:height` - Query block

### Consensus (Phase 2)
- `POST /consensus` - Consensus messages

## 🔑 Default Roles & Permissions

### Admin
- Permissions: `["*"]` (all permissions)
- Default account: `admin@root`

### Issuer
- Permissions: `["MintAsset", "BurnAsset"]`
- Default account: `treasury@root`

### User
- Permissions: `["TransferAsset"]`
- Default accounts: `alice@root`, `bob@root`

## 💰 Default Assets & Balances

### Assets
- `usd#root` (precision: 2)
- `idr#root` (precision: 2)

### Initial Balances
- `alice@root`: 1000.00 USD, 15,000,000.00 IDR
- `bob@root`: 500.00 USD

## 📝 Usage Examples

### Submit a Transaction

```bash
curl -X POST http://localhost:3000/tx \
  -H "Content-Type: application/json" \
  -d '{
    "tx": {
      "body": {
        "chain_id": "miniroha-testnet",
        "signer_id": "alice@root",
        "nonce": 1,
        "created_at": 1635724800000,
        "instructions": [{
          "type": "TransferAsset",
          "asset_id": "usd#root",
          "src_account": "alice@root",
          "dest_account": "bob@root",
          "amount": "100.00"
        }]
      },
      "signature": {
        "public_key": "ed25519:...",
        "signature": "..."
      }
    }
  }'
```

### Query Account

```bash
curl http://localhost:3000/query/account/alice@root
```

### Query Balance

```bash
curl http://localhost:3000/query/balance/usd#root/alice@root
```

## 🧪 Development

### Project Structure

```
miniroha/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── crypto/         # Ed25519 cryptographic utilities
│   ├── state/          # LevelDB state store
│   ├── instruction/    # Instruction execution engine
│   ├── transaction/    # Transaction validation
│   ├── mempool/        # Transaction mempool
│   ├── block/          # Block production and validation
│   ├── consensus/      # BFT consensus engine
│   ├── api/            # REST API server
│   └── genesis/        # Genesis bootstrapping
├── examples/           # Usage examples and tests
└── index.ts           # Main application entry point
```

### Running Examples

```bash
# Run basic usage examples
bun run examples/basic-usage.ts
```

### Testing

```bash
# Run full integration tests (22 test cases)
bun run examples/full-test.ts
```

The test suite covers:
- Domain, Account, Asset registration
- MintAsset, BurnAsset, TransferAsset operations
- GrantRole, RevokeRole permissions
- Permission system validation
- Block production and application
- BFT Consensus initialization

## 🔐 BFT Consensus

Miniroha implements a Tendermint-style Byzantine Fault Tolerant (BFT) consensus algorithm.

### Consensus Flow

```
┌─────────┐    ┌─────────┐    ┌───────────┐    ┌────────┐
│ Propose │───▶│ PreVote │───▶│ PreCommit │───▶│ Commit │
└─────────┘    └─────────┘    └───────────┘    └────────┘
     │              │               │
     ▼              ▼               ▼
  Timeout       Timeout         Timeout
     │              │               │
     └──────────────┴───────────────┘
                    │
                    ▼
              Next Round
```

### Byzantine Fault Tolerance

- **Fault Tolerance**: Can tolerate up to `f = (n-1)/3` faulty validators
- **Quorum Size**: Requires `2f+1` votes (>2/3 of validators) for consensus
- **Safety**: No two honest validators will commit different blocks at the same height
- **Liveness**: Progress is guaranteed if >2/3 validators are honest and online

### Running with BFT Consensus

```bash
# Start node with BFT consensus enabled
USE_BFT=true bun run index.ts
```

### Consensus Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `proposalTimeout` | 3000ms | Time to wait for block proposal |
| `prevoteTimeout` | 2000ms | Time to wait for prevote quorum |
| `precommitTimeout` | 2000ms | Time to wait for precommit quorum |
| `blockInterval` | 10000ms | Time between block production |

## 🔧 Configuration

### Environment Variables
- `PORT` - API server port (default: 3000)
- `DB_PATH` - LevelDB database path (default: ./miniroha-db)
- `USE_BFT` - Enable BFT consensus (default: false)

### Genesis Configuration

The blockchain is initialized with a sample genesis configuration that includes:
- 1 domain (`root`)
- 4 accounts (`admin@root`, `alice@root`, `bob@root`, `treasury@root`)
- 2 assets (`usd#root`, `idr#root`)
- 3 roles (`admin`, `issuer`, `user`)
- 3 validators (`node1`, `node2`, `node3`)

## 🚨 Limitations (v1)

- No smart contracts or WASM execution
- No dynamic validator sets or staking
- No slashing or punishment mechanisms
- No gossip networking (simple direct RPC only)
- No privacy or zero-knowledge systems

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

Inspired by [Hyperledger Iroha 2](https://github.com/hyperledger/iroha), an enterprise-grade permissioned blockchain framework.

Built with:
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [LevelDB](https://github.com/Level/level) - Key-value storage
- [ElysiaJS](https://elysiajs.com/) - Modern web framework
- [TweetNaCl](https://tweetnacl.js.org/) - Cryptography library
