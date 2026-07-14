import pytest

from sahaj import AA, SahajError


def _sandbox():
    return AA(mode="sandbox")


def _create(**overrides):
    kwargs = dict(
        mobile="9999999999",
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )
    kwargs.update(overrides)
    return _sandbox().consents.create(**kwargs)


def test_rejects_malformed_mobile():
    with pytest.raises(SahajError) as caught:
        _create(mobile="12345")
    assert caught.value.code == "INVALID_INPUT"
    assert caught.value.field == "mobile"


def test_rejects_empty_fi_types():
    with pytest.raises(SahajError) as caught:
        _create(fi_types=[])
    assert caught.value.field == "fi_types"


def test_rejects_unknown_fi_type():
    with pytest.raises(SahajError) as caught:
        _create(fi_types=["NOT_A_TYPE"])
    assert caught.value.field == "fi_types"


def test_rejects_blank_purpose():
    with pytest.raises(SahajError) as caught:
        _create(purpose="  ")
    assert caught.value.field == "purpose"


def test_rejects_non_iso_duration():
    with pytest.raises(SahajError) as caught:
        _create(duration="90 days")
    assert caught.value.field == "duration"


def test_accepts_valid_iso_period():
    consent = _create(duration="P1Y")
    assert consent.id


def test_production_without_adapter_is_refused():
    with pytest.raises(SahajError) as caught:
        AA(mode="production")
    assert caught.value.code == "PRODUCTION_NOT_CONFIGURED"
