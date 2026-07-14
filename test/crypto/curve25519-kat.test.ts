import { describe, expect, it } from 'vitest';
import { deriveSharedSecret } from '../../src/crypto/curves';

/**
 * Cross-implementation known-answer test for the legacy Curve25519 (short-
 * Weierstrass) ECDH path.
 *
 * The self-round-trip tests in curves.test.ts prove our two sides agree with each
 * other, but not that our point arithmetic and encoding match an independent
 * implementation. Curve mismatch is the ecosystem's number-one integration bug, so
 * that gap is worth closing directly.
 *
 * This vector was produced by scripts/curve25519-kat-oracle.py: a from-scratch
 * pure-Python EC implementation that shares no code with @noble/curves or this SDK.
 * It confirms our decode-point, big-endian-scalar, multiply, and affine-X-encode
 * steps all follow the standard ECDH convention (shared secret = affine X of
 * d*Q, big-endian, field-size padded), which is what BouncyCastle's
 * KeyAgreement("ECDH") over Curve25519 returns.
 *
 * A vector captured from a live Setu FIP or Sahamati rahasya would add the final
 * on-the-wire confirmation; regenerate with the oracle to verify this one:
 *   python3 scripts/curve25519-kat-oracle.py
 */

const VECTOR = {
  ourPrivateKeyHex: '01e2d3c4b5a69788796a5b4c3d2e1eff554b6a709ab1f3ff81053fdf994a8bac',
  peerPublicKeyHex:
    '046764d246c7b0e22e3a5ebdac7b8678e285c2a191dfb76c861dee702bc35642ef320133ea4fc3d3fb9d7b9f4aa08bbed4a26201efea32f17545a9278b44f61518',
  expectedSharedSecretHex: '71e66bd45d0af9da0224826cf69ee1c393bbffd26f6eecde80707bafc6cefeeb',
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
  it('matches an independent implementation shared secret', () => {
    const secret = deriveSharedSecret(
      'Curve25519',
      hexToBytes(VECTOR.ourPrivateKeyHex),
      hexToBytes(VECTOR.peerPublicKeyHex),
    );
    expect(bytesToHex(secret)).toBe(VECTOR.expectedSharedSecretHex);
  });
});
