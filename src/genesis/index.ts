import type { 
  GenesisConfig, 
  Domain, 
  Account, 
  Asset, 
  Balance, 
  Role, 
  Validator,
  Block
} from '../types';
import type { LevelDBStateStore } from '../state';
import type { BlockProducer } from '../block';

export class GenesisBootstrap {
  constructor(
    private stateStore: LevelDBStateStore,
    private blockProducer: BlockProducer
  ) {}

  async bootstrap(genesisConfig: GenesisConfig): Promise<Block> {
    console.log('Bootstrapping genesis block...');

    // Validate genesis configuration
    this.validateGenesisConfig(genesisConfig);

    // Create batch operations for all genesis state
    const operations: Array<{type: 'put' | 'del', key: string, value?: any}> = [];

    // Store domains
    for (const domain of genesisConfig.genesis.domains) {
      operations.push({
        type: 'put',
        key: `domains/${domain.id}`,
        value: domain
      });
    }

    // Store accounts
    for (const account of genesisConfig.genesis.accounts) {
      operations.push({
        type: 'put',
        key: `accounts/${account.id}`,
        value: account
      });

      // Store account roles
      if (account.roles.length > 0) {
        operations.push({
          type: 'put',
          key: `account_roles/${account.id}`,
          value: account.roles
        });
      }
    }

    // Store assets
    for (const asset of genesisConfig.genesis.assets) {
      operations.push({
        type: 'put',
        key: `assets/${asset.id}`,
        value: asset
      });
    }

    // Store balances
    for (const balance of genesisConfig.genesis.balances) {
      operations.push({
        type: 'put',
        key: `balances/${balance.asset_id}/${balance.account_id}`,
        value: balance
      });
    }

    // Store roles
    for (const role of genesisConfig.genesis.roles) {
      operations.push({
        type: 'put',
        key: `roles/${role.id}`,
        value: role
      });
    }

    // Store validators
    for (const validator of genesisConfig.genesis.validators) {
      operations.push({
        type: 'put',
        key: `validators/${validator.id}`,
        value: validator
      });
    }

    // Store chain ID
    operations.push({
      type: 'put',
      key: 'chain_id',
      value: genesisConfig.chain_id
    });

    // Create and store genesis block
    const genesisBlock = await this.blockProducer.createGenesisBlock(genesisConfig);
    
    operations.push({
      type: 'put',
      key: `blocks/${genesisBlock.header.height}`,
      value: genesisBlock
    });

    // Store block by hash
    const { hash } = await import('../crypto');
    const blockHash = await hash(JSON.stringify(genesisBlock.header));
    operations.push({
      type: 'put',
      key: `blocks_by_hash/${blockHash}`,
      value: genesisBlock.header.height
    });

    // Set last height
    operations.push({
      type: 'put',
      key: 'last_height',
      value: genesisBlock.header.height
    });

    // Apply all operations in a batch
    await this.stateStore.batch(operations);

    console.log('Genesis block created and stored successfully');
    console.log(`Chain ID: ${genesisConfig.chain_id}`);
    console.log(`Domains: ${genesisConfig.genesis.domains.length}`);
    console.log(`Accounts: ${genesisConfig.genesis.accounts.length}`);
    console.log(`Assets: ${genesisConfig.genesis.assets.length}`);
    console.log(`Balances: ${genesisConfig.genesis.balances.length}`);
    console.log(`Roles: ${genesisConfig.genesis.roles.length}`);
    console.log(`Validators: ${genesisConfig.genesis.validators.length}`);

    return genesisBlock;
  }

  private validateGenesisConfig(genesisConfig: GenesisConfig): void {
    if (!genesisConfig.chain_id) {
      throw new Error('Genesis config must have a chain_id');
    }

    if (!genesisConfig.genesis) {
      throw new Error('Genesis config must have a genesis section');
    }

    const { genesis } = genesisConfig;

    // Validate domains
    const domainIds = new Set<string>();
    for (const domain of genesis.domains) {
      if (!domain.id) {
        throw new Error('Domain must have an id');
      }
      if (domainIds.has(domain.id)) {
        throw new Error(`Duplicate domain ID: ${domain.id}`);
      }
      domainIds.add(domain.id);
    }

    // Validate accounts
    const accountIds = new Set<string>();
    for (const account of genesis.accounts) {
      if (!account.id) {
        throw new Error('Account must have an id');
      }
      if (accountIds.has(account.id)) {
        throw new Error(`Duplicate account ID: ${account.id}`);
      }
      accountIds.add(account.id);

      // Validate account format (name@domain)
      const [name, domain] = account.id.split('@');
      if (!name || !domain) {
        throw new Error(`Invalid account format: ${account.id}. Expected format: name@domain`);
      }

      // Check if domain exists
      if (!domainIds.has(domain)) {
        throw new Error(`Account ${account.id} references non-existent domain ${domain}`);
      }

      if (!account.public_key) {
        throw new Error(`Account ${account.id} must have a public_key`);
      }

      if (!Array.isArray(account.roles)) {
        throw new Error(`Account ${account.id} must have a roles array`);
      }
    }

    // Validate roles first to collect all role IDs
    const roleIds = new Set<string>();
    for (const role of genesis.roles) {
      if (!role.id) {
        throw new Error('Role must have an id');
      }
      if (roleIds.has(role.id)) {
        throw new Error(`Duplicate role ID: ${role.id}`);
      }
      roleIds.add(role.id);

      if (!Array.isArray(role.permissions)) {
        throw new Error(`Role ${role.id} must have a permissions array`);
      }
    }

    // Validate assets
    const assetIds = new Set<string>();
    for (const asset of genesis.assets) {
      if (!asset.id) {
        throw new Error('Asset must have an id');
      }
      if (assetIds.has(asset.id)) {
        throw new Error(`Duplicate asset ID: ${asset.id}`);
      }
      assetIds.add(asset.id);

      // Validate asset format (asset_id#domain)
      const [assetId, domain] = asset.id.split('#');
      if (!assetId || !domain) {
        throw new Error(`Invalid asset format: ${asset.id}. Expected format: asset_id#domain`);
      }

      // Check if domain exists
      if (!domainIds.has(domain)) {
        throw new Error(`Asset ${asset.id} references non-existent domain ${domain}`);
      }

      if (typeof asset.precision !== 'number' || asset.precision < 0 || asset.precision > 18) {
        throw new Error(`Asset ${asset.id} must have precision between 0 and 18`);
      }
    }

    // Validate balances
    for (const balance of genesis.balances) {
      if (!balance.asset_id) {
        throw new Error('Balance must have an asset_id');
      }
      if (!balance.account_id) {
        throw new Error('Balance must have an account_id');
      }
      if (!balance.amount) {
        throw new Error('Balance must have an amount');
      }

      // Check if asset exists
      if (!assetIds.has(balance.asset_id)) {
        throw new Error(`Balance references non-existent asset ${balance.asset_id}`);
      }

      // Check if account exists
      if (!accountIds.has(balance.account_id)) {
        throw new Error(`Balance references non-existent account ${balance.account_id}`);
      }

      // Validate amount format
      if (!/^\d+(\.\d+)?$/.test(balance.amount)) {
        throw new Error(`Invalid amount format: ${balance.amount}`);
      }
    }

    // Check account role references after all roles are collected
    for (const account of genesis.accounts) {
      for (const accountRole of account.roles) {
        if (!roleIds.has(accountRole)) {
          throw new Error(`Account ${account.id} references non-existent role ${accountRole}`);
        }
      }
    }

    // Validate validators
    const validatorIds = new Set<string>();
    for (const validator of genesis.validators) {
      if (!validator.id) {
        throw new Error('Validator must have an id');
      }
      if (validatorIds.has(validator.id)) {
        throw new Error(`Duplicate validator ID: ${validator.id}`);
      }
      validatorIds.add(validator.id);

      if (!validator.public_key) {
        throw new Error(`Validator ${validator.id} must have a public_key`);
      }
    }

    // Ensure at least one validator
    if (genesis.validators.length === 0) {
      throw new Error('Genesis must have at least one validator');
    }

    // Ensure admin role exists
    const hasAdminRole = genesis.roles.some(role => role.id === 'admin');
    if (!hasAdminRole) {
      throw new Error('Genesis must have an admin role');
    }

    // Ensure at least one account has admin role
    const hasAdminAccount = genesis.accounts.some(account => account.roles.includes('admin'));
    if (!hasAdminAccount) {
      throw new Error('Genesis must have at least one account with admin role');
    }
  }

  async isBootstrapped(): Promise<boolean> {
    const lastHeight = await this.stateStore.getLastHeight();
    return lastHeight > 0;
  }

  async getChainId(): Promise<string | null> {
    return await this.stateStore.get('chain_id');
  }

  createSampleGenesisConfig(): GenesisConfig {
    const { generateKeyPair } = require('../crypto');
    
    // Generate keys for demo accounts
    const adminKeys = generateKeyPair();
    const userKeys = generateKeyPair();
    const issuerKeys = generateKeyPair();
    
    // Generate keys for validators
    const validatorKeys = Array.from({ length: 3 }, () => generateKeyPair());

    return {
      chain_id: 'miniroha-testnet',
      genesis: {
        domains: [
          { id: 'root', created_at: Date.now() }
        ],
        accounts: [
          {
            id: 'admin@root',
            public_key: adminKeys.publicKey,
            roles: ['admin'],
            created_at: Date.now()
          },
          {
            id: 'alice@root',
            public_key: userKeys.publicKey,
            roles: ['user'],
            created_at: Date.now()
          },
          {
            id: 'bob@root',
            public_key: userKeys.publicKey,
            roles: ['user'],
            created_at: Date.now()
          },
          {
            id: 'treasury@root',
            public_key: issuerKeys.publicKey,
            roles: ['issuer'],
            created_at: Date.now()
          }
        ],
        assets: [
          {
            id: 'usd#root',
            precision: 2,
            created_at: Date.now()
          },
          {
            id: 'idr#root',
            precision: 2,
            created_at: Date.now()
          }
        ],
        balances: [
          {
            asset_id: 'usd#root',
            account_id: 'alice@root',
            amount: '1000.00'
          },
          {
            asset_id: 'usd#root',
            account_id: 'bob@root',
            amount: '500.00'
          },
          {
            asset_id: 'idr#root',
            account_id: 'alice@root',
            amount: '15000000.00'
          }
        ],
        roles: [
          {
            id: 'admin',
            permissions: ['*']
          },
          {
            id: 'issuer',
            permissions: ['MintAsset', 'BurnAsset']
          },
          {
            id: 'user',
            permissions: ['TransferAsset']
          }
        ],
        validators: [
          {
            id: 'node1',
            public_key: validatorKeys[0].publicKey
          },
          {
            id: 'node2',
            public_key: validatorKeys[1].publicKey
          },
          {
            id: 'node3',
            public_key: validatorKeys[2].publicKey
          }
        ]
      }
    };
  }
}