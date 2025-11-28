import * as nacl from 'tweetnacl';
import * as bs58 from 'bs58';

// Key pair generation
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateKeyPair(): KeyPair {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: encodePublicKey(keyPair.publicKey),
    privateKey: encodePrivateKey(keyPair.secretKey)
  };
}

// Encoding/decoding functions
export function encodePublicKey(publicKey: Uint8Array): string {
  return 'ed25519:' + bs58.encode(publicKey);
}

export function decodePublicKey(encodedKey: string): Uint8Array {
  if (!encodedKey.startsWith('ed25519:')) {
    throw new Error('Invalid public key format');
  }
  return bs58.decode(encodedKey.slice(8));
}

export function encodePrivateKey(privateKey: Uint8Array): string {
  return bs58.encode(privateKey);
}

export function decodePrivateKey(encodedKey: string): Uint8Array {
  return bs58.decode(encodedKey);
}

// Signing and verification
export function sign(message: string, privateKey: string): string {
  const decodedPrivateKey = decodePrivateKey(privateKey);
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, decodedPrivateKey);
  return bs58.encode(signature);
}

export function verify(message: string, signature: string, publicKey: string): boolean {
  try {
    const decodedPublicKey = decodePublicKey(publicKey);
    const decodedSignature = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(messageBytes, decodedSignature, decodedPublicKey);
  } catch (error) {
    return false;
  }
}

// Hash function (using SHA-256)
export function hash(data: string): string {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBytes = nacl.hash(dataBytes);
  return bs58.encode(hashBytes);
}

// Canonical JSON serialization for signatures
export function canonicalJsonStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// Transaction signing
export interface TransactionSignature {
  public_key: string;
  signature: string;
}

export function signTransaction(transactionBody: any, privateKey: string): TransactionSignature {
  const canonicalBody = canonicalJsonStringify(transactionBody);
  const signature = sign(canonicalBody, privateKey);
  
  // Extract public key from private key
  const keyPair = nacl.sign.keyPair.fromSecretKey(decodePrivateKey(privateKey));
  const publicKey = encodePublicKey(keyPair.publicKey);
  
  return {
    public_key: publicKey,
    signature
  };
}

export function verifyTransaction(transaction: any): boolean {
  const { body, signature } = transaction;
  const canonicalBody = canonicalJsonStringify(body);
  return verify(canonicalBody, signature.signature, signature.public_key);
}