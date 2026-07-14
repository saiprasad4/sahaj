"""The sandbox adapter. It runs the whole consent-to-data loop in memory with no
credentials and no network, driving each magic-VUA scenario through the same state
machine a real AA would. This is the wedge: the loop works in minutes, offline,
before anyone holds an FIU licence.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..errors import SahajError
from ..sandbox.fixtures import build_deposit_fixtures
from ..sandbox.vua import resolve_scenario
from .base import AdapterConsent, AdapterSession, ConsentRequest, FetchedFip

_SANDBOX_CLOCK = datetime(2026, 6, 1, 9, 0, 0, tzinfo=timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def _approval_outcome(scenario: str) -> str:
    if scenario == "reject":
        return "REJECTED"
    if scenario == "expire":
        return "EXPIRED"
    return "ACTIVE"


@dataclass
class _MockConsentState:
    id: str
    mobile: str
    scenario: str
    fi_types: list[str]
    created_at: str
    expires_at: str
    status: str


class MockAdapter:
    name = "sandbox"

    def __init__(self, auto_approve: bool = True, seed: int = 1) -> None:
        self._auto_approve = auto_approve
        self._seed = seed
        self._consents: dict[str, _MockConsentState] = {}
        self._consent_id_by_idempotency_key: dict[str, str] = {}
        self._consent_counter = 0

    def create_consent(self, request: ConsentRequest) -> AdapterConsent:
        if request.idempotency_key:
            existing_id = self._consent_id_by_idempotency_key.get(request.idempotency_key)
            if existing_id:
                return self._to_adapter_consent(self._require_consent(existing_id))

        scenario = resolve_scenario(request.mobile)
        self._consent_counter += 1
        consent_id = f"csnt_sandbox_{self._consent_counter}"
        state = _MockConsentState(
            id=consent_id,
            mobile=request.mobile,
            scenario=scenario,
            fi_types=request.fi_types,
            created_at=_iso(_SANDBOX_CLOCK),
            expires_at=_iso(_SANDBOX_CLOCK + timedelta(minutes=15)),
            status=_approval_outcome(scenario) if self._auto_approve else "PENDING",
        )
        self._consents[consent_id] = state
        if request.idempotency_key:
            self._consent_id_by_idempotency_key[request.idempotency_key] = consent_id
        return self._to_adapter_consent(state)

    def get_consent_status(self, consent_id: str) -> str:
        return self._require_consent(consent_id).status

    def create_session(self, consent_id: str) -> AdapterSession:
        state = self._require_consent(consent_id)
        if state.scenario == "fip_down":
            raise SahajError("FIP_UNAVAILABLE", fip_id="SBIN")
        return AdapterSession(id=f"sess_sandbox_{state.id}", status="COMPLETED")

    def fetch_data(self, consent_id: str, _session_id: str) -> list[FetchedFip]:
        state = self._require_consent(consent_id)
        if state.scenario == "no_accounts":
            raise SahajError("NO_ACCOUNTS_FOUND")
        return [
            FetchedFip(
                fip_id=fip.fip_id,
                fip_name=fip.fip_name,
                status=fip.status,
                fi_type="DEPOSIT",
                payload=fip.payload,
            )
            for fip in build_deposit_fixtures(state.mobile, state.scenario, self._seed)
        ]

    def approve(self, consent_id: str) -> None:
        state = self._require_consent(consent_id)
        state.status = _approval_outcome(state.scenario)

    def reject(self, consent_id: str) -> None:
        self._require_consent(consent_id).status = "REJECTED"

    def _require_consent(self, consent_id: str) -> _MockConsentState:
        state = self._consents.get(consent_id)
        if state is None:
            raise SahajError("INVALID_INPUT", field="consent_id")
        return state

    def _to_adapter_consent(self, state: _MockConsentState) -> AdapterConsent:
        return AdapterConsent(
            id=state.id,
            status=state.status,
            redirect_url=f"https://sandbox.sahaj.local/consents/{state.id}/approve",
            created_at=state.created_at,
            expires_at=state.expires_at,
        )
