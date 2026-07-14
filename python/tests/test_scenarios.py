import pytest

from sahaj import AA, SahajError, is_sahaj_error


def _fetch_with(mobile: str):
    aa = AA(mode="sandbox")
    consent = aa.consents.create(
        mobile=mobile,
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )
    return aa.data.fetch(consent.id)


def test_healthy_delivers_a_multi_account_user():
    data = _fetch_with("9999999999")
    assert len(data.deposits) == 2
    assert all(fip.status == "DELIVERED" for fip in data.fips)


def test_reject_raises_consent_rejected():
    with pytest.raises(SahajError) as caught:
        _fetch_with("9999999001")
    assert caught.value.code == "CONSENT_REJECTED"
    assert caught.value.type == "CONSENT_ERROR"


def test_no_accounts_raises_discovery_error():
    with pytest.raises(SahajError) as caught:
        _fetch_with("9999999002")
    assert caught.value.code == "NO_ACCOUNTS_FOUND"
    assert caught.value.type == "DISCOVERY_ERROR"


def test_expire_raises_consent_expired():
    with pytest.raises(SahajError) as caught:
        _fetch_with("9999999003")
    assert caught.value.code == "CONSENT_EXPIRED"


def test_fip_down_reports_fip_unavailable():
    with pytest.raises(SahajError) as caught:
        _fetch_with("9999999004")
    assert caught.value.code == "FIP_UNAVAILABLE"
    assert caught.value.fip_id == "SBIN"


def test_partial_returns_data_without_raising():
    data = _fetch_with("9999999005")
    assert len(data.deposits) == 1
    delivered = [fip for fip in data.fips if fip.status == "DELIVERED"]
    failed = [fip for fip in data.fips if fip.status == "FAILED"]
    assert len(delivered) == 1
    assert len(failed) == 1
    assert is_sahaj_error(failed[0].error)


def test_error_carries_the_reproducing_vua():
    with pytest.raises(SahajError) as caught:
        _fetch_with("9999999001")
    assert caught.value.sandbox_vua == "9999999001"
    assert "CONSENT_REJECTED" in caught.value.doc_url
