import { describe, expect, it } from 'vitest';
import { assertPeerPublicKey, deriveSharedSecret, generateEphemeralKeyPair } from '../../src/crypto/curves';
import { SahajError } from '../../src/errors';

/**
 * The DH layer. Both curve variants must produce a matching 32-byte shared secret
 * from either side, and curve/length validation must reject malformed keys before
 * any ECDH happens (the ecosystem's top integration bug).
 */

describe('X25519 (RFC 7748 Montgomery)', () => {
  it('generates 32-byte raw keys', () => {
    const pair = generateEphemeralKeyPair('X25519');
    expect(pair.privateKey.length).toBe(32);
    expect(pair.publicKey.length).toBe(32);
  });

  it('derives the same 32-byte secret from both sides', () => {
    const alice = generateEphemeralKeyPair('X25519');
    const bob = generateEphemeralKeyPair('X25519');

    const secretA = deriveSharedSecret('X25519', alice.privateKey, bob.publicKey);
    const secretB = deriveSharedSecret('X25519', bob.privateKey, alice.publicKey);

    expect(secretA.length).toBe(32);
    expect([...secretA]).toEqual([...secretB]);
  });
});

describe('Curve25519 (legacy short-Weierstrass)', () => {
  it('generates a 32-byte scalar and an uncompressed EC point public key', () => {
    const pair = generateEphemeralKeyPair('Curve25519');
    expect(pair.privateKey.length).toBe(32);
    expect(pair.publicKey.length).toBe(65);
    expect(pair.publicKey[0]).toBe(0x04);
  });

  it('derives the same 32-byte secret from both sides', () => {
    const alice = generateEphemeralKeyPair('Curve25519');
    const bob = generateEphemeralKeyPair('Curve25519');

    const secretA = deriveSharedSecret('Curve25519', alice.privateKey, bob.publicKey);
    const secretB = deriveSharedSecret('Curve25519', bob.privateKey, alice.publicKey);

    expect(secretA.length).toBe(32);
    expect([...secretA]).toEqual([...secretB]);
  });
});

describe('fresh material per request', () => {
  it('never repeats a keypair across calls', () => {
    const first = generateEphemeralKeyPair('X25519');
    const second = generateEphemeralKeyPair('X25519');
    expect([...first.privateKey]).not.toEqual([...second.privateKey]);
    expect([...first.publicKey]).not.toEqual([...second.publicKey]);
  });
});

describe('validation before ECDH', () => {
  it('rejects an X25519 public key of the wrong length', () => {
    expect(() => assertPeerPublicKey('X25519', new Uint8Array(31))).toThrow(SahajError);
  });

  it('rejects a Curve25519 public key that is not a recognisable point', () => {
    expect(() => assertPeerPublicKey('Curve25519', new Uint8Array(10))).toThrow(SahajError);
  });

  it('accepts a well-formed X25519 key', () => {
    const pair = generateEphemeralKeyPair('X25519');
    expect(() => assertPeerPublicKey('X25519', pair.publicKey)).not.toThrow();
  });

  it('rejects a private key of the wrong length in deriveSharedSecret', () => {
    const pair = generateEphemeralKeyPair('X25519');
    expect(() => deriveSharedSecret('X25519', new Uint8Array(16), pair.publicKey)).toThrow(SahajError);
  });
});
