import type { 
  Instruction, 
  RegisterDomain, 
  RegisterAccount, 
  RegisterAsset, 
  MintAsset, 
  BurnAsset, 
  TransferAsset, 
  GrantRole, 
  RevokeRole,
  Domain,
  Account,
  Asset,
  Balance,
  Role
} from '../types';
import type { LevelDBStateStore } from '../state';

export class InstructionEngine {
  constructor(private stateStore: LevelDBStateStore) {}

  async execute(instruction: Instruction, signerId: string): Promise<void> {
    switch (instruction.type) {
      case 'RegisterDomain':
        await this.handleRegisterDomain(instruction, signerId);
        break;
      case 'RegisterAccount':
        await this.handleRegisterAccount(instruction, signerId);
        break;
      case 'RegisterAsset':
        await this.handleRegisterAsset(instruction, signerId);
        break;
      case 'MintAsset':
        await this.handleMintAsset(instruction, signerId);
        break;
      case 'BurnAsset':
        await this.handleBurnAsset(instruction, signerId);
        break;
      case 'TransferAsset':
        await this.handleTransferAsset(instruction, signerId);
        break;
      case 'GrantRole':
        await this.handleGrantRole(instruction, signerId);
        break;
      case 'RevokeRole':
        await this.handleRevokeRole(instruction, signerId);
        break;
      default:
        throw new Error(`Unknown instruction type: ${(instruction as any).type}`);
    }
  }

  private async handleRegisterDomain(instruction: RegisterDomain, signerId: string): Promise<void> {
    // Check if domain already exists
    const existingDomain = await this.stateStore.getDomain(instruction.id);
    if (existingDomain) {
      throw new Error(`Domain ${instruction.id} already exists`);
    }

    const domain: Domain = {
      id: instruction.id,
      created_at: Date.now()
    };

    await this.stateStore.putDomain(domain);
  }

  private async handleRegisterAccount(instruction: RegisterAccount, signerId: string): Promise<void> {
    // Check if account already exists
    const existingAccount = await this.stateStore.getAccount(instruction.id);
    if (existingAccount) {
      throw new Error(`Account ${instruction.id} already exists`);
    }

    // Validate account format (name@domain)
    const [name, domain] = instruction.id.split('@');
    if (!name || !domain) {
      throw new Error(`Invalid account format: ${instruction.id}. Expected format: name@domain`);
    }

    // Check if domain exists
    const domainExists = await this.stateStore.getDomain(domain);
    if (!domainExists) {
      throw new Error(`Domain ${domain} does not exist`);
    }

    const account: Account = {
      id: instruction.id,
      public_key: instruction.public_key,
      roles: [],
      created_at: Date.now()
    };

    await this.stateStore.putAccount(account);
    // Initialize empty account roles
    await this.stateStore.putAccountRoles(instruction.id, []);
  }

  private async handleRegisterAsset(instruction: RegisterAsset, signerId: string): Promise<void> {
    // Check if asset already exists
    const existingAsset = await this.stateStore.getAsset(instruction.id);
    if (existingAsset) {
      throw new Error(`Asset ${instruction.id} already exists`);
    }

    // Validate asset format (asset_id#domain)
    const [assetId, domain] = instruction.id.split('#');
    if (!assetId || !domain) {
      throw new Error(`Invalid asset format: ${instruction.id}. Expected format: asset_id#domain`);
    }

    // Check if domain exists
    const domainExists = await this.stateStore.getDomain(domain);
    if (!domainExists) {
      throw new Error(`Domain ${domain} does not exist`);
    }

    if (instruction.precision < 0 || instruction.precision > 18) {
      throw new Error(`Asset precision must be between 0 and 18`);
    }

    const asset: Asset = {
      id: instruction.id,
      precision: instruction.precision,
      created_at: Date.now()
    };

    await this.stateStore.putAsset(asset);
  }

  private async handleMintAsset(instruction: MintAsset, signerId: string): Promise<void> {
    // Check if asset exists
    const asset = await this.stateStore.getAsset(instruction.asset_id);
    if (!asset) {
      throw new Error(`Asset ${instruction.asset_id} does not exist`);
    }

    // Check if account exists
    const account = await this.stateStore.getAccount(instruction.account_id);
    if (!account) {
      throw new Error(`Account ${instruction.account_id} does not exist`);
    }

    // Validate amount format
    const amount = this.validateAmount(instruction.amount, asset.precision);

    // Get current balance
    const currentBalance = await this.stateStore.getBalance(instruction.asset_id, instruction.account_id);
    const currentAmount = currentBalance ? BigInt(currentBalance.amount) : BigInt(0);

    const newBalance: Balance = {
      asset_id: instruction.asset_id,
      account_id: instruction.account_id,
      amount: (currentAmount + amount).toString()
    };

    await this.stateStore.putBalance(newBalance);
  }

  private async handleBurnAsset(instruction: BurnAsset, signerId: string): Promise<void> {
    // Check if asset exists
    const asset = await this.stateStore.getAsset(instruction.asset_id);
    if (!asset) {
      throw new Error(`Asset ${instruction.asset_id} does not exist`);
    }

    // Check if account exists
    const account = await this.stateStore.getAccount(instruction.account_id);
    if (!account) {
      throw new Error(`Account ${instruction.account_id} does not exist`);
    }

    // Validate amount format
    const amount = this.validateAmount(instruction.amount, asset.precision);

    // Get current balance
    const currentBalance = await this.stateStore.getBalance(instruction.asset_id, instruction.account_id);
    if (!currentBalance) {
      throw new Error(`Account ${instruction.account_id} has no balance of asset ${instruction.asset_id}`);
    }

    const currentAmount = BigInt(currentBalance.amount);
    if (currentAmount < amount) {
      throw new Error(`Insufficient balance. Current: ${currentAmount}, trying to burn: ${amount}`);
    }

    const newAmount = currentAmount - amount;
    if (newAmount === BigInt(0)) {
      // Remove balance if it becomes zero
      await this.stateStore.del(`balances/${instruction.asset_id}/${instruction.account_id}`);
    } else {
      const newBalance: Balance = {
        asset_id: instruction.asset_id,
        account_id: instruction.account_id,
        amount: newAmount.toString()
      };
      await this.stateStore.putBalance(newBalance);
    }
  }

  private async handleTransferAsset(instruction: TransferAsset, signerId: string): Promise<void> {
    // Check if asset exists
    const asset = await this.stateStore.getAsset(instruction.asset_id);
    if (!asset) {
      throw new Error(`Asset ${instruction.asset_id} does not exist`);
    }

    // Check if source account exists
    const srcAccount = await this.stateStore.getAccount(instruction.src_account);
    if (!srcAccount) {
      throw new Error(`Source account ${instruction.src_account} does not exist`);
    }

    // Check if destination account exists
    const destAccount = await this.stateStore.getAccount(instruction.dest_account);
    if (!destAccount) {
      throw new Error(`Destination account ${instruction.dest_account} does not exist`);
    }

    // Validate amount format
    const amount = this.validateAmount(instruction.amount, asset.precision);

    // Get source balance
    const srcBalance = await this.stateStore.getBalance(instruction.asset_id, instruction.src_account);
    if (!srcBalance) {
      throw new Error(`Source account ${instruction.src_account} has no balance of asset ${instruction.asset_id}`);
    }

    const srcAmount = BigInt(srcBalance.amount);
    if (srcAmount < amount) {
      throw new Error(`Insufficient balance. Current: ${srcAmount}, trying to transfer: ${amount}`);
    }

    // Update source balance
    const newSrcAmount = srcAmount - amount;
    if (newSrcAmount === BigInt(0)) {
      await this.stateStore.del(`balances/${instruction.asset_id}/${instruction.src_account}`);
    } else {
      const newSrcBalance: Balance = {
        asset_id: instruction.asset_id,
        account_id: instruction.src_account,
        amount: newSrcAmount.toString()
      };
      await this.stateStore.putBalance(newSrcBalance);
    }

    // Update destination balance
    const destBalance = await this.stateStore.getBalance(instruction.asset_id, instruction.dest_account);
    const destAmount = destBalance ? BigInt(destBalance.amount) : BigInt(0);
    const newDestBalance: Balance = {
      asset_id: instruction.asset_id,
      account_id: instruction.dest_account,
      amount: (destAmount + amount).toString()
    };
    await this.stateStore.putBalance(newDestBalance);
  }

  private async handleGrantRole(instruction: GrantRole, signerId: string): Promise<void> {
    // Check if role exists
    const role = await this.stateStore.getRole(instruction.role_id);
    if (!role) {
      throw new Error(`Role ${instruction.role_id} does not exist`);
    }

    // Check if account exists
    const account = await this.stateStore.getAccount(instruction.account_id);
    if (!account) {
      throw new Error(`Account ${instruction.account_id} does not exist`);
    }

    // Get current account roles
    const currentRoles = await this.stateStore.getAccountRoles(instruction.account_id);
    
    // Add role if not already present
    if (!currentRoles.includes(instruction.role_id)) {
      const updatedRoles = [...currentRoles, instruction.role_id];
      await this.stateStore.putAccountRoles(instruction.account_id, updatedRoles);
    }
  }

  private async handleRevokeRole(instruction: RevokeRole, signerId: string): Promise<void> {
    // Check if account exists
    const account = await this.stateStore.getAccount(instruction.account_id);
    if (!account) {
      throw new Error(`Account ${instruction.account_id} does not exist`);
    }

    // Get current account roles
    const currentRoles = await this.stateStore.getAccountRoles(instruction.account_id);
    
    // Remove role if present
    if (currentRoles.includes(instruction.role_id)) {
      const updatedRoles = currentRoles.filter(role => role !== instruction.role_id);
      await this.stateStore.putAccountRoles(instruction.account_id, updatedRoles);
    }
  }

  private validateAmount(amount: string, precision: number): bigint {
    // Check if amount is a valid number
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    // Convert to smallest unit based on precision
    const parts = amount.split('.');
    let wholePart = parts[0];
    let fractionalPart = parts[1] || '';

    // Pad or truncate fractional part to match precision
    if (fractionalPart.length > precision) {
      throw new Error(`Amount ${amount} exceeds precision ${precision}`);
    }
    fractionalPart = fractionalPart.padEnd(precision, '0');

    const smallestUnit = wholePart + fractionalPart;
    return BigInt(smallestUnit);
  }
}