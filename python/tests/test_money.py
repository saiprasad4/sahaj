import pytest

from sahaj import SahajError, format_paise, rupees_to_paise


def test_parses_whole_and_fractional_rupees_without_float():
    assert rupees_to_paise("152340.75") == 15234075
    assert rupees_to_paise("0.01") == 1
    assert rupees_to_paise("100") == 10000
    assert rupees_to_paise("100.5") == 10050


def test_handles_negative_amounts():
    assert rupees_to_paise("-42.50") == -4250


@pytest.mark.parametrize("bad", ["12.345", "abc", "", "1,000.00", "1.2.3"])
def test_rejects_malformed_amounts(bad):
    with pytest.raises(SahajError) as caught:
        rupees_to_paise(bad)
    assert caught.value.code == "SCHEMA_PARSE_FAILED"


def test_formats_indian_grouped_rupees():
    assert "1,52,340.75" in format_paise(15234075)
    assert format_paise(10000) == "₹100.00"
