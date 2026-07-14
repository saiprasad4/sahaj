import { describe, expect, it } from 'vitest';
import { CURVE25519_WEIERSTRASS } from '../../src/crypto/curves';

/**
 * Prove the hardcoded short-Weierstrass constants really are BouncyCastle's
 * Curve25519, rather than trusting four opaque hex blobs. We rederive a, b and the
 * base-point x from the Montgomery parameters (A = 486662, B = 1, p = 2^255 - 19)
 * through the standard map x = u + A/3, and check the generator satisfies the curve
 * equation. A wrong constant fails here, not in production against a real FIP.
 */

const P = CURVE25519_WEIERSTRASS.p;
const MONTGOMERY_A = 486662n;

function mod(value: bigint): bigint {
  return ((value % P) + P) % P;
}

function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let current = mod(base);
  let remaining = exponent;
  while (remaining > 0n) {
    if (remaining & 1n) {
      result = mod(result * current);
    }
    current = mod(current * current);
    remaining >>= 1n;
  }
  return result;
}

// Fermat inverse: x^(p-2) mod p, valid because p is prime.
function modInverse(value: bigint): bigint {
  return modPow(value, P - 2n);
}

describe('Curve25519 short-Weierstrass parameters', () => {
  it('uses the field prime 2^255 - 19', () => {
    expect(P).toBe(2n ** 255n - 19n);
  });

  it('rederives a = (3 - A^2) / 3 from the Montgomery A', () => {
    const a = mod((3n - MONTGOMERY_A * MONTGOMERY_A) * modInverse(3n));
    expect(a).toBe(CURVE25519_WEIERSTRASS.a);
  });

  it('rederives b = (2*A^3 - 9*A) / 27 from the Montgomery A', () => {
    const b = mod((2n * MONTGOMERY_A ** 3n - 9n * MONTGOMERY_A) * modInverse(27n));
    expect(b).toBe(CURVE25519_WEIERSTRASS.b);
  });

  it('rederives the base-point x from Montgomery u = 9 (x = u + A/3)', () => {
    const gx = mod(9n + MONTGOMERY_A * modInverse(3n));
    expect(gx).toBe(CURVE25519_WEIERSTRASS.Gx);
  });

  it('places the generator on the curve: Gy^2 == Gx^3 + a*Gx + b', () => {
    const { a, b, Gx, Gy } = CURVE25519_WEIERSTRASS;
    const lhs = mod(Gy * Gy);
    const rhs = mod(Gx * Gx * Gx + a * Gx + b);
    expect(lhs).toBe(rhs);
  });

  it('uses the published Curve25519 group order and cofactor 8', () => {
    // The standard order l = 2^252 + 27742317777372353535851937790883648493.
    const order = 2n ** 252n + 27742317777372353535851937790883648493n;
    expect(CURVE25519_WEIERSTRASS.n).toBe(order);
    expect(CURVE25519_WEIERSTRASS.h).toBe(8n);
  });
});
