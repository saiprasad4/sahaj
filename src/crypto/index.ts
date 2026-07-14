/**
 * The sahaj crypto core: the exact ReBIT/rahasya FI encryption and request-signing
 * scheme. ECDH (Curve25519 or X25519) -> HKDF-SHA256 -> AES-256-GCM for FI
 * payloads, and detached RS256 JWS for request signing. Everything runs on
 * customer infra; no key, shared secret, or decrypted payload leaves the process.
 */

export type { DhCurve, EphemeralKeyPair, DecodedKeyMaterial } from './types';
export {
  generateEphemeralKeyPair,
  deriveSharedSecret,
  assertPeerPublicKey,
  zeroize,
} from './curves';
export {
  generateNonce,
  generateRequesterKeyMaterial,
  deriveSessionKeyAndIv,
  encryptFi,
  decryptFi,
} from './fi-cipher';
export type { OurKeyMaterial } from './fi-cipher';
export {
  buildKeyMaterialJson,
  parseKeyMaterialJson,
} from './key-material';
export type { KeyMaterialJson, DhPublicKeyJson } from './key-material';
export {
  bytesToBase64,
  base64ToBytes,
  bytesToPem,
  pemOrBase64ToBytes,
} from './encoding';
export {
  LocalRsaSigner,
  signRequestBody,
  verifyRequestBody,
  JWS_HEADER_NAME,
} from './jws';
export type { JwsSigner } from './jws';
