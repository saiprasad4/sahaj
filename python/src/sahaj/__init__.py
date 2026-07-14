"""sahaj... an AA-agnostic SDK for India's Account Aggregator ecosystem.

Run the full consent-to-data loop in a zero-registration sandbox and get back
typed, parsed ReBIT financial data. The redirect, polling, data session,
decryption and schema parsing stay behind the interface.

Independent open-source library. Not affiliated with or endorsed by NPCI, RBI,
SEBI, IRDAI, PFRDA, Sahamati, ReBIT, or any Account Aggregator, FIP, FIU or TSP.
Installing it grants no AA network access. It is not legal or compliance advice.
"""

from __future__ import annotations

from .adapters import (
    AAAdapter,
    AdapterConsent,
    AdapterSession,
    ConsentRequest,
    FetchedFip,
    MockAdapter,
    SandboxControls,
    supports_sandbox_controls,
)
from .client import AA, Consent
from .errors import (
    ERROR_DOC_BASE,
    SahajError,
    all_error_codes,
    describe_error,
    is_sahaj_error,
)
from .fi_types import FI_TYPES, SUPPORTED_FI_TYPES, is_fi_type
from .models import (
    DepositAccount,
    DepositHolder,
    DepositSummary,
    DepositTransaction,
    FinancialData,
    FipResult,
    parse_deposit_account,
    total_deposit_balance_paise,
)
from .money import format_paise, rupees_to_paise
from .sandbox import MAGIC_VUAS, resolve_scenario

__version__ = "0.0.1"

__all__ = [
    "AA",
    "AAAdapter",
    "AdapterConsent",
    "AdapterSession",
    "Consent",
    "ConsentRequest",
    "DepositAccount",
    "DepositHolder",
    "DepositSummary",
    "DepositTransaction",
    "ERROR_DOC_BASE",
    "FI_TYPES",
    "FetchedFip",
    "FinancialData",
    "FipResult",
    "MAGIC_VUAS",
    "MockAdapter",
    "SUPPORTED_FI_TYPES",
    "SahajError",
    "SandboxControls",
    "all_error_codes",
    "describe_error",
    "format_paise",
    "is_fi_type",
    "is_sahaj_error",
    "parse_deposit_account",
    "resolve_scenario",
    "rupees_to_paise",
    "supports_sandbox_controls",
    "total_deposit_balance_paise",
]
