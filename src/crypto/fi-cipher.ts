import { randomBytes } from 'node:crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { SahajError } from '../errors';
import { deriveSharedSecret, generateEphemeralKeyPair, zeroize } from './curves';
import type { DhCurve, EphemeralKeyPair } from './types';

/**
 * The ReBIT FI-payload cipher: ECDH -> HKDF-SHA256 -> AES-256-GCM.
 *
 * Every load-bearing parameter here is pinned from Sahamati's canonical `rahasya`
 * reference source, not the ReBIT PDF prose (several details, the nonce XOR and
 * the salt/IV partition below, exist only in the code, and implementing from the
 * PDF alone produces GCM MAC failures):
 *
 *   - Each side generates 32 CSPRNG nonce bytes, exchanged base64.
 *   - Combine by XOR: xored = ourNonce XOR theirNonce (32 bytes).
 *   - HKDF salt = xored[0..19] (20 bytes); GCM IV = xored[20..31] (12 bytes).
 *   - HKDF-SHA256, IKM = ECDH shared secret, info = empty, output 32-byte AES key.
 *   - AES-256-GCM, 12-byte IV, 128-bit tag appended to ciphertext.
 */

const NONCE_LENGTH = 32;
const SALT_LENGTH = 20;
const IV_LENGTH = 12;
const AES_KEY_LENGTH = 32;

/** The bytes one side must send the other so the counterparty can derive the same key. */
export interface OurKeyMaterial {
  readonly curve: DhCurve;
  readonly publicKey: Uint8Array;
  readonly nonce: Uint8Array;
}

/** Generate 32 fresh CSPRNG nonce bytes. Never reuse a nonce across FI requests. */
export function generateNonce(): Uint8Array {
  return new Uint8Array(randomBytes(NONCE_LENGTH));
}

/**
 * Fresh ephemeral keypair plus fresh nonce for one FI request. This is the object
 * an FIU sends to the FIP (as `KeyMaterial`) when requesting encrypted data.
 */
export function generateRequesterKeyMaterial(curve: DhCurve): {
  keyPair: EphemeralKeyPair;
  ourKeyMaterial: OurKeyMaterial;
} {
  const keyPair = generateEphemeralKeyPair(curve);
  const nonce = generateNonce();
  return {
    keyPair,
    ourKeyMaterial: { curve, publicKey: keyPair.publicKey, nonce },
  };
}

/** XOR two equal-length nonces. The result is order-independent (a XOR b == b XOR a). */
function xorNonces(ourNonce: Uint8Array, theirNonce: Uint8Array): Uint8Array {
  if (ourNonce.length !== NONCE_LENGTH || theirNonce.length !== NONCE_LENGTH) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'Nonce' });
  }
  const xored = new Uint8Array(NONCE_LENGTH);
  for (let index = 0; index < NONCE_LENGTH; index++) {
    xored[index] = (ourNonce[index] ?? 0) ^ (theirNonce[index] ?? 0);
  }
  return xored;
}

/**
 * Derive the 32-byte AES key and 12-byte IV from an ECDH shared secret and the two
 * exchanged nonces. Split out so the same derivation drives both encrypt and
 * decrypt, and so it can be exercised directly against known-answer vectors.
 */
export function deriveSessionKeyAndIv(
  sharedSecret: Uint8Array,
  ourNonce: Uint8Array,
  theirNonce: Uint8Array,
): { key: Uint8Array; iv: Uint8Array } {
  const xored = xorNonces(ourNonce, theirNonce);
  const salt = xored.slice(0, SALT_LENGTH);
  const iv = xored.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const key = hkdf(sha256, sharedSecret, salt, undefined, AES_KEY_LENGTH);
  return { key, iv };
}

/**
 * Encrypt an FI payload. Used mainly to build test vectors and to model the FIP
 * side; a real FIU only decrypts. The output is ciphertext with the 128-bit GCM
 * tag appended, exactly as ReBIT `encryptedFI` carries it.
 */
export function encryptFi(params: {
  curve: DhCurve;
  ourPrivateKey: Uint8Array;
  ourNonce: Uint8Array;
  peerPublicKey: Uint8Array;
  peerNonce: Uint8Array;
  plaintext: Uint8Array;
}): Uint8Array {
  const sharedSecret = deriveSharedSecret(params.curve, params.ourPrivateKey, params.peerPublicKey);
  const { key, iv } = deriveSessionKeyAndIv(sharedSecret, params.ourNonce, params.peerNonce);
  try {
    return gcm(key, iv).encrypt(params.plaintext);
  } finally {
    zeroize(sharedSecret, key);
  }
}

/**
 * Decrypt a ReBIT `encryptedFI` blob (ciphertext with appended 128-bit tag) using
 * our ephemeral private key and the FIP's returned public key and nonce. Fails
 * closed with DECRYPTION_FAILED on any GCM tag mismatch, which is what a curve or
 * key mismatch surfaces as.
 */
export function decryptFi(params: {
  curve: DhCurve;
  ourPrivateKey: Uint8Array;
  ourNonce: Uint8Array;
  peerPublicKey: Uint8Array;
  peerNonce: Uint8Array;
  ciphertextWithTag: Uint8Array;
}): Uint8Array {
  const sharedSecret = deriveSharedSecret(params.curve, params.ourPrivateKey, params.peerPublicKey);
  const { key, iv } = deriveSessionKeyAndIv(sharedSecret, params.ourNonce, params.peerNonce);
  try {
    return gcm(key, iv).decrypt(params.ciphertextWithTag);
  } catch (cause) {
    throw new SahajError('DECRYPTION_FAILED', { cause });
  } finally {
    zeroize(sharedSecret, key);
  }
}
