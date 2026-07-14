import { ecdh as buildEcdh, weierstrass } from '@noble/curves/abstract/weierstrass.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { SahajError } from '../errors';
import type { DhCurve, EphemeralKeyPair } from './types';

/**
 * The Diffie-Hellman layer for the ReBIT FI encryption scheme.
 *
 * Two curve variants exist and neither is wire-compatible with the other:
 *
 * - `X25519`: RFC 7748 Montgomery form (ReBIT v2.0.0). Raw 32-byte keys,
 *   provided directly by @noble/curves.
 * - `Curve25519`: the same underlying curve expressed in short-Weierstrass EC
 *   form (the ReBIT v1.x default, produced by BouncyCastle
 *   `CustomNamedCurves.getByName("Curve25519")`). Keys travel as X.509
 *   SubjectPublicKeyInfo / PKCS#8 DER. We rebuild that exact curve here from its
 *   published parameters so the legacy ecosystem stays interoperable.
 *
 * Both paths yield a 32-byte ECDH shared secret: the affine X coordinate of the
 * shared point, matching what BouncyCastle's `KeyAgreement("ECDH")` returns.
 */

/**
 * Short-Weierstrass parameters for the BouncyCastle `Curve25519` named curve.
 *
 * These are Curve25519 (2^255 - 19 prime field, Montgomery A = 0x76d06) mapped
 * to short-Weierstrass form via x -> x + A/3. The values match
 * `org.bouncycastle.math.ec.custom.djb.Curve25519` exactly and the generator was
 * checked to satisfy y^2 = x^3 + a*x + b (mod p).
 */
const CURVE25519_WEIERSTRASS: {
  p: bigint;
  a: bigint;
  b: bigint;
  n: bigint;
  h: bigint;
  Gx: bigint;
  Gy: bigint;
} = {
  p: 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn,
  a: 0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa984914a144n,
  b: 0x7b425ed097b425ed097b425ed097b425ed097b425ed097b4260b5e9c7710c864n,
  n: 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn,
  h: 8n,
  Gx: 0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad245an,
  Gy: 0x20ae19a1b8a086b4e01edd2c7748d14c923d4d7e6d7c61b229e9c5a27eced3d9n,
};

const Curve25519Point = weierstrass(CURVE25519_WEIERSTRASS);
const curve25519Ecdh = buildEcdh(Curve25519Point);

/** Raw X25519 (Montgomery) public keys are 32 bytes; private scalars 32 bytes. */
const X25519_KEY_LENGTH = 32;

/**
 * OID 1.3.101.110 = X25519 (RFC 8410). A raw 32-byte X25519 public key wrapped in
 * a SubjectPublicKeyInfo has this fixed 12-byte prefix.
 */
const X25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

function requireCurve(curve: string): DhCurve {
  if (curve === 'Curve25519' || curve === 'X25519') {
    return curve;
  }
  throw new SahajError('KEY_MATERIAL_INVALID', { field: 'curve' });
}

/** Big-endian encode a field element as a fixed 32 bytes. */
function toFixed32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let remaining = value;
  for (let index = 31; index >= 0; index--) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
}

/**
 * Extract the raw 32-byte X25519 public key from whatever encoding a counterparty
 * sent: either the 32 raw bytes or a SubjectPublicKeyInfo DER wrapper.
 */
function normalizeX25519PublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === X25519_KEY_LENGTH) {
    return publicKey;
  }
  if (
    publicKey.length === X25519_SPKI_PREFIX.length + X25519_KEY_LENGTH &&
    X25519_SPKI_PREFIX.every((byte, index) => publicKey[index] === byte)
  ) {
    return publicKey.slice(X25519_SPKI_PREFIX.length);
  }
  throw new SahajError('KEY_MATERIAL_INVALID', { field: 'DHPublicKey' });
}

/**
 * Extract the uncompressed EC point (0x04 || X || Y, 65 bytes) from a legacy
 * Curve25519 public key. Accepts the raw point or an X.509 SubjectPublicKeyInfo
 * whose final 65 bytes are the point. We locate the point by its trailing
 * position rather than fully parsing the ASN.1, which keeps this dependency-free
 * while still validating the point against the curve during ECDH.
 */
function normalizeCurve25519PublicKey(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    return publicKey;
  }
  if (publicKey.length === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03)) {
    return Curve25519Point.fromBytes(publicKey).toBytes(false);
  }
  if (publicKey.length > 65) {
    const tail = publicKey.slice(publicKey.length - 65);
    if (tail[0] === 0x04) {
      return tail;
    }
  }
  throw new SahajError('KEY_MATERIAL_INVALID', { field: 'DHPublicKey' });
}

/** Validate a peer public key's length and curve before it ever reaches ECDH. */
export function assertPeerPublicKey(curve: DhCurve, publicKey: Uint8Array): void {
  if (curve === 'X25519') {
    normalizeX25519PublicKey(publicKey);
    return;
  }
  normalizeCurve25519PublicKey(publicKey);
}

/** Generate a fresh ephemeral keypair for one FI request. Never reuse across requests. */
export function generateEphemeralKeyPair(curve: DhCurve): EphemeralKeyPair {
  if (curve === 'X25519') {
    const pair = x25519.keygen();
    return { curve, privateKey: pair.secretKey, publicKey: pair.publicKey };
  }
  const pair = curve25519Ecdh.keygen();
  // Serialize the public key as an uncompressed EC point to match the legacy wire form.
  const uncompressed = Curve25519Point.fromBytes(pair.publicKey).toBytes(false);
  return { curve, privateKey: pair.secretKey, publicKey: uncompressed };
}

/**
 * Derive the 32-byte ECDH shared secret. Validates the curve and key length first
 * and fails closed on mismatch. The result is the affine X coordinate of the
 * shared point, matching BouncyCastle's `KeyAgreement("ECDH")`.
 */
export function deriveSharedSecret(
  curve: DhCurve,
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Uint8Array {
  if (privateKey.length !== 32) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'privateKey' });
  }

  if (curve === 'X25519') {
    const peer = normalizeX25519PublicKey(peerPublicKey);
    try {
      return x25519.getSharedSecret(privateKey, peer);
    } catch (cause) {
      throw new SahajError('DECRYPTION_FAILED', { cause });
    }
  }

  const peerPoint = normalizeCurve25519PublicKey(peerPublicKey);
  try {
    const scalar = bytesToBigInt(privateKey);
    const shared = Curve25519Point.fromBytes(peerPoint).multiply(scalar);
    return toFixed32(shared.toAffine().x);
  } catch (cause) {
    throw new SahajError('DECRYPTION_FAILED', { cause });
  }
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

/** Overwrite sensitive key bytes in place once they are no longer needed. */
export function zeroize(...buffers: Uint8Array[]): void {
  for (const buffer of buffers) {
    buffer.fill(0);
  }
}

export { requireCurve };
