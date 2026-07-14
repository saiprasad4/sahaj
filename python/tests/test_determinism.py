from sahaj import AA


def _fetch_once(seed: int):
    aa = AA(mode="sandbox", seed=seed)
    consent = aa.consents.create(
        mobile="9999999999",
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )
    return aa.data.fetch(consent.id)


def test_same_seed_produces_identical_data():
    first = _fetch_once(42)
    second = _fetch_once(42)
    assert first.deposits == second.deposits


def test_different_seed_produces_different_data():
    with_seed_one = _fetch_once(1)
    with_seed_two = _fetch_once(2)
    assert (
        with_seed_one.deposits[0].summary.current_balance_paise
        != with_seed_two.deposits[0].summary.current_balance_paise
    )


def test_generated_at_is_stable():
    assert _fetch_once(7).generated_at == _fetch_once(7).generated_at


def test_repeated_idempotency_key_returns_same_consent():
    aa = AA(mode="sandbox")
    kwargs = dict(
        mobile="9999999999",
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
        idempotency_key="key-abc",
    )
    first = aa.consents.create(**kwargs)
    second = aa.consents.create(**kwargs)
    assert second.id == first.id
