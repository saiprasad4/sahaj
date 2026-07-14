"""The developer-facing client. In sandbox it needs no keys and no FIU licence:
``consents.create`` then ``data.fetch`` runs the whole loop and hands back typed,
parsed financial data. The poll, session, decrypt and parse steps stay hidden.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from .adapters.base import AAAdapter, ConsentRequest, supports_sandbox_controls
from .adapters.mock import MockAdapter
from .errors import SahajError
from .fi_types import is_fi_type
from .models import FinancialData, FipResult, parse_deposit_account

_ISO_8601_PERIOD = re.compile(r"^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?$")
_GENERATED_AT = datetime(2026, 6, 1, 9, 0, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class Consent:
    id: str
    status: str
    redirect_url: str
    fi_types: list[str]
    purpose: str
    created_at: str
    expires_at: str


def _validate_consent_input(mobile: str, fi_types: list[str], purpose: str, duration: str) -> None:
    if not re.fullmatch(r"\d{10}", mobile):
        raise SahajError("INVALID_INPUT", field="mobile")
    if not fi_types:
        raise SahajError("INVALID_INPUT", field="fi_types")
    for fi_type in fi_types:
        if not is_fi_type(fi_type):
            raise SahajError("INVALID_INPUT", field="fi_types")
    if not purpose or not purpose.strip():
        raise SahajError("INVALID_INPUT", field="purpose")
    if not _ISO_8601_PERIOD.match(duration):
        raise SahajError("INVALID_INPUT", field="duration")


def _error_for_non_active_status(status: str) -> SahajError:
    return {
        "REJECTED": lambda: SahajError("CONSENT_REJECTED"),
        "EXPIRED": lambda: SahajError("CONSENT_EXPIRED"),
        "REVOKED": lambda: SahajError("CONSENT_REVOKED"),
        "PAUSED": lambda: SahajError("CONSENT_PAUSED"),
    }.get(status, lambda: SahajError("CONSENT_NOT_ACTIVE"))()


class _ConsentsApi:
    def __init__(self, adapter: AAAdapter) -> None:
        self._adapter = adapter

    def create(
        self,
        mobile: str,
        fi_types: list[str],
        purpose: str,
        duration: str,
        idempotency_key: Optional[str] = None,
    ) -> Consent:
        _validate_consent_input(mobile, fi_types, purpose, duration)
        created = self._adapter.create_consent(
            ConsentRequest(
                mobile=mobile,
                fi_types=fi_types,
                purpose=purpose,
                duration=duration,
                idempotency_key=idempotency_key,
            )
        )
        return Consent(
            id=created.id,
            status=created.status,
            redirect_url=created.redirect_url,
            fi_types=fi_types,
            purpose=purpose,
            created_at=created.created_at,
            expires_at=created.expires_at,
        )

    def status(self, consent_id: str) -> str:
        return self._adapter.get_consent_status(consent_id)


class _DataApi:
    def __init__(self, adapter: AAAdapter, max_poll_attempts: int) -> None:
        self._adapter = adapter
        self._max_poll_attempts = max_poll_attempts

    def fetch(self, consent_id: str) -> FinancialData:
        self._wait_for_active_consent(consent_id)

        session = self._adapter.create_session(consent_id)
        if session.status == "FAILED":
            raise SahajError("SESSION_EXPIRED")

        fetched_fips = self._adapter.fetch_data(consent_id, session.id)
        deposits = []
        fips: list[FipResult] = []

        for fip in fetched_fips:
            if fip.status == "DELIVERED" and fip.payload is not None:
                deposits.append(parse_deposit_account(fip.payload, fip.fip_id, fip.fip_name))
                fips.append(
                    FipResult(fip_id=fip.fip_id, fip_name=fip.fip_name, status="DELIVERED", fi_types=[fip.fi_type])
                )
            else:
                fips.append(
                    FipResult(
                        fip_id=fip.fip_id,
                        fip_name=fip.fip_name,
                        status="FAILED",
                        fi_types=[fip.fi_type],
                        error=SahajError("FIP_UNAVAILABLE", fip_id=fip.fip_id),
                    )
                )

        return FinancialData(
            consent_id=consent_id,
            session_id=session.id,
            schema_version="1.1.2",
            generated_at=_GENERATED_AT,
            deposits=deposits,
            fips=fips,
        )

    def _wait_for_active_consent(self, consent_id: str) -> None:
        for _ in range(self._max_poll_attempts):
            status = self._adapter.get_consent_status(consent_id)
            if status == "ACTIVE":
                return
            if status != "PENDING":
                raise _error_for_non_active_status(status)
        raise SahajError("CONSENT_NOT_ACTIVE")


class _SandboxApi:
    def __init__(self, adapter: AAAdapter, mode: str) -> None:
        self._adapter = adapter
        self._mode = mode

    def approve(self, consent_id: str) -> None:
        self._driver().approve(consent_id)

    def reject(self, consent_id: str) -> None:
        self._driver().reject(consent_id)

    def _driver(self):
        if self._mode != "sandbox" or not supports_sandbox_controls(self._adapter):
            raise SahajError("INVALID_INPUT", field="sandbox")
        return self._adapter


class AA:
    def __init__(
        self,
        mode: str,
        adapter: Optional[AAAdapter] = None,
        auto_approve: bool = True,
        seed: int = 1,
        max_poll_attempts: int = 20,
    ) -> None:
        self.mode = mode
        resolved = self._resolve_adapter(mode, adapter, auto_approve, seed)
        self.consents = _ConsentsApi(resolved)
        self.data = _DataApi(resolved, max_poll_attempts)
        self.sandbox = _SandboxApi(resolved, mode)

    @staticmethod
    def _resolve_adapter(mode: str, adapter: Optional[AAAdapter], auto_approve: bool, seed: int) -> AAAdapter:
        if adapter is not None:
            return adapter
        if mode == "sandbox":
            return MockAdapter(auto_approve=auto_approve, seed=seed)
        raise SahajError("PRODUCTION_NOT_CONFIGURED")
