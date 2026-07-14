"""The sahaj error taxonomy.

One typed error for the whole consent-to-data loop: a stable machine-readable
``code``, a developer ``message``, a user-safe ``display_message``, the concrete
``suggested_action``, and a deep link to the docs. Every code is reproducible in
sandbox via a magic VUA, so a failure a developer hits in production can be
replayed offline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

ERROR_DOC_BASE = "https://github.com/saiprasad4/sahaj/blob/main/docs/errors"


@dataclass(frozen=True)
class CatalogEntry:
    type: str
    message: str
    display_message: str
    suggested_action: str
    sandbox_vua: Optional[str] = None


_CATALOG: dict[str, CatalogEntry] = {
    "MISSING_CREDENTIALS": CatalogEntry(
        "AUTH_ERROR",
        "No FIU credentials were configured for production mode.",
        "We could not connect to your bank right now.",
        'Configure an adapter with your FIU credentials, or use mode="sandbox".',
    ),
    "TOKEN_EXPIRED": CatalogEntry(
        "AUTH_ERROR",
        "The FIU access token has expired.",
        "We could not connect to your bank right now.",
        "Refresh the FIU token and retry.",
    ),
    "CONSENT_REJECTED": CatalogEntry(
        "CONSENT_ERROR",
        "The user rejected the consent request in the AA app.",
        "You declined the data-sharing request.",
        "Recreate the consent and prompt the user to approve it.",
        "9999999001",
    ),
    "CONSENT_EXPIRED": CatalogEntry(
        "CONSENT_ERROR",
        "The consent request expired before the user acted on it.",
        "The data-sharing request timed out.",
        "Recreate the consent and ask the user to approve it promptly.",
        "9999999003",
    ),
    "CONSENT_REVOKED": CatalogEntry(
        "CONSENT_ERROR",
        "The consent was revoked and can no longer be used.",
        "Data sharing was turned off.",
        "Recreate the consent if you still need the data.",
    ),
    "CONSENT_PAUSED": CatalogEntry(
        "CONSENT_ERROR",
        "The consent is paused and cannot be used until resumed.",
        "Data sharing is paused.",
        "Ask the user to resume the consent, or recreate it.",
    ),
    "CONSENT_NOT_ACTIVE": CatalogEntry(
        "CONSENT_ERROR",
        "The consent is still pending and did not reach ACTIVE within the wait window.",
        "We are still waiting for your approval.",
        "Wait for the approval webhook, or increase the fetch wait window.",
    ),
    "NO_ACCOUNTS_FOUND": CatalogEntry(
        "DISCOVERY_ERROR",
        "No accounts were discovered at the FIP for this identifier.",
        "We could not find any accounts to share.",
        "Confirm the mobile number is registered with the bank, then retry.",
        "9999999002",
    ),
    "IDENTIFIER_MISMATCH": CatalogEntry(
        "DISCOVERY_ERROR",
        "The identifier did not match any account at the FIP.",
        "These details did not match any account.",
        "Verify the identifier passed to consent creation.",
    ),
    "FIP_UNAVAILABLE": CatalogEntry(
        "FIP_ERROR",
        "The FIP was unreachable during the data session.",
        "Your bank is temporarily unavailable.",
        "Retry the fetch after a short delay with backoff.",
        "9999999004",
    ),
    "FIP_DENIED": CatalogEntry(
        "FIP_ERROR",
        "The FIP denied the data request.",
        "Your bank declined the request.",
        "Check that the consent scope is supported by the FIP.",
    ),
    "ACCOUNT_LINKING_FAILED": CatalogEntry(
        "FIP_ERROR",
        "Linking the discovered account failed.",
        "We could not link your account.",
        "Ask the user to retry the linking step in the AA app.",
    ),
    "SESSION_EXPIRED": CatalogEntry(
        "SESSION_ERROR",
        "The data session expired before the data was fetched.",
        "The data request timed out.",
        "Create a fresh data session against the active consent.",
    ),
    "DATA_NOT_READY": CatalogEntry(
        "SESSION_ERROR",
        "The FIP has not finished preparing the data yet.",
        "Your data is still being prepared.",
        "Poll the session status with backoff until it completes.",
    ),
    "DECRYPTION_FAILED": CatalogEntry(
        "DATA_ERROR",
        "The FI payload could not be decrypted with the derived session key.",
        "We could not read the shared data.",
        "Check the curve variant and key material match the counterparty.",
    ),
    "SCHEMA_PARSE_FAILED": CatalogEntry(
        "DATA_ERROR",
        "The decrypted FI payload did not match the expected ReBIT schema.",
        "We could not read the shared data.",
        "Inspect the raw payload via the .raw escape hatch and report the schema version.",
    ),
    "KEY_MATERIAL_INVALID": CatalogEntry(
        "DATA_ERROR",
        "The KeyMaterial returned by the FIP was malformed or used an unexpected curve.",
        "We could not read the shared data.",
        "Validate the curve and key length before deriving the session key.",
    ),
    "RATE_LIMITED": CatalogEntry(
        "RATE_LIMIT_ERROR",
        "The upstream AA or router rate-limited the request.",
        "Too many requests, please try again shortly.",
        "Back off and retry with jitter.",
    ),
    "AA_UPSTREAM_ERROR": CatalogEntry(
        "AA_ERROR",
        "The AA or router returned an unexpected upstream error.",
        "The data provider had a problem.",
        "Retry once, then surface the request_id when reporting the issue.",
    ),
    "INVALID_INPUT": CatalogEntry(
        "VALIDATION_ERROR",
        "The input to the SDK was invalid.",
        "Something was not quite right with the request.",
        "Fix the flagged field and retry.",
    ),
    "PRODUCTION_NOT_CONFIGURED": CatalogEntry(
        "VALIDATION_ERROR",
        "Production mode needs a configured AA adapter, which is not shipped in v0.1.",
        "This feature is not available yet.",
        'Use mode="sandbox" for now. Production adapters arrive in a later milestone.',
    ),
}


class SahajError(Exception):
    """The single error type every sahaj call raises."""

    def __init__(
        self,
        code: str,
        *,
        fip_id: Optional[str] = None,
        field: Optional[str] = None,
        request_id: Optional[str] = None,
        causes: Optional[list["SahajError"]] = None,
    ) -> None:
        entry = _CATALOG[code]
        super().__init__(entry.message)
        self.type = entry.type
        self.code = code
        self.display_message = entry.display_message
        self.suggested_action = entry.suggested_action
        self.doc_url = f"{ERROR_DOC_BASE}/{code}.md"
        self.sandbox_vua = entry.sandbox_vua
        self.fip_id = fip_id
        self.field = field
        self.request_id = request_id
        self.causes = causes


def is_sahaj_error(value: Any) -> bool:
    return isinstance(value, SahajError)


def describe_error(code: str) -> dict[str, Any]:
    entry = _CATALOG[code]
    return {
        "code": code,
        "type": entry.type,
        "message": entry.message,
        "display_message": entry.display_message,
        "suggested_action": entry.suggested_action,
        "sandbox_vua": entry.sandbox_vua,
        "doc_url": f"{ERROR_DOC_BASE}/{code}.md",
    }


def all_error_codes() -> list[str]:
    return list(_CATALOG.keys())
