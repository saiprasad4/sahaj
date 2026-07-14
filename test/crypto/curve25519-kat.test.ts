import { describe, expect, it } from 'vitest';
import { deriveSharedSecret } from '../../src/crypto/curves';

/**
 * Cross-implementation known-answer test for the legacy Curve25519 (short-
 * Weierstrass) ECDH path.
 *
 * The self-round-trip tests in curves.test.ts prove our two sides agree with each
 * other, but not that we agree with BouncyCastle / rahasya on the wire. Curve
 * mismatch is the ecosystem's number-one integration bug, so this path is only
 * truly proven by a vector from an independent implementation.
 *
 * To fill this in, generate a vector with Sahamati rahasya, or with BouncyCastle
 * KeyAgreement("ECDH", "BC") over CustomNamedCurves.getByName("Curve25519"):
 *   - ourPrivateKeyHex:        our 32-byte big-endian scalar
 *   - peerPublicKeyHex:        the counterparty uncompressed EC point (0x04 || X || Y, 65 bytes)
 *   - expectedSharedSecretHex: the 32-byte affine X coordinate that implementation returns
 * then delete the `.skip`. If it passes, the legacy path is interop-proven.
 */

const VECTOR = {
  ourPrivateKeyHex: '', // TODO: fill from an independent implementation
  peerPublicKeyHex: '', // TODO: 65-byte uncompressed point, 0x04-prefixed
  expectedSharedSecretHex: '', // TODO: 32-byte X coordinate
};

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let index = 0; index < out.length; index++) {
    out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('Curve25519 cross-implementation KAT', () => {
  // Skipped until an independent vector is dropped in above. See the file header.
  it.skip('matches an independent implementation shared secret', () => {
    const secret = deriveSharedSecret(
      'Curve25519',
      hexToBytes(VECTOR.ourPrivateKeyHex),
      hexToBytes(VECTOR.peerPublicKeyHex),
    );
    expect(bytesToHex(secret)).toBe(VECTOR.expectedSharedSecretHex.toLowerCase());
  });
});
