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

## Where this is

This is v0.1, and it is deliberately sandbox-only.

- DEPOSIT is modelled end to end. The other ReBIT FI types are declared and land with their parsers next.
- Real provider adapters (Setu first, then Finvu) arrive in a later milestone. Until then, `mode: 'production'` needs an adapter you supply.
- The SDK runs entirely on your own infrastructure. It never receives your keys, your decrypted data, or your consent artefacts, and it ships no telemetry. That is a deliberate line: it keeps you, not this library, in control of the data.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
