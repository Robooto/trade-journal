import logging
from datetime import datetime, timezone

from app import tastytrade
from app.schemas.brokerage import HoldingSnapshotV1
from app.services.brokerage_normalizer import build_holding_snapshot
from app.services.trades_errors import TastytradeFetchError


def fetch_holding_snapshot(
    token: str,
    *,
    fetched_at: datetime | None = None,
) -> HoldingSnapshotV1:
    fetched_at = fetched_at or datetime.now(timezone.utc)
    try:
        accounts = tastytrade.fetch_accounts(token)
    except Exception as exc:
        logging.exception("Failed to fetch brokerage accounts.")
        raise TastytradeFetchError(
            "Unable to fetch brokerage accounts."
        ) from exc

    positions_by_account = {}
    account_errors = {}
    for account in accounts:
        account_number = account.account_number
        try:
            positions_by_account[account_number] = tastytrade.fetch_positions(
                token, account_number
            )
        except Exception as exc:
            logging.exception(
                "Failed to fetch brokerage positions for account %s.",
                account_number,
            )
            positions_by_account[account_number] = []
            account_errors[account_number] = (
                "Brokerage positions are unavailable for this account "
                f"({type(exc).__name__})."
            )

    return build_holding_snapshot(
        accounts,
        positions_by_account,
        fetched_at=fetched_at,
        account_errors=account_errors,
    )
