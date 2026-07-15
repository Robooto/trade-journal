from datetime import datetime, timezone

import pytest

from app import tastytrade
from app.schemas.brokerage import AssetClass, DataStatus
from app.services.brokerage_service import fetch_holding_snapshot
from app.services.trades_errors import TastytradeFetchError
from app.tastytrade_schema import TastyAccount, TastyPosition


FETCHED_AT = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)


def accounts():
    return [
        TastyAccount(
            **{
                "account-number": "FAKE-STOCKS",
                "nickname": "Stocks",
                "account-type-name": "Individual",
            }
        ),
        TastyAccount(
            **{
                "account-number": "FAKE-OPTIONS",
                "nickname": "Options",
                "account-type-name": "Individual",
            }
        ),
        TastyAccount(
            **{
                "account-number": "FAKE-EMPTY",
                "nickname": "Empty",
                "account-type-name": "Roth IRA",
            }
        ),
    ]


def test_fetch_holding_snapshot_preserves_all_accounts(monkeypatch):
    monkeypatch.setattr(tastytrade, "fetch_accounts", lambda token: accounts())

    def fake_positions(token, account_number):
        if account_number == "FAKE-STOCKS":
            return [
                TastyPosition(
                    **{
                        "instrument-type": "Equity",
                        "symbol": "AAPL",
                        "underlying-symbol": "AAPL",
                        "quantity": "10",
                        "quantity-direction": "Long",
                        "average-open-price": "150",
                        "mark": "210",
                        "multiplier": "1",
                    }
                )
            ]
        if account_number == "FAKE-OPTIONS":
            return [
                TastyPosition(
                    **{
                        "instrument-type": "Equity Option",
                        "symbol": "AAPL  260821P00200000",
                        "underlying-symbol": "AAPL",
                        "quantity": "1",
                        "quantity-direction": "Short",
                        "average-open-price": "2.50",
                        "mark": "1.75",
                        "multiplier": "100",
                    }
                )
            ]
        return []

    monkeypatch.setattr(tastytrade, "fetch_positions", fake_positions)

    snapshot = fetch_holding_snapshot("Bearer FAKE", fetched_at=FETCHED_AT)

    assert len(snapshot.accounts) == 3
    stocks = snapshot.accounts[0]
    options = snapshot.accounts[1]
    empty = snapshot.accounts[2]
    assert stocks.holdings[0].asset_class == AssetClass.EQUITY
    assert options.holdings[0].asset_class == AssetClass.EQUITY_OPTION
    assert empty.holdings == []
    assert empty.source.status == DataStatus.OK


def test_fetch_holding_snapshot_marks_one_account_unavailable(monkeypatch):
    monkeypatch.setattr(tastytrade, "fetch_accounts", lambda token: accounts())

    def fake_positions(token, account_number):
        if account_number == "FAKE-OPTIONS":
            raise TimeoutError("private upstream detail")
        return []

    monkeypatch.setattr(tastytrade, "fetch_positions", fake_positions)

    snapshot = fetch_holding_snapshot("Bearer FAKE", fetched_at=FETCHED_AT)

    unavailable = next(
        account
        for account in snapshot.accounts
        if account.account_number == "FAKE-OPTIONS"
    )
    assert unavailable.holdings == []
    assert unavailable.source.status == DataStatus.UNAVAILABLE
    assert unavailable.source.warnings == [
        "Brokerage positions are unavailable for this account (TimeoutError)."
    ]
    assert "private upstream detail" not in unavailable.source.warnings[0]


def test_fetch_holding_snapshot_fails_when_account_list_is_unavailable(
    monkeypatch,
):
    def fail_accounts(token):
        raise TimeoutError("private upstream detail")

    monkeypatch.setattr(tastytrade, "fetch_accounts", fail_accounts)

    with pytest.raises(
        TastytradeFetchError, match="Unable to fetch brokerage accounts"
    ):
        fetch_holding_snapshot("Bearer FAKE", fetched_at=FETCHED_AT)
