# sahaj

An AA-agnostic SDK for India's Account Aggregator ecosystem. Run the full consent-to-data loop in a sandbox that needs no keys and no FIU licence, and get back typed, parsed financial data from one `await`.

> Independent open-source library. Not affiliated with or endorsed by NPCI, RBI, SEBI, IRDAI, PFRDA, Sahamati, ReBIT, or any Account Aggregator, FIP, FIU or TSP. Installing it grants no AA network access. It is not legal or compliance advice, and production use is gated on your own regulatory eligibility. See [NOTICE](./NOTICE).

## Why

Every "one API, many AAs" product today is a closed hosted service, and there is no open-source AA library to learn from, no Python SDK at all, and no way to feel the flow work before you hold a licence. sahaj starts at the other end. The whole consent-to-data loop runs offline against a deterministic sandbox, so you can see a typed bank balance come back in a few minutes, then swap in a real aggregator once your production access is sorted.

The redirect, the polling, the data session, the decryption and the ReBIT schema parsing all sit behind the interface. You call two methods.

## Install

```bash
npm install @saiprasad4/sahaj
```

## Quickstart

No keys, no registration. This runs the real loop against the sandbox and prints a parsed balance.

```ts
import { AA, formatPaise } from '@saiprasad4/sahaj';

const aa = new AA({ mode: 'sandbox' }); // no keys, no FIU licence needed

const consent = await aa.consents.create({
  mobile: '9999999999', // magic VUA... a healthy multi-account user
  fiTypes: ['DEPOSIT'],
  purpose: 'loan-underwriting',
  duration: 'P90D',
});

console.log('Approve here:', consent.redirectUrl); // in sandbox this auto-approves

const data = await aa.data.fetch(consent.id); // awaits ACTIVE, opens a session, decrypts, parses

console.log(formatPaise(data.deposits[0].summary.currentBalancePaise));
```

## Magic VUAs

The trailing digits of the sandbox mobile number pick a deterministic scenario, so every outcome, the happy path and each failure, is reproducible offline. This is the AA analogue of Stripe's `4242` card and Plaid's `user_good`.

| Mobile | Scenario | What you get |
| --- | --- | --- |
| `9999999999` | healthy | Multi-account user, auto-approves, full data |
| `9999999001` | reject | `CONSENT_REJECTED` |
| `9999999002` | no accounts | `NO_ACCOUNTS_FOUND` |
| `9999999003` | expire | `CONSENT_EXPIRED` |
| `9999999004` | FIP down | `FIP_UNAVAILABLE` |
| `9999999005` | partial | One FIP delivers, one fails, no throw |

Turn off auto-approval to drive the human step yourself:

```ts
const aa = new AA({ mode: 'sandbox', sandbox: { autoApprove: false } });
const consent = await aa.consents.create({ /* ... */ });
aa.sandbox.approve(consent.id); // or aa.sandbox.reject(consent.id)
const data = await aa.data.fetch(consent.id);
```

## Errors

Everything throws one typed error. It carries a stable `code`, a developer `message`, a user-safe `displayMessage`, the `suggestedAction`, and the sandbox VUA that reproduces it.

```ts
import { isSahajError } from '@saiprasad4/sahaj';

try {
  await aa.data.fetch(consentId);
} catch (error) {
  if (isSahajError(error)) {
    console.log(error.code); // 'CONSENT_REJECTED'
    console.log(error.displayMessage); // safe to show a user
    console.log(error.sandboxVua); // '9999999001', replay it offline
  }
}
```

## Money is always integer paise

ReBIT amounts arrive as decimal rupee strings. sahaj parses them into integer paise without ever touching a float, the same money-safe convention as [aadesh](https://github.com/saiprasad4/aadesh). Use `formatPaise` only for display.

```ts
import { rupeesToPaise, formatPaise } from '@saiprasad4/sahaj';

rupeesToPaise('152340.75'); // 15234075
formatPaise(15234075); // '₹1,52,340.75'
```

## The AA-agnostic seam

Every provider implements one small interface, so the same application code runs across aggregators. The sandbox is just another adapter, which is what lets the loop run with none of them.

```ts
interface AAAdapter {
  createConsent(request): Promise<AdapterConsent>;
  getConsentStatus(consentId): Promise<ConsentStatus>;
  createSession(consentId): Promise<AdapterSession>;
  fetchData(consentId, sessionId): Promise<FetchedFip[]>;
}
```

## The Setu adapter (real AA, in-SDK decryption)

The first real provider adapter targets Setu's (now Agya, Pine Labs) self-managed ReBIT AA API. It is the AA analogue of the sandbox: the same `consents.create` then `data.fetch` surface, now against a live aggregator. Crucially, FI payloads are decrypted **inside the SDK, on your infrastructure**. The adapter deliberately does not use Setu's hosted Rahasya decryption service, so your keys and your decrypted data never leave your process.

```ts
import { AA, LocalRsaSigner } from '@saiprasad4/sahaj';

const aa = new AA({
  mode: 'setu-sandbox',
  setu: {
    baseUrl: process.env.SETU_AA_BASE_URL!, // Setu's self-managed AA host, from your credentials
    clientApiKey: process.env.SETU_CLIENT_API_KEY!,
    fiuId: process.env.SETU_FIU_ID!,
    signer: new LocalRsaSigner({
      kid: process.env.SETU_SIGNING_KID!,
      privateKeyPkcs8Pem: process.env.SETU_SIGNING_KEY_PKCS8!, // your RS256 key, stays on your infra
    }),
    curve: 'Curve25519', // or 'X25519'
  },
});

const consent = await aa.consents.create({ mobile, fiTypes: ['DEPOSIT'], purpose, duration: 'P90D' });
const data = await aa.data.fetch(consent.id); // signs the request, fetches encryptedFI, decrypts in-SDK
```

For a non-exportable signing key, implement the `JwsSigner` interface against your KMS/HSM and pass it as `signer` instead of `LocalRsaSigner`. The SDK hands the signer the exact JWS signing input and never sees the private key.

To verify the AA's own signature on responses, pass `resolveResponsePublicKey` (a `kid` -> SPKI PEM lookup). When set, each response's detached `x-jws-signature` is verified over the raw body before it is parsed, and a missing or invalid signature fails closed. Confidentiality already fails closed regardless, since a tampered `KeyMaterial` only yields a GCM tag mismatch on decryption.

### Running the live loop

Live Setu credentials are not bundled. To run against the real sandbox:

1. Register on Setu's "The Bridge" (`https://bridge.setu.co`), add the Account Aggregator product, and provision the self-managed / ReBIT API. Confirm your credentials map to the self-managed product that returns `encryptedFI`, not the managed product that decrypts server-side.
2. Obtain from Setu: the self-managed AA base URL, your `client_api_key`, your FIU id, and your RS256 request-signing keypair (register the public key with Setu).
3. Set the env vars the gated integration test reads: `SETU_AA_BASE_URL`, `SETU_CLIENT_API_KEY`, `SETU_FIU_ID`, `SETU_SIGNING_KID`, `SETU_SIGNING_KEY_PKCS8`, `SETU_TEST_MOBILE` (a whitelisted sandbox mobile), and optionally `SETU_VUA_HANDLE` and `SETU_CURVE`.
4. Run `npm test`. The live test in `test/adapters/setu.live.test.ts` skips itself unless all required vars are present.

## The crypto core

The FI encryption and request signing follow the exact ReBIT/rahasya scheme, built only on audited primitives (`@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `jose`), never hand-rolled:

- FI payloads: ECDH -> HKDF-SHA256 -> AES-256-GCM, with a fresh ephemeral keypair and CSPRNG nonce per request. Both curve variants are supported: legacy short-Weierstrass `Curve25519` (ReBIT v1.x) and RFC 7748 Montgomery `X25519` (ReBIT v2.0.0). The curve and key length are validated before ECDH, since a curve mismatch is the ecosystem's most common "mac check in GCM failed" bug.
- Request signing: detached RS256 JWS (`x-jws-signature`, `b64:false`, `crit:["b64"]`), verified before deserialization with an RS256 allow-list that rejects `alg:none` and downgrades.

The primitives are exported (`encryptFi`, `decryptFi`, `signRequestBody`, `verifyRequestBody`, `generateEphemeralKeyPair`, ...) if you need them directly.

## Where this is

This is v0.1.

- DEPOSIT is modelled end to end. The other ReBIT FI types are declared and land with their parsers next.
- The Setu adapter is the first real provider (Finvu next). `mode: 'production'` accepts any adapter you supply; `mode: 'setu-sandbox'` builds the Setu adapter from config.
- The SDK runs entirely on your own infrastructure. It never receives your keys, your decrypted data, or your consent artefacts, and it ships no telemetry. That is a deliberate line: it keeps you, not this library, in control of the data.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
