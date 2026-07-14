"""The AA-agnostic seam. Every provider (the sandbox mock today, Setu and Finvu
later) implements this one interface, so the same application code runs across
aggregators. Keeping it small is the whole "agnostic" bet.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol, runtime_checkable


@dataclass(frozen=True)
class ConsentRequest:
    mobile: str
    fi_types: list[str]
    purpose: str
    duration: str  # ISO-8601 period the consent stays valid for, e.g. "P90D"
    idempotency_key: Optional[str] = None


@dataclass(frozen=True)
class AdapterConsent:
    id: str
    status: str
    redirect_url: str
    created_at: str
    expires_at: str


@dataclass(frozen=True)
class AdapterSession:
    id: str
    status: str


@dataclass(frozen=True)
class FetchedFip:
    """One FIP's contribution to a data session, already decrypted into a ReBIT-shaped payload."""

    fip_id: str
    fip_name: str
    status: str
    fi_type: str
    payload: Optional[dict[str, Any]] = field(default=None)


@runtime_checkable
class AAAdapter(Protocol):
    name: str

    def create_consent(self, request: ConsentRequest) -> AdapterConsent: ...

    def get_consent_status(self, consent_id: str) -> str: ...

    def create_session(self, consent_id: str) -> AdapterSession: ...

    def fetch_data(self, consent_id: str, session_id: str) -> list[FetchedFip]: ...


@runtime_checkable
class SandboxControls(Protocol):
    """Adapters that let you drive the human approval step, only meaningful in sandbox."""

    def approve(self, consent_id: str) -> None: ...

    def reject(self, consent_id: str) -> None: ...


def supports_sandbox_controls(adapter: Any) -> bool:
    return callable(getattr(adapter, "approve", None)) and callable(getattr(adapter, "reject", None))
