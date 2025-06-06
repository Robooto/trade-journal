import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List, Tuple

from app.db import get_db
from app import tastytrade

router = APIRouter(
    prefix="/v1/trades",
    tags=["v1 – trades"]
)

@router.get("", summary="Get all non-equity positions grouped by underlying-symbol and expiration")
def get_all_positions(db: Session = Depends(get_db)):
    """
    Retrieve all positions across all accounts, excluding:
      - Entire accounts that have no non-Equity positions.
      - Any individual position where "instrument-type" == "Equity".
    For each remaining position:
      1. Compute an 'approximate-p-l'.
      2. Group by 'underlying-symbol' and 'expires-at'.
      3. For each group, compute:
         - total_credit_received (rounded to 2 decimals)
         - current_group_price (rounded to 2 decimals)
         - group_approximate_p_l = total_credit_received - current_group_price (rounded to 2 decimals)
         - percent-credit-received = int((group_approximate_p_l / total_credit_received) * 100), or None
    """
    try:
        token = tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise HTTPException(status_code=500, detail=f"Authentication to Tastytrade failed: {e}")

    try:
        account_numbers = tastytrade.fetch_account_numbers(token)
    except Exception as e:
        logging.error(f"Failed to fetch accounts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch accounts: {e}")

    accounts_data = []
    for acct in account_numbers:
        try:
            raw_positions = tastytrade.fetch_positions(token, acct)
        except Exception as e:
            logging.error(f"Failed to fetch positions for account {acct}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch positions for account {acct}: {e}")

        # 1) Filter out any position where instrument-type == "Equity"
        filtered_positions = [
            pos for pos in raw_positions
            if pos.get("instrument-type", "") != "Equity"
        ]

        # If no positions remain after filtering, skip this account
        if not filtered_positions:
            continue

        # 2) Compute approximate P/L on each remaining position
        augmented_positions = []
        for pos in filtered_positions:
            try:
                avg_open = float(pos.get("average-open-price", "0"))
                avg_close = float(pos.get("average-daily-market-close-price", "0"))
                quantity = int(pos.get("quantity", 1))
            except (ValueError, TypeError):
                approximate_pl = 0.0
            else:
                approximate_pl = (avg_open - avg_close) * quantity

            p = pos.copy()
            p["approximate-p-l"] = approximate_pl
            augmented_positions.append(p)

        # 3) Group by (underlying-symbol, expires-at)
        grouping: Dict[Tuple[str, str], List[Dict]] = defaultdict(list)
        for p in augmented_positions:
            underlying = p.get("underlying-symbol", "") or ""
            expires = p.get("expires-at", "") or ""
            grouping[(underlying, expires)].append(p)

        # 4) Build each group’s metrics
        groups_list = []
        for (underlying, expires), pos_list in grouping.items():
            # Accumulate unrounded totals
            total_credit_unrounded = 0.0
            current_credit_unrounded = 0.0

            for p in pos_list:
                cost_effect = p.get("cost-effect", "")
                try:
                    avg_open = float(p.get("average-open-price", "0"))
                except (ValueError, TypeError):
                    avg_open = 0.0
                try:
                    close_price = float(p.get("close-price", "0"))
                except (ValueError, TypeError):
                    close_price = 0.0

                if cost_effect == "Debit":
                    total_credit_unrounded += avg_open
                    current_credit_unrounded += close_price
                elif cost_effect == "Credit":
                    total_credit_unrounded -= avg_open
                    current_credit_unrounded -= close_price

            # Round money values to 2 decimals
            total_credit_received = round(total_credit_unrounded, 2)
            current_group_price = round(current_credit_unrounded, 2)
            group_pl = round(total_credit_received - current_group_price, 2)

            # Compute percent-credit-received = int((group_pl / total_credit_received) * 100)
            if total_credit_received != 0:
                percent_credit_received = int((group_pl / total_credit_received) * 100)
            else:
                percent_credit_received = None

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": expires,
                "total_credit_received": total_credit_received,
                "current_group_price": current_group_price,
                "group_approximate_p_l": group_pl,
                "percent-credit-received": percent_credit_received,
                "positions": pos_list
            })

        if groups_list:
            accounts_data.append({
                "account_number": acct,
                "groups": groups_list
            })

    return {"accounts": accounts_data}
