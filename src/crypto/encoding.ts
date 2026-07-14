import { SahajError } from '../errors';

/**
 * Encoding helpers for the ReBIT wire formats: base64 for nonces and encryptedFI,
 * PEM for the legacy Curve25519 DHPublicKey.KeyValue, raw base64 for X25519.
 * Kept dependency-free (Node Buffer) and separate from the crypto so the
 * derivation code only ever sees bytes.
 */

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(value: string, field: string): Uint8Array {
  const trimmed = value.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  // Buffer.from silently drops invalid input, so re-encode and compare to catch garbage.
  if (decoded.toString('base64').replace(/=+$/, '') !== trimmed.replace(/=+$/, '')) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field });
  }
  return new Uint8Array(decoded);
}

const PEM_BODY = /-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/;

/**
 * Decode a PEM block to its DER bytes. The legacy Curve25519 DHPublicKey.KeyValue
 * arrives as a PEM SubjectPublicKeyInfo; raw base64 (no PEM header) is accepted too.
 */
export function pemOrBase64ToBytes(value: string, field: string): Uint8Array {
  const match = value.match(PEM_BODY);
  if (match?.[1]) {
    return base64ToBytes(match[1].replace(/\s+/g, ''), field);
  }
  return base64ToBytes(value.replace(/\s+/g, ''), field);
}

/** Wrap DER bytes in a PEM PUBLIC KEY block for the DHPublicKey.KeyValue field. */
export function bytesToPem(der: Uint8Array, label = 'PUBLIC KEY'): string {
  const base64 = bytesToBase64(der);
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}
