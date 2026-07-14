/**
 * Running the same consent-to-data loop against Setu's real AA sandbox, with FI
 * payloads decrypted inside the SDK on your own infrastructure.
 *
 * This needs live Setu self-managed AA credentials (register on The Bridge). Set:
 *
 *   SETU_AA_BASE_URL        base URL of Setu's self-managed ReBIT AA API
 *   SETU_CLIENT_API_KEY     the client_api_key Setu issues the FIU
 *   SETU_FIU_ID             the FIU id registered with Setu
 *   SETU_SIGNING_KID        kid of the FIU request-signing key
 *   SETU_SIGNING_KEY_PKCS8  the FIU RS256 private key, PKCS#8 PEM
 *   SETU_TEST_MOBILE        a whitelisted sandbox mobile
 *   SETU_VUA_HANDLE         optional, e.g. "@onemoney"
 *   SETU_CURVE              optional, "Curve25519" (default) or "X25519"
 *
 *   npx tsx examples/setu-sandbox.ts
 */

import { AA, LocalRsaSigner, formatPaise } from '../src/index';

async function main(): Promise<void> {
  const required = [
    'SETU_AA_BASE_URL',
    'SETU_CLIENT_API_KEY',
    'SETU_FIU_ID',
    'SETU_SIGNING_KID',
    'SETU_SIGNING_KEY_PKCS8',
    'SETU_TEST_MOBILE',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.log(`Set these env vars to run the live Setu loop: ${missing.join(', ')}`);
    return;
  }

  const aa = new AA({
    mode: 'setu-sandbox',
    setu: {
      baseUrl: process.env.SETU_AA_BASE_URL as string,
      clientApiKey: process.env.SETU_CLIENT_API_KEY as string,
      fiuId: process.env.SETU_FIU_ID as string,
      curve: process.env.SETU_CURVE === 'X25519' ? 'X25519' : 'Curve25519',
      vuaHandle: process.env.SETU_VUA_HANDLE,
      signer: new LocalRsaSigner({
        kid: process.env.SETU_SIGNING_KID as string,
        privateKeyPkcs8Pem: process.env.SETU_SIGNING_KEY_PKCS8 as string,
      }),
    },
    maxPollAttempts: 60,
  });

  const consent = await aa.consents.create({
    mobile: process.env.SETU_TEST_MOBILE as string,
    fiTypes: ['DEPOSIT'],
    purpose: 'loan-underwriting',
    duration: 'P90D',
  });

  console.log('Approve the consent here:', consent.redirectUrl);

  const data = await aa.data.fetch(consent.id);
  for (const account of data.deposits) {
    console.log(
      `${account.fipName} ${account.maskedAccountNumber}: ${formatPaise(account.summary.currentBalancePaise)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
