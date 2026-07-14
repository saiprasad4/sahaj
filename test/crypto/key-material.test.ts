import { describe, expect, it } from 'vitest';
import { generateEphemeralKeyPair } from '../../src/crypto/curves';
import { generateNonce } from '../../src/crypto/fi-cipher';
import { buildKeyMaterialJson, parseKeyMaterialJson } from '../../src/crypto/key-material';
import { SahajError } from '../../src/errors';
import type { DhCurve } from '../../src/index';

/**
 * The KeyMaterial bridge between the ReBIT wire JSON and decoded bytes. A built
 * KeyMaterial must parse back to the same public key and nonce, and malformed
 * counterparty material must be rejected before it reaches key derivation.
 */

const CURVES: DhCurve[] = ['X25519', 'Curve25519'];

describe.each(CURVES)('KeyMaterial round-trip on %s', (curve) => {
  it('builds JSON that parses back to the same key and nonce', () => {
    const keyPair = generateEphemeralKeyPair(curve);
    const nonce = generateNonce();

    const json = buildKeyMaterialJson({
      curve,
      publicKey: keyPair.publicKey,
      nonce,
      expiry: '2026-07-15T00:00:00Z',
    });

    expect(json.cryptoAlg).toBe('ECDH');
    expect(json.curve).toBe(curve);
    expect(json.DHPublicKey.KeyValue).toContain('BEGIN PUBLIC KEY');

    const decoded = parseKeyMaterialJson(json, curve);
    expect(decoded.curve).toBe(curve);
    expect([...decoded.nonce]).toEqual([...nonce]);
  });
});

describe('parseKeyMaterialJson validation', () => {
  it('rejects a missing DHPublicKey', () => {
    expect(() =>
      parseKeyMaterialJson(
        // biome-ignore lint/suspicious/noExplicitAny: exercising a malformed payload.
        { Nonce: Buffer.alloc(32).toString('base64') } as any,
        'X25519',
      ),
    ).toThrow(SahajError);
  });

  it('rejects a nonce that does not decode to 32 bytes', () => {
    const keyPair = generateEphemeralKeyPair('X25519');
    const json = buildKeyMaterialJson({
      curve: 'X25519',
      publicKey: keyPair.publicKey,
      nonce: generateNonce(),
      expiry: '2026-07-15T00:00:00Z',
    });
    const tampered = { ...json, Nonce: Buffer.alloc(16).toString('base64') };
    expect(() => parseKeyMaterialJson(tampered, 'X25519')).toThrow(SahajError);
  });

  it('rejects an unknown curve string', () => {
    const keyPair = generateEphemeralKeyPair('X25519');
    const json = buildKeyMaterialJson({
      curve: 'X25519',
      publicKey: keyPair.publicKey,
      nonce: generateNonce(),
      expiry: '2026-07-15T00:00:00Z',
    });
    const tampered = { ...json, curve: 'P-256' };
    expect(() => parseKeyMaterialJson(tampered, 'X25519')).toThrow(SahajError);
  });
});
