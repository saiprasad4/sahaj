import pytest

from sahaj import AA, SahajError


def _pending_client():
    return AA(mode="sandbox", auto_approve=False, max_poll_attempts=3)


def _create(aa: AA):
    return aa.consents.create(
        mobile="9999999999",
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )


def test_fresh_consent_is_pending():
    aa = _pending_client()
    consent = _create(aa)
    assert consent.status == "PENDING"
    assert aa.consents.status(consent.id) == "PENDING"


def test_fetch_before_approval_fails():
    aa = _pending_client()
    consent = _create(aa)
    with pytest.raises(SahajError) as caught:
        aa.data.fetch(consent.id)
    assert caught.value.code == "CONSENT_NOT_ACTIVE"


def test_data_delivered_after_approval():
    aa = _pending_client()
    consent = _create(aa)
    aa.sandbox.approve(consent.id)
    data = aa.data.fetch(consent.id)
    assert len(data.deposits) > 0


def test_manual_rejection_maps_to_consent_rejected():
    aa = _pending_client()
    consent = _create(aa)
    aa.sandbox.reject(consent.id)
    with pytest.raises(SahajError) as caught:
        aa.data.fetch(consent.id)
    assert caught.value.code == "CONSENT_REJECTED"


def test_sandbox_controls_refused_in_production():
    class _NoopAdapter:
        name = "noop"

        def create_consent(self, request):
            raise NotImplementedError

        def get_consent_status(self, consent_id):
            return "ACTIVE"

        def create_session(self, consent_id):
            raise NotImplementedError

        def fetch_data(self, consent_id, session_id):
            return []

    aa = AA(mode="production", adapter=_NoopAdapter())
    with pytest.raises(SahajError):
        aa.sandbox.approve("x")
