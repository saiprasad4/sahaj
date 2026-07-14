import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SetuAdapter } from '../../src/adapters/setu';
import type { FetchLike } from '../../src/adapters/setu';
import { SahajError } from '../../src/errors';
import {
  type DhCurve,
  type KeyMaterialJson,
  LocalRsaSigner,
  buildKeyMaterialJson,
  encryptFi,
  generateEphemeralKeyPair,
  generateNonce,
  parseKeyMaterialJson,
  signRequestBody,
} from '../../src/index';
import type { RawDepositFi } from '../../src/models/deposit';

/**
 * The Setu adapter is driven by a stubbed HTTP client, so the whole consent ->
 * session -> fetch loop runs offline with the REAL crypto: the stub plays the FIP,
 * capturing the FIU's ephemeral public key from the /FI/request body and
 * encrypting fixture deposit data to it, exactly as a real FIP would. The adapter
 * then decrypts in-SDK. Live Setu is exercised separately, gated on credentials.
 */

function makeSigner() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return new LocalRsaSigner({
    kid: 'fiu-key-1',
    privateKeyPkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
}

function sampleDepositFi(): RawDepositFi {
  return {
    Account: {
      maskedAccNumber: 'XXXXXX4321',
      linkedAccRef: 'setu-fip-11223344',
      Profile: { Holders: { Holder: [{ name: 'Aarav Sharma', mobile: '9999999999', pan: 'ABCDE1234F' }] } },
      Summary: {
        currentBalance: '18250.75',
        currency: 'INR',
        balanceDateTime: '2026-06-01T09:30:00.000Z',
        type: 'SAVINGS',
        status: 'ACTIVE',
        branch: 'Koramangala',
        ifscCode: 'SETU0001234',
      },
      Transactions: {
        Transaction: [
          {
            txnId: 'T-0001',
            type: 'CREDIT',
            amount: '5000.00',
            currentBalance: '18250.75',
            valueDate: '2026-05-30',
            transactionTimestamp: '2026-05-30T10:00:00.000Z',
            narration: 'Salary credit',
            mode: 'NEFT',
            reference: 'REF001',
          },
        ],
      },
    },
  };
}

/**
 * Build a stub that answers the four ReBIT calls the adapter makes. For /FI/fetch
 * it acts as the FIP: it reads the FIU KeyMaterial that /FI/request carried, then
 * encrypts the fixture to the FIU public key so the adapter can decrypt it.
 */
function buildFipStub(options: {
  curve: DhCurve;
  fi?: RawDepositFi;
  fis?: RawDepositFi[];
  corruptCiphertext?: boolean;
}): FetchLike {
  let fiuKeyMaterial: KeyMaterialJson | undefined;

  return async (url, init) => {
    const path = url.slice(url.indexOf('/', 'https://'.length + 1));

    if (path === '/Consent' && init.method === 'POST') {
      return jsonResponse({ ver: '1.1.2', txnid: 't1', ConsentHandle: 'handle-123' });
    }

    if (path.startsWith('/Consent/handle/')) {
      return jsonResponse({ ver: '1.1.2', ConsentStatus: { id: 'consent-abc', status: 'ACTIVE' } });
    }

    if (path === '/FI/request' && init.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}');
      fiuKeyMaterial = body.KeyMaterial;
      return jsonResponse({ ver: '1.1.2', consentId: 'consent-abc', sessionId: 'session-xyz' });
    }

    if (path.startsWith('/FI/fetch/')) {
      if (!fiuKeyMaterial) {
        throw new Error('FI request must precede fetch');
      }
      const fiuDecoded = parseKeyMaterialJson(fiuKeyMaterial, options.curve);

      // The FIP generates its own ephemeral key + nonce and encrypts each account
      // block to the FIU under that one KeyMaterial, as a real FIP does per request.
      const fipKeyPair = generateEphemeralKeyPair(options.curve);
      const fipNonce = generateNonce();
      const payloads = options.fis ?? [options.fi ?? sampleDepositFi()];
      const dataBlocks = payloads.map((payload, index) => {
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const cipher = encryptFi({
          curve: options.curve,
          ourPrivateKey: fipKeyPair.privateKey,
          ourNonce: fipNonce,
          peerPublicKey: fiuDecoded.publicKey,
          peerNonce: fiuDecoded.nonce,
          plaintext,
        });
        if (options.corruptCiphertext && index === 0) {
          cipher.set([(cipher.at(0) ?? 0) ^ 0xff], 0);
        }
        return { linkRefNumber: payload.Account.linkedAccRef, encryptedFI: base64(cipher) };
      });

      const fipKeyMaterial = buildKeyMaterialJson({
        curve: options.curve,
        publicKey: fipKeyPair.publicKey,
        nonce: fipNonce,
        expiry: '2026-07-15T00:00:00Z',
      });

      return jsonResponse({
        ver: '1.1.2',
        status: 'COMPLETED',
        FI: [{ fipID: 'setu-fip', fipName: 'Setu FIP', KeyMaterial: fipKeyMaterial, data: dataBlocks }],
      });
    }

    throw new Error(`unexpected call ${init.method} ${path}`);
  };
}

function jsonResponse(payload: unknown) {
  return {
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function makeAdapter(overrides: Partial<Parameters<typeof buildFipStub>[0]> = {}) {
  const curve: DhCurve = overrides.curve ?? 'Curve25519';
  return new SetuAdapter({
    baseUrl: 'https://fiu-sandbox.setu-aa.example',
    clientApiKey: 'test-client-api-key',
    fiuId: 'test-fiu',
    signer: makeSigner(),
    curve,
    httpClient: buildFipStub({ curve, ...overrides }),
    allowUnsignedResponses: true,
  });
}

const consentRequest = {
  mobile: '9999999999',
  fiTypes: ['DEPOSIT'] as const,
  purpose: 'loan-underwriting',
  duration: 'P90D',
};

describe.each<DhCurve>(['Curve25519', 'X25519'])('SetuAdapter full loop on %s', (curve) => {
  it('runs consent, session and in-SDK decryption end to end', async () => {
    const adapter = makeAdapter({ curve });

    const consent = await adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    expect(consent.id).toBe('handle-123');
    expect(consent.status).toBe('PENDING');

    expect(await adapter.getConsentStatus(consent.id)).toBe('ACTIVE');

    const session = await adapter.createSession(consent.id);
    expect(session.id).toBe('session-xyz');

    const fips = await adapter.fetchData(consent.id, session.id);
    expect(fips).toHaveLength(1);
    const fip = fips[0];
    expect(fip?.status).toBe('DELIVERED');
    expect(fip?.fipId).toBe('setu-fip');
    expect(fip?.payload?.Account.maskedAccNumber).toBe('XXXXXX4321');
    expect(fip?.payload?.Account.Summary.currentBalance).toBe('18250.75');
  });
});

describe('SetuAdapter failure handling', () => {
  it('marks a FIP as FAILED when its ciphertext does not authenticate', async () => {
    const adapter = makeAdapter({ curve: 'Curve25519', corruptCiphertext: true });
    const consent = await adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    await adapter.getConsentStatus(consent.id);
    const session = await adapter.createSession(consent.id);

    const fips = await adapter.fetchData(consent.id, session.id);
    expect(fips[0]?.status).toBe('FAILED');
  });

  it('rejects construction without credentials', () => {
    expect(
      () =>
        new SetuAdapter({
          baseUrl: '',
          clientApiKey: '',
          fiuId: '',
          signer: makeSigner(),
        }),
    ).toThrow(SahajError);
  });

  it('refuses to construct without response verification unless explicitly allowed', () => {
    expect(
      () =>
        new SetuAdapter({
          baseUrl: 'https://fiu-sandbox.setu-aa.example',
          clientApiKey: 'k',
          fiuId: 'f',
          signer: makeSigner(),
          // no resolveResponsePublicKey and no allowUnsignedResponses
        }),
    ).toThrow(SahajError);
  });

  it('signs every mutating request with an x-jws-signature header', async () => {
    const seenHeaders: Array<Record<string, string>> = [];
    const curve: DhCurve = 'Curve25519';
    const inner = buildFipStub({ curve });
    const recording: FetchLike = async (url, init) => {
      seenHeaders.push(init.headers);
      return inner(url, init);
    };
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu-sandbox.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
      curve,
      httpClient: recording,
      allowUnsignedResponses: true,
    });

    const consent = await adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    await adapter.getConsentStatus(consent.id);
    await adapter.createSession(consent.id);

    const postHeaders = seenHeaders.filter((headers) => 'x-jws-signature' in headers);
    expect(postHeaders.length).toBeGreaterThanOrEqual(2);
    for (const headers of seenHeaders) {
      expect(headers.client_api_key).toBeDefined();
    }
  });

  it('surfaces an upstream 401 as TOKEN_EXPIRED', async () => {
    const failing: FetchLike = async () => ({
      status: 401,
      json: async () => ({}),
      text: async () => 'unauthorized',
    });
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu-sandbox.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
      httpClient: failing,
      allowUnsignedResponses: true,
    });
    await expect(adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] })).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });
});

describe('SetuAdapter multi-account FIP', () => {
  it('decrypts every account block a FIP returns, not just the first', async () => {
    const first = sampleDepositFi();
    const second: RawDepositFi = {
      Account: { ...first.Account, maskedAccNumber: 'XXXXXX8899', linkedAccRef: 'setu-fip-55667788' },
    };
    const adapter = makeAdapter({ fis: [first, second] });

    const consent = await adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    await adapter.getConsentStatus(consent.id);
    const session = await adapter.createSession(consent.id);
    const fips = await adapter.fetchData(consent.id, session.id);

    expect(fips).toHaveLength(2);
    expect(fips.every((fip) => fip.status === 'DELIVERED')).toBe(true);
    expect(fips.map((fip) => fip.payload?.Account.maskedAccNumber).sort()).toEqual([
      'XXXXXX4321',
      'XXXXXX8899',
    ]);
  });
});

describe('SetuAdapter consent rehydration', () => {
  it('resumes a consent in a fresh adapter via export then hydrate', async () => {
    const curve: DhCurve = 'Curve25519';
    const original = makeAdapter({ curve });
    const consent = await original.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    const snapshot = original.exportConsentState(consent.id);

    // A fresh adapter with its own stub, as if the process had restarted.
    const resumed = makeAdapter({ curve });
    resumed.hydrateConsentState(snapshot);

    expect(await resumed.getConsentStatus(consent.id)).toBe('ACTIVE');
    const session = await resumed.createSession(consent.id);
    const fips = await resumed.fetchData(consent.id, session.id);
    expect(fips[0]?.status).toBe('DELIVERED');
  });

  it('throws for an unknown consent handle before it is hydrated', async () => {
    const adapter = makeAdapter();
    await expect(adapter.createSession('never-seen')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('SetuAdapter response signature verification', () => {
  const curve: DhCurve = 'Curve25519';

  function aaKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return {
      signer: new LocalRsaSigner({
        kid: 'aa-response-key',
        privateKeyPkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      }),
      spkiPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
  }

  /** Wrap the FIP stub so every response body is signed and carries the JWS header. */
  function signingStub(aaSigner: LocalRsaSigner, options: { corrupt?: boolean } = {}): FetchLike {
    const inner = buildFipStub({ curve });
    return async (url, init) => {
      const response = await inner(url, init);
      const rawBody = await response.text();
      const jws = await signRequestBody(rawBody, aaSigner);
      return {
        status: response.status,
        headers: { 'x-jws-signature': options.corrupt ? `${jws}tampered` : jws },
        json: async () => JSON.parse(rawBody),
        text: async () => rawBody,
      };
    };
  }

  it('verifies a correctly signed response and completes the loop', async () => {
    const aa = aaKeyPair();
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu-sandbox.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
      curve,
      httpClient: signingStub(aa.signer),
      resolveResponsePublicKey: () => aa.spkiPem,
    });

    const consent = await adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] });
    await adapter.getConsentStatus(consent.id);
    const session = await adapter.createSession(consent.id);
    const fips = await adapter.fetchData(consent.id, session.id);
    expect(fips[0]?.status).toBe('DELIVERED');
  });

  it('fails closed when the response signature does not verify', async () => {
    const aa = aaKeyPair();
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu-sandbox.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
      curve,
      httpClient: signingStub(aa.signer, { corrupt: true }),
      resolveResponsePublicKey: () => aa.spkiPem,
    });

    await expect(adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] })).rejects.toThrow(
      SahajError,
    );
  });

  it('fails closed when a response carries no signature header but verification is required', async () => {
    const aa = aaKeyPair();
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu-sandbox.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
      curve,
      httpClient: buildFipStub({ curve }), // unsigned responses, no headers
      resolveResponsePublicKey: () => aa.spkiPem,
    });

    await expect(adapter.createConsent({ ...consentRequest, fiTypes: ['DEPOSIT'] })).rejects.toMatchObject({
      code: 'AA_UPSTREAM_ERROR',
    });
  });
});
