from sahaj import (
    ERROR_DOC_BASE,
    SahajError,
    all_error_codes,
    describe_error,
    is_sahaj_error,
)


def test_catalog_describes_every_code():
    for code in all_error_codes():
        described = describe_error(code)
        assert described["message"]
        assert described["display_message"]
        assert described["suggested_action"]
        assert described["doc_url"] == f"{ERROR_DOC_BASE}/{code}.md"


def test_builds_error_with_catalog_metadata():
    error = SahajError("CONSENT_REJECTED", fip_id="SBIN")
    assert isinstance(error, Exception)
    assert is_sahaj_error(error)
    assert error.type == "CONSENT_ERROR"
    assert error.fip_id == "SBIN"
    assert error.sandbox_vua == "9999999001"


def test_guards_non_errors():
    assert is_sahaj_error(ValueError("plain")) is False
    assert is_sahaj_error("CONSENT_REJECTED") is False
    assert is_sahaj_error(None) is False
