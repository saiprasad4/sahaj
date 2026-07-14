from sahaj import AA, total_deposit_balance_paise


def _fetch_healthy():
    aa = AA(mode="sandbox")
    consent = aa.consents.create(
        mobile="9999999999",
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )
    return consent, aa.data.fetch(consent.id)


def test_runs_consent_to_typed_data_with_no_credentials():
    consent, data = _fetch_healthy()
    assert consent.id.startswith("csnt_sandbox_")
    assert "/approve" in consent.redirect_url
    assert len(data.deposits) > 0
    assert data.consent_id == consent.id
    assert data.schema_version == "1.1.2"


def test_returns_a_money_safe_deposit_balance():
    _, data = _fetch_healthy()
    account = data.deposits[0]
    assert account.summary.currency == "INR"
    assert isinstance(account.summary.current_balance_paise, int)
    assert len(account.transactions) > 0
    for txn in account.transactions:
        assert isinstance(txn.amount_paise, int)
        assert txn.type in ("CREDIT", "DEBIT")


def test_totals_balances_across_delivered_accounts():
    _, data = _fetch_healthy()
    expected = sum(account.summary.current_balance_paise for account in data.deposits)
    assert total_deposit_balance_paise(data) == expected
