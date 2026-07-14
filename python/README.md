# sahaj (Python)

An AA-agnostic SDK for India's Account Aggregator ecosystem. Run the full consent-to-data loop in a sandbox that needs no keys and no FIU licence, and get back typed, parsed financial data.

> Independent open-source library. Not affiliated with or endorsed by NPCI, RBI, SEBI, IRDAI, PFRDA, Sahamati, ReBIT, or any Account Aggregator, FIP, FIU or TSP. Installing it grants no AA network access. It is not legal or compliance advice, and production use is gated on your own regulatory eligibility. See the repository [NOTICE](../NOTICE).

This is the Python port of the [TypeScript package](https://github.com/saiprasad4/sahaj), with the same surface and the same magic VUAs.

## Install

```bash
pip install sahaj
```

## Quickstart

No keys, no registration. This runs the real loop against the sandbox and prints a parsed balance.

```python
from sahaj import AA, format_paise

aa = AA(mode="sandbox")  # no keys, no FIU licence needed

consent = aa.consents.create(
    mobile="9999999999",  # magic VUA... a healthy multi-account user
    fi_types=["DEPOSIT"],
    purpose="loan-underwriting",
    duration="P90D",
)

print("Approve here:", consent.redirect_url)  # in sandbox this auto-approves

data = aa.data.fetch(consent.id)  # awaits ACTIVE, opens a session, decrypts, parses

print(format_paise(data.deposits[0].summary.current_balance_paise))
```

## Magic VUAs

The trailing digits of the sandbox mobile number pick a deterministic scenario.

| Mobile | Scenario | What you get |
| --- | --- | --- |
| `9999999999` | healthy | Multi-account user, auto-approves, full data |
| `9999999001` | reject | `CONSENT_REJECTED` |
| `9999999002` | no accounts | `NO_ACCOUNTS_FOUND` |
| `9999999003` | expire | `CONSENT_EXPIRED` |
| `9999999004` | FIP down | `FIP_UNAVAILABLE` |
| `9999999005` | partial | One FIP delivers, one fails, no raise |

Turn off auto-approval to drive the human step yourself:

```python
aa = AA(mode="sandbox", auto_approve=False)
consent = aa.consents.create(mobile="9999999999", fi_types=["DEPOSIT"], purpose="p", duration="P90D")
aa.sandbox.approve(consent.id)  # or aa.sandbox.reject(consent.id)
data = aa.data.fetch(consent.id)
```

## Errors

Everything raises `SahajError`, carrying a stable `code`, a developer message, a user-safe `display_message`, the `suggested_action`, and the sandbox VUA that reproduces it.

```python
from sahaj import SahajError

try:
    aa.data.fetch(consent_id)
except SahajError as error:
    print(error.code)            # 'CONSENT_REJECTED'
    print(error.display_message) # safe to show a user
    print(error.sandbox_vua)     # '9999999001', replay it offline
```

## Money is always integer paise

Typed models use `pydantic`. Amounts are integer paise, parsed from ReBIT decimal rupee strings without floats.

```python
from sahaj import rupees_to_paise, format_paise

rupees_to_paise("152340.75")  # 15234075
format_paise(15234075)        # '₹1,52,340.75'
```

## Where this is

v0.1, sandbox-only. DEPOSIT is modelled end to end, the other ReBIT FI types land with their parsers next, and real provider adapters (Setu first) arrive in a later milestone. The SDK runs entirely on your own infrastructure and ships no telemetry.

## License

Apache-2.0. See the repository [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
