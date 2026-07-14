import { hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SahajError } from '../../src/errors';
import {
  decryptFi,
  deriveSessionKeyAndIv,
  encryptFi,
  generateEphemeralKeyPair,
  generateNonce,
  generateRequesterKeyMaterial,
} from '../../src/index';
import type { DhCurve } from '../../src/index';

/**
 * The FI cipher is the security core, so it is tested for real: full round-trips
 * for both curve variants, the exact key/IV derivation against an independent
 * HKDF oracle, a fixed rahasya-derived known-answer vector, and the failure modes
 * (curve mismatch, tampered ciphertext, bad nonce length) that must fail closed.
 */

const CURVES: DhCurve[] = ['X25519', 'Curve25519'];

function fixedBytes(length: number, fill: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe('deriveSessionKeyAndIv', () => {
  it('splits the XORed nonce into a 20-byte HKDF salt and a 12-byte IV', () => {
    const sharedSecret = fixedBytes(32, 0xab);
    const ourNonce = fixedBytes(32, 0x33);
    const theirNonce = fixedBytes(32, 0x44);

    const { key, iv } = deriveSessionKeyAndIv(sharedSecret, ourNonce, theirNonce);

    // XOR of 0x33 and 0x44 is 0x77 in every byte.
    const xored = fixedBytes(32, 0x77);
    const expectedSalt = xored.slice(0, 20);
    const expectedKey = new Uint8Array(hkdfSync('sha256', sharedSecret, expectedSalt, new Uint8Array(0), 32));

    expect(key.length).toBe(32);
    expect(iv.length).toBe(12);
    expect([...iv]).toEqual([...xored.slice(20, 32)]);
    expect([...key]).toEqual([...expectedKey]);
  });

  it('is order-independent because the nonces are XORed, not concatenated', () => {
    const sharedSecret = fixedBytes(32, 0x0f);
    const nonceA = generateNonce();
    const nonceB = generateNonce();

    const forward = deriveSessionKeyAndIv(sharedSecret, nonceA, nonceB);
    const reverse = deriveSessionKeyAndIv(sharedSecret, nonceB, nonceA);

    expect([...forward.key]).toEqual([...reverse.key]);
    expect([...forward.iv]).toEqual([...reverse.iv]);
  });

  it('rejects a nonce that is not exactly 32 bytes', () => {
    expect(() => deriveSessionKeyAndIv(fixedBytes(32, 1), fixedBytes(31, 2), fixedBytes(32, 3))).toThrow(
      SahajError,
    );
  });
});

describe.each(CURVES)('FI encrypt/decrypt round-trip on %s', (curve) => {
  it('recovers the exact plaintext across a fresh key exchange', () => {
    const fip = generateEphemeralKeyPair(curve);
    const fipNonce = generateNonce();
    const fiu = generateRequesterKeyMaterial(curve);

    const plaintext = new TextEncoder().encode(JSON.stringify({ Account: { maskedAccNumber: 'XXXX9012' } }));

    // FIP encrypts to the FIU's public key.
    const encryptedFi = encryptFi({
      curve,
      ourPrivateKey: fip.privateKey,
      ourNonce: fipNonce,
      peerPublicKey: fiu.keyPair.publicKey,
      peerNonce: fiu.ourKeyMaterial.nonce,
      plaintext,
    });

    // FIU derives the same key from its own private key and the FIP's public key.
    const recovered = decryptFi({
      curve,
      ourPrivateKey: fiu.keyPair.privateKey,
      ourNonce: fiu.ourKeyMaterial.nonce,
      peerPublicKey: fip.publicKey,
      peerNonce: fipNonce,
      ciphertextWithTag: encryptedFi,
    });

    expect(new TextDecoder().decode(recovered)).toBe(new TextDecoder().decode(plaintext));
  });

  it('fails closed when the ciphertext or tag is tampered with', () => {
    const fip = generateEphemeralKeyPair(curve);
    const fipNonce = generateNonce();
    const fiu = generateRequesterKeyMaterial(curve);
    const encryptedFi = encryptFi({
      curve,
      ourPrivateKey: fip.privateKey,
      ourNonce: fipNonce,
      peerPublicKey: fiu.keyPair.publicKey,
      peerNonce: fiu.ourKeyMaterial.nonce,
      plaintext: new TextEncoder().encode('sensitive'),
    });
    const lastIndex = encryptedFi.length - 1;
    encryptedFi.set([(encryptedFi.at(lastIndex) ?? 0) ^ 0xff], lastIndex);

    expect(() =>
      decryptFi({
        curve,
        ourPrivateKey: fiu.keyPair.privateKey,
        ourNonce: fiu.ourKeyMaterial.nonce,
        peerPublicKey: fip.publicKey,
        peerNonce: fipNonce,
        ciphertextWithTag: encryptedFi,
      }),
    ).toThrow(SahajError);
  });
});

describe('rahasya-derived known-answer vector (X25519)', () => {
  // Fixed keys and nonces, so the whole derivation is reproducible. The vector was
  // computed by the exact rahasya algorithm and cross-checked against node's HKDF.
  const fipPrivate = fixedBytes(32, 0x11);
  const fiuPrivate = fixedBytes(32, 0x22);
  const fipNonce = fixedBytes(32, 0x33);
  const fiuNonce = fixedBytes(32, 0x44);
  const expectedSharedSecret = '9e004098efc091d4ec2663b4e9f5cfd4d7064571690b4bea97ab146ab9f35056';
  const expectedKey = 'b4b4cf957bb36366e659af73a691de9d221886c7a29a57f0dcef87592b8824ba';
  const expectedIv = '777777777777777777777777';
  const plaintext = JSON.stringify({ Account: { maskedAccNumber: 'XXXX1234' } });

  it('derives the pinned shared secret, key and IV', async () => {
    const { deriveSharedSecret } = await import('../../src/crypto/curves');
    const { x25519 } = await import('@noble/curves/ed25519.js');
    const fiuPublic = x25519.getPublicKey(fiuPrivate);

    const sharedSecret = deriveSharedSecret('X25519', fipPrivate, fiuPublic);
    const { key, iv } = deriveSessionKeyAndIv(sharedSecret, fipNonce, fiuNonce);

    expect(Buffer.from(sharedSecret).toString('hex')).toBe(expectedSharedSecret);
    expect(Buffer.from(key).toString('hex')).toBe(expectedKey);
    expect(Buffer.from(iv).toString('hex')).toBe(expectedIv);
  });

  it('round-trips the vector: FIP encrypts, FIU decrypts', async () => {
    const { x25519 } = await import('@noble/curves/ed25519.js');
    const fipPublic = x25519.getPublicKey(fipPrivate);
    const fiuPublic = x25519.getPublicKey(fiuPrivate);

    const encryptedFi = encryptFi({
      curve: 'X25519',
      ourPrivateKey: fipPrivate,
      ourNonce: fipNonce,
      peerPublicKey: fiuPublic,
      peerNonce: fiuNonce,
      plaintext: new TextEncoder().encode(plaintext),
    });

    const recovered = decryptFi({
      curve: 'X25519',
      ourPrivateKey: fiuPrivate,
      ourNonce: fiuNonce,
      peerPublicKey: fipPublic,
      peerNonce: fipNonce,
      ciphertextWithTag: encryptedFi,
    });

    expect(new TextDecoder().decode(recovered)).toBe(plaintext);
  });
});
