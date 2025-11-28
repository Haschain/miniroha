import type { 
  Transaction, 
  TransactionBody, 
  Instruction, 
  ValidationError,
  Role
} from '../types';
import type { LevelDBStateStore } from '../state';
import { verifyTransaction } from '../crypto';

export class TransactionValidator {
  private lastNonces: Map<string, number> = new Map();

  constructor(private stateStore: LevelDBStateStore) {}

  async validateTransaction(tx: Transaction): Promise<ValidationError | null> {
    try {
      // 1. Verify signature
      if (!this.verifySignature(tx)) {
        return {
          code: 'INVALID_SIGNATURE',
          message: 'Transaction signature is invalid'
        };
      }

      // 2. Validate transaction body structure
      const bodyValidation = this.validateTransactionBody(tx.body);
      if (bodyValidation) {
        return bodyValidation;
      }

      // 3. Check nonce
      const nonceValidation = await this.validateNonce(tx.body);
      if (nonceValidation) {
        return nonceValidation;
      }

      // 4. Check permissions for each instruction
      const permissionValidation = await this.validatePermissions(tx);
      if (permissionValidation) {
        return permissionValidation;
      }

      // 5. Validate each instruction
      for (const instruction of tx.body.instructions) {
        const instructionValidation = await this.validateInstruction(instruction, tx.body.signer_id);
        if (instructionValidation) {
          return instructionValidation;
        }
      }

      return null; // Transaction is valid
    } catch (error) {
      return {
        code: 'VALIDATION_ERROR',
        message: `Transaction validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private verifySignature(tx: Transaction): boolean {
    try {
      return verifyTransaction(tx);
    } catch (error) {
      return false;
    }
  }

  private validateTransactionBody(body: TransactionBody): ValidationError | null {
    // Check required fields
    if (!body.chain_id) {
      return {
        code: 'MISSING_CHAIN_ID',
        message: 'Transaction body is missing chain_id'
      };
    }

    if (!body.signer_id) {
      return {
        code: 'MISSING_SIGNER_ID',
        message: 'Transaction body is missing signer_id'
      };
    }

    if (typeof body.nonce !== 'number' || body.nonce < 0) {
      return {
        code: 'INVALID_NONCE',
        message: 'Transaction nonce must be a non-negative number'
      };
    }

    if (!body.created_at || typeof body.created_at !== 'number') {
      return {
        code: 'INVALID_CREATED_AT',
        message: 'Transaction created_at must be a valid timestamp'
      };
    }

    if (!Array.isArray(body.instructions) || body.instructions.length === 0) {
      return {
        code: 'INVALID_INSTRUCTIONS',
        message: 'Transaction must contain at least one instruction'
      };
    }

    // Validate signer account format
    const [name, domain] = body.signer_id.split('@');
    if (!name || !domain) {
      return {
        code: 'INVALID_SIGNER_FORMAT',
        message: 'Signer ID must be in format: name@domain'
      };
    }

    return null;
  }

  private async validateNonce(body: TransactionBody): Promise<ValidationError | null> {
    const lastNonce = this.lastNonces.get(body.signer_id) || 0;
    
    if (body.nonce <= lastNonce) {
      return {
        code: 'INVALID_NONCE',
        message: `Nonce ${body.nonce} must be greater than last nonce ${lastNonce}`
      };
    }

    return null;
  }

  private async validatePermissions(tx: Transaction): Promise<ValidationError | null> {
    const signerId = tx.body.signer_id;
    
    // Get account roles
    const accountRoles = await this.stateStore.getAccountRoles(signerId);
    
    // Aggregate permissions from all roles
    const permissions = new Set<string>();
    
    for (const roleId of accountRoles) {
      const role = await this.stateStore.getRole(roleId);
      if (role) {
        for (const permission of role.permissions) {
          if (permission === '*') {
            // Admin role - all permissions
            return null;
          }
          permissions.add(permission);
        }
      }
    }

    // Check each instruction against permissions
    for (const instruction of tx.body.instructions) {
      const requiredPermission = this.getRequiredPermission(instruction);
      
      if (!permissions.has('*') && !permissions.has(requiredPermission)) {
        return {
          code: 'PERMISSION_DENIED',
          message: `Signer ${signerId} does not have permission ${requiredPermission} for instruction ${instruction.type}`
        };
      }
    }

    return null;
  }

  private getRequiredPermission(instruction: Instruction): string {
    switch (instruction.type) {
      case 'RegisterDomain':
        return 'RegisterDomain';
      case 'RegisterAccount':
        return 'RegisterAccount';
      case 'RegisterAsset':
        return 'RegisterAsset';
      case 'MintAsset':
        return 'MintAsset';
      case 'BurnAsset':
        return 'BurnAsset';
      case 'TransferAsset':
        return 'TransferAsset';
      case 'GrantRole':
        return 'GrantRole';
      case 'RevokeRole':
        return 'RevokeRole';
      default:
        return 'Unknown';
    }
  }

  private async validateInstruction(instruction: Instruction, signerId: string): Promise<ValidationError | null> {
    try {
      switch (instruction.type) {
        case 'RegisterDomain':
          return this.validateRegisterDomain(instruction);
        case 'RegisterAccount':
          return this.validateRegisterAccount(instruction);
        case 'RegisterAsset':
          return this.validateRegisterAsset(instruction);
        case 'MintAsset':
          return this.validateMintAsset(instruction);
        case 'BurnAsset':
          return this.validateBurnAsset(instruction);
        case 'TransferAsset':
          return this.validateTransferAsset(instruction);
        case 'GrantRole':
          return this.validateGrantRole(instruction);
        case 'RevokeRole':
          return this.validateRevokeRole(instruction);
        default:
          return {
            code: 'UNKNOWN_INSTRUCTION',
            message: `Unknown instruction type: ${(instruction as any).type}`
          };
      }
    } catch (error) {
      return {
        code: 'INSTRUCTION_VALIDATION_ERROR',
        message: `Instruction validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private validateRegisterDomain(instruction: any): ValidationError | null {
    if (!instruction.id || typeof instruction.id !== 'string') {
      return {
        code: 'INVALID_DOMAIN_ID',
        message: 'RegisterDomain instruction requires a valid id'
      };
    }

    if (instruction.id.length === 0 || instruction.id.length > 64) {
      return {
        code: 'INVALID_DOMAIN_LENGTH',
        message: 'Domain ID must be between 1 and 64 characters'
      };
    }

    return null;
  }

  private validateRegisterAccount(instruction: any): ValidationError | null {
    if (!instruction.id || typeof instruction.id !== 'string') {
      return {
        code: 'INVALID_ACCOUNT_ID',
        message: 'RegisterAccount instruction requires a valid id'
      };
    }

    if (!instruction.public_key || typeof instruction.public_key !== 'string') {
      return {
        code: 'INVALID_PUBLIC_KEY',
        message: 'RegisterAccount instruction requires a valid public_key'
      };
    }

    // Validate account format (name@domain)
    const [name, domain] = instruction.id.split('@');
    if (!name || !domain) {
      return {
        code: 'INVALID_ACCOUNT_FORMAT',
        message: 'Account ID must be in format: name@domain'
      };
    }

    return null;
  }

  private validateRegisterAsset(instruction: any): ValidationError | null {
    if (!instruction.id || typeof instruction.id !== 'string') {
      return {
        code: 'INVALID_ASSET_ID',
        message: 'RegisterAsset instruction requires a valid id'
      };
    }

    if (typeof instruction.precision !== 'number' || instruction.precision < 0 || instruction.precision > 18) {
      return {
        code: 'INVALID_PRECISION',
        message: 'Asset precision must be a number between 0 and 18'
      };
    }

    // Validate asset format (asset_id#domain)
    const [assetId, domain] = instruction.id.split('#');
    if (!assetId || !domain) {
      return {
        code: 'INVALID_ASSET_FORMAT',
        message: 'Asset ID must be in format: asset_id#domain'
      };
    }

    return null;
  }

  private validateMintAsset(instruction: any): ValidationError | null {
    if (!instruction.asset_id || typeof instruction.asset_id !== 'string') {
      return {
        code: 'INVALID_ASSET_ID',
        message: 'MintAsset instruction requires a valid asset_id'
      };
    }

    if (!instruction.account_id || typeof instruction.account_id !== 'string') {
      return {
        code: 'INVALID_ACCOUNT_ID',
        message: 'MintAsset instruction requires a valid account_id'
      };
    }

    if (!instruction.amount || typeof instruction.amount !== 'string') {
      return {
        code: 'INVALID_AMOUNT',
        message: 'MintAsset instruction requires a valid amount'
      };
    }

    // Validate amount format
    if (!/^\d+(\.\d+)?$/.test(instruction.amount)) {
      return {
        code: 'INVALID_AMOUNT_FORMAT',
        message: 'Amount must be a valid positive number'
      };
    }

    return null;
  }

  private validateBurnAsset(instruction: any): ValidationError | null {
    if (!instruction.asset_id || typeof instruction.asset_id !== 'string') {
      return {
        code: 'INVALID_ASSET_ID',
        message: 'BurnAsset instruction requires a valid asset_id'
      };
    }

    if (!instruction.account_id || typeof instruction.account_id !== 'string') {
      return {
        code: 'INVALID_ACCOUNT_ID',
        message: 'BurnAsset instruction requires a valid account_id'
      };
    }

    if (!instruction.amount || typeof instruction.amount !== 'string') {
      return {
        code: 'INVALID_AMOUNT',
        message: 'BurnAsset instruction requires a valid amount'
      };
    }

    // Validate amount format
    if (!/^\d+(\.\d+)?$/.test(instruction.amount)) {
      return {
        code: 'INVALID_AMOUNT_FORMAT',
        message: 'Amount must be a valid positive number'
      };
    }

    return null;
  }

  private validateTransferAsset(instruction: any): ValidationError | null {
    if (!instruction.asset_id || typeof instruction.asset_id !== 'string') {
      return {
        code: 'INVALID_ASSET_ID',
        message: 'TransferAsset instruction requires a valid asset_id'
      };
    }

    if (!instruction.src_account || typeof instruction.src_account !== 'string') {
      return {
        code: 'INVALID_SRC_ACCOUNT',
        message: 'TransferAsset instruction requires a valid src_account'
      };
    }

    if (!instruction.dest_account || typeof instruction.dest_account !== 'string') {
      return {
        code: 'INVALID_DEST_ACCOUNT',
        message: 'TransferAsset instruction requires a valid dest_account'
      };
    }

    if (!instruction.amount || typeof instruction.amount !== 'string') {
      return {
        code: 'INVALID_AMOUNT',
        message: 'TransferAsset instruction requires a valid amount'
      };
    }

    // Validate amount format
    if (!/^\d+(\.\d+)?$/.test(instruction.amount)) {
      return {
        code: 'INVALID_AMOUNT_FORMAT',
        message: 'Amount must be a valid positive number'
      };
    }

    return null;
  }

  private validateGrantRole(instruction: any): ValidationError | null {
    if (!instruction.role_id || typeof instruction.role_id !== 'string') {
      return {
        code: 'INVALID_ROLE_ID',
        message: 'GrantRole instruction requires a valid role_id'
      };
    }

    if (!instruction.account_id || typeof instruction.account_id !== 'string') {
      return {
        code: 'INVALID_ACCOUNT_ID',
        message: 'GrantRole instruction requires a valid account_id'
      };
    }

    return null;
  }

  private validateRevokeRole(instruction: any): ValidationError | null {
    if (!instruction.role_id || typeof instruction.role_id !== 'string') {
      return {
        code: 'INVALID_ROLE_ID',
        message: 'RevokeRole instruction requires a valid role_id'
      };
    }

    if (!instruction.account_id || typeof instruction.account_id !== 'string') {
      return {
        code: 'INVALID_ACCOUNT_ID',
        message: 'RevokeRole instruction requires a valid account_id'
      };
    }

    return null;
  }

  // Update last nonce after successful transaction processing
  updateLastNonce(signerId: string, nonce: number): void {
    this.lastNonces.set(signerId, nonce);
  }
}