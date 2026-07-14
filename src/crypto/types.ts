/**
 * Shared crypto types for the ReBIT Account Aggregator FI encryption scheme.
 *
 * Two non-interoperable Diffie-Hellman variants exist in the ecosystem and both
 * must be supported. The `curve` field on the exchanged KeyMaterial signals which
 * one a counterparty used, and getting it wrong is the ecosystem's most common
 * integration failure ("mac check in GCM failed"). See src/crypto/README notes and
 * the design docs for the full derivation.
 */

/**
 * The two DH curve variants ReBIT allows.
 *
 * - `Curve25519` is the ReBIT v1.x default: Curve25519 in short-Weierstrass EC
 *   form, exchanged as ~64-byte X.509 SubjectPublicKeyInfo / PKCS#8 keys.
 * - `X25519` is the RFC 7748 Montgomery form added in ReBIT v2.0.0, exchanged as
 *   raw 32-byte keys.
 *
 * The two forms are not wire-compatible: an X25519 public key cannot be used with
 * a Curve25519 private key and vice versa.
 */
export type DhCurve = 'Curve25519' | 'X25519';

/** A DH keypair for one FI request. Private key bytes are raw scalar bytes. */
export interface EphemeralKeyPair {
  readonly curve: DhCurve;
  /** Raw private scalar bytes. 32 bytes for both variants. Zeroize after use. */
  readonly privateKey: Uint8Array;
  /** Public key bytes. Raw 32 bytes for X25519, DER SubjectPublicKeyInfo for Curve25519. */
  readonly publicKey: Uint8Array;
}

/**
 * The KeyMaterial one side sends to the other, decoded into bytes. This mirrors
 * the ReBIT `KeyMaterial`/`DHPublicKey` JSON but holds decoded values rather than
 * base64/PEM strings, so the derivation code never touches encoding.
 */
export interface DecodedKeyMaterial {
  readonly curve: DhCurve;
  /** The counterparty public key bytes, already decoded from PEM or base64. */
  readonly publicKey: Uint8Array;
  /** The 32-byte nonce, already base64-decoded. */
  readonly nonce: Uint8Array;
}
