import { SahajError } from '../errors';
import { requireCurve } from './curves';
import { base64ToBytes, bytesToBase64, bytesToPem, pemOrBase64ToBytes } from './encoding';
import type { DecodedKeyMaterial, DhCurve } from './types';

/**
 * The ReBIT `KeyMaterial` / `DHPublicKey` wire shape and the conversions between
 * it and decoded bytes. Note the deliberate ReBIT capitalisation (`DHPublicKey`,
 * `KeyValue`, `Nonce`, `Parameters`); the spec really is inconsistent and
 * counterparties match on these exact names.
 */

export interface DhPublicKeyJson {
  readonly expiry?: string;
  readonly Parameters?: string;
  readonly KeyValue: string;
}

export interface KeyMaterialJson {
  readonly cryptoAlg?: string;
  readonly curve?: string;
  readonly params?: string;
  readonly DHPublicKey: DhPublicKeyJson;
  readonly Nonce: string;
}

/** SubjectPublicKeyInfo DER prefix for a raw 32-byte X25519 key (OID 1.3.101.110). */
const X25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00,
]);

/**
 * Build the KeyMaterial JSON an FIU sends to a FIP. `publicKey` is the ephemeral
 * public key bytes (raw uncompressed point for Curve25519, raw 32 bytes for
 * X25519); it is wrapped in a PEM SubjectPublicKeyInfo for the wire, as the
 * ecosystem expects.
 */
export function buildKeyMaterialJson(params: {
  curve: DhCurve;
  publicKey: Uint8Array;
  nonce: Uint8Array;
  expiry: string;
}): KeyMaterialJson {
  const keyValue =
    params.curve === 'X25519' ? wrapX25519Spki(params.publicKey) : bytesToPem(params.publicKey);
  return {
    cryptoAlg: 'ECDH',
    curve: params.curve,
    params: '',
    DHPublicKey: {
      expiry: params.expiry,
      Parameters: '',
      KeyValue: keyValue,
    },
    Nonce: bytesToBase64(params.nonce),
  };
}

/** Wrap a raw 32-byte X25519 public key in a PEM SubjectPublicKeyInfo. */
function wrapX25519Spki(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'DHPublicKey' });
  }
  const der = new Uint8Array(X25519_SPKI_PREFIX.length + 32);
  der.set(X25519_SPKI_PREFIX, 0);
  der.set(publicKey, X25519_SPKI_PREFIX.length);
  return bytesToPem(der);
}

/**
 * Decode a FIP's returned KeyMaterial into raw bytes for key derivation. Validates
 * the curve, the presence of the public key, and the 32-byte nonce length before
 * anything reaches ECDH. Fails closed with KEY_MATERIAL_INVALID.
 */
export function parseKeyMaterialJson(json: KeyMaterialJson, fallbackCurve: DhCurve): DecodedKeyMaterial {
  if (!json?.DHPublicKey?.KeyValue) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'DHPublicKey' });
  }
  if (!json.Nonce) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'Nonce' });
  }

  const curve = json.curve ? requireCurve(json.curve) : fallbackCurve;
  const publicKey = pemOrBase64ToBytes(json.DHPublicKey.KeyValue, 'DHPublicKey');
  const nonce = base64ToBytes(json.Nonce, 'Nonce');
  if (nonce.length !== 32) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'Nonce' });
  }

  return { curve, publicKey, nonce };
}
