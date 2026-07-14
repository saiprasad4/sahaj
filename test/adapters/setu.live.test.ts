import { describe, expect, it } from 'vitest';
import { AA, LocalRsaSigner } from '../../src/index';

/**
 * Live Setu integration. Skipped by default; it runs only when real Setu
 * self-managed AA credentials are present in the environment. This is the loop the
 * repo owner runs after registering on The Bridge. See the PR/README for setup.
 *
 * Required env vars:
 *   SETU_AA_BASE_URL        base URL of Setu's self-managed ReBIT AA API
 *   SETU_CLIENT_API_KEY     the client_api_key Setu issues the FIU
 *   SETU_FIU_ID             the FIU id registered with Setu
 *   SETU_SIGNING_KID        kid of the FIU request-signing key
 *   SETU_SIGNING_KEY_PKCS8  the FIU RS256 private key, PKCS#8 PEM
 *   SETU_TEST_MOBILE        a whitelisted sandbox mobile (for the VUA)
 * Optional:
 *   SETU_VUA_HANDLE         VUA handle suffix, e.g. "@onemoney"
 *   SETU_CURVE              "Curve25519" (default) or "X25519"
 */

const requiredEnv = [
  'SETU_AA_BASE_URL',
  'SETU_CLIENT_API_KEY',
  'SETU_FIU_ID',
  'SETU_SIGNING_KID',
  'SETU_SIGNING_KEY_PKCS8',
  'SETU_TEST_MOBILE',
] as const;

const hasLiveCredentials = requiredEnv.every((name) => Boolean(process.env[name]));

describe.skipIf(!hasLiveCredentials)('Setu live sandbox loop', () => {
  it('creates a consent and fetches decrypted deposit data', async () => {
    const curve = process.env.SETU_CURVE === 'X25519' ? 'X25519' : 'Curve25519';
    const aa = new AA({
      mode: 'setu-sandbox',
      setu: {
        baseUrl: process.env.SETU_AA_BASE_URL as string,
        clientApiKey: process.env.SETU_CLIENT_API_KEY as string,
        fiuId: process.env.SETU_FIU_ID as string,
        curve,
        signer: new LocalRsaSigner({
          kid: process.env.SETU_SIGNING_KID as string,
          privateKeyPkcs8Pem: process.env.SETU_SIGNING_KEY_PKCS8 as string,
        }),
        vuaHandle: process.env.SETU_VUA_HANDLE,
      },
      // The user approves the consent in Setu's webview, so allow ample polling.
      maxPollAttempts: 60,
    });

    const consent = await aa.consents.create({
      mobile: process.env.SETU_TEST_MOBILE as string,
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    expect(consent.id).toBeTruthy();

    const data = await aa.data.fetch(consent.id);
    expect(data.deposits.length).toBeGreaterThan(0);
  });
});
