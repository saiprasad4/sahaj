"""The sahaj quickstart. No keys, no FIU licence, no registration.

    uv run examples/quickstart.py

It creates a consent, runs the full data loop against the sandbox, and prints a
typed bank balance parsed from the ReBIT deposit schema.
"""

from sahaj import AA, format_paise, total_deposit_balance_paise


def main() -> None:
    aa = AA(mode="sandbox")  # no keys, no FIU licence needed

    consent = aa.consents.create(
        mobile="9999999999",  # magic VUA... healthy multi-account user
        fi_types=["DEPOSIT"],
        purpose="loan-underwriting",
        duration="P90D",
    )

    print("Approve here:", consent.redirect_url)  # in sandbox this auto-approves

    data = aa.data.fetch(consent.id)  # awaits ACTIVE, opens a session, decrypts, parses

    account = data.deposits[0]
    print(f"{account.fip_name} {account.masked_account_number}")
    print("Current balance:", format_paise(account.summary.current_balance_paise))
    print("Transactions:", len(account.transactions))
    print("Total across accounts:", format_paise(total_deposit_balance_paise(data)))


if __name__ == "__main__":
    main()
