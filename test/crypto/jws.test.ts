import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SahajError } from '../../src/errors';
import { JWS_HEADER_NAME, LocalRsaSigner, signRequestBody, verifyRequestBody } from '../../src/index';

/**
 * Detached RS256 JWS. Sign then verify must round-trip; verification must fail
 * closed on a tampered body, a wrong key, an `alg:none` downgrade, and a
 * re-serialized (attached) payload.
 */

function makeRsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    pkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    spkiPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const body = JSON.stringify({ ver: '1.1.2', txnid: 'abc', FIDataRange: { from: 'x', to: 'y' } });

describe('detached JWS sign and verify', () => {
  it('round-trips a signature over the plaintext body', async () => {
    const { pkcs8Pem, spkiPem } = makeRsaKeyPair();
    const signer = new LocalRsaSigner({ kid: 'fiu-key-1', privateKeyPkcs8Pem: pkcs8Pem });

    const jwsHeader = await signRequestBody(body, signer);

    expect(jwsHeader.split('.')).toHaveLength(3);
    expect(jwsHeader.split('.')[1]).toBe('');
    await expect(
      verifyRequestBody({ body, jwsHeader, resolvePublicKey: () => spkiPem }),
    ).resolves.toBeUndefined();
  });

  it('rejects a body that was altered after signing', async () => {
    const { pkcs8Pem, spkiPem } = makeRsaKeyPair();
    const signer = new LocalRsaSigner({ kid: 'fiu-key-1', privateKeyPkcs8Pem: pkcs8Pem });
    const jwsHeader = await signRequestBody(body, signer);

    await expect(
      verifyRequestBody({ body: `${body} `, jwsHeader, resolvePublicKey: () => spkiPem }),
    ).rejects.toThrow(SahajError);
  });

  it('rejects a signature verified against the wrong public key', async () => {
    const signerKeys = makeRsaKeyPair();
    const otherKeys = makeRsaKeyPair();
    const signer = new LocalRsaSigner({ kid: 'fiu-key-1', privateKeyPkcs8Pem: signerKeys.pkcs8Pem });
    const jwsHeader = await signRequestBody(body, signer);

    await expect(
      verifyRequestBody({ body, jwsHeader, resolvePublicKey: () => otherKeys.spkiPem }),
    ).rejects.toThrow(SahajError);
  });

  it('resolves the public key by the kid in the header', async () => {
    const { pkcs8Pem, spkiPem } = makeRsaKeyPair();
    const signer = new LocalRsaSigner({ kid: 'router-kid-42', privateKeyPkcs8Pem: pkcs8Pem });
    const jwsHeader = await signRequestBody(body, signer);

    let seenKid: string | undefined;
    await verifyRequestBody({
      body,
      jwsHeader,
      resolvePublicKey: (kid) => {
        seenKid = kid;
        return spkiPem;
      },
    });
    expect(seenKid).toBe('router-kid-42');
  });
});

describe('algorithm allow-list', () => {
  it('rejects an alg:none header (downgrade attack)', async () => {
    const { spkiPem } = makeRsaKeyPair();
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', b64: false, crit: ['b64'] })).toString(
      'base64url',
    );
    const forged = `${noneHeader}..`;

    await expect(
      verifyRequestBody({ body, jwsHeader: forged, resolvePublicKey: () => spkiPem }),
    ).rejects.toThrow(SahajError);
  });

  it('rejects an HS256 downgrade', async () => {
    const { spkiPem } = makeRsaKeyPair();
    const hsHeader = Buffer.from(JSON.stringify({ alg: 'HS256', b64: false, crit: ['b64'] })).toString(
      'base64url',
    );
    const forged = `${hsHeader}..deadbeef`;

    await expect(
      verifyRequestBody({ body, jwsHeader: forged, resolvePublicKey: () => spkiPem }),
    ).rejects.toThrow(SahajError);
  });

  it('rejects a header that is not the detached three-segment form', async () => {
    const { spkiPem } = makeRsaKeyPair();
    await expect(
      verifyRequestBody({ body, jwsHeader: 'not-a-jws', resolvePublicKey: () => spkiPem }),
    ).rejects.toThrow(SahajError);
  });

  it('rejects an RS256 header that omits the b64:false / crit:["b64"] extension', async () => {
    const { spkiPem } = makeRsaKeyPair();
    // A plausible-looking RS256 header but without the unencoded-payload markers.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k' })).toString('base64url');
    await expect(
      verifyRequestBody({ body, jwsHeader: `${header}..deadbeef`, resolvePublicKey: () => spkiPem }),
    ).rejects.toThrow(SahajError);
  });
});

describe('LocalRsaSigner', () => {
  it('rejects a PEM that is not a private key', () => {
    expect(() => new LocalRsaSigner({ kid: 'k', privateKeyPkcs8Pem: 'not a key' })).toThrow(SahajError);
  });

  it('exposes the header name the AA expects', () => {
    expect(JWS_HEADER_NAME).toBe('x-jws-signature');
  });
});
