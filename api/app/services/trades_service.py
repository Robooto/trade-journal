"""Load tastytrade accounts and positions and enrich them with market, volatility and balance data."""
import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app import tastytrade
from app.services import position_grouping, position_math
from app.services.trades_errors import TastytradeAuthError, TastytradeFetchError
from app.services.values import tasty_dict, to_float


def acquire_token(db: Session) -> str:
    """Authenticate and return a session token."""
    try:
        return tastytrade.get_active_token(db)
    except Exception as e:
        logging.error(f"Authentication to Tastytrade failed: {e}")
        raise TastytradeAuthError(f"Authentication to Tastytrade failed: {e}") from e


def fetch_accounts(token: str) -> list[dict]:
    """Fetch the list of accounts for the authenticated user."""
    try:
        return [
            tasty_dict(account, by_alias=False)
            for account in tastytrade.fetch_accounts(token)
        ]
    except Exception as e:
        logging.error(f"Failed to fetch accounts: {e}")
        raise TastytradeFetchError(f"Failed to fetch accounts: {e}") from e


def collect_positions_and_symbols(
    token: str, accounts: list[dict]
) -> tuple[list[dict], set[str], set[str], set[str], set[str]]:
    """Fetch positions per account and gather unique symbols."""
    positions_by_account: list[dict] = []
    equity_option_syms: set[str] = set()
    future_option_syms: set[str] = set()
    equity_underlyings: set[str] = set()
    future_underlyings: set[str] = set()

    for acct in accounts:
        acct_num = acct.get("account_number")
        nickname = acct.get("nickname", "")
        try:
            raw_positions = [
                tasty_dict(position)
                for position in tastytrade.fetch_positions(token, acct_num)
            ]
        except Exception as e:
            logging.error(f"Failed to fetch positions for account {acct_num}: {e}")
            raise TastytradeFetchError(
                f"Failed to fetch positions for account {acct_num}: {e}"
            ) from e

        filtered = [p for p in raw_positions if p.get("instrument-type", "") != "Equity"]
        if not filtered:
            continue

        augmented: list[dict] = []
        for pos in filtered:
            p = pos.copy()
            symbol = p.get("symbol")
            inst_type = p.get("instrument-type", "")
            if symbol:
                if inst_type == "Equity Option":
                    equity_option_syms.add(symbol)
                elif inst_type == "Future Option":
                    future_option_syms.add(symbol)
            underlying = p.get("underlying-symbol")
            if underlying:
                if underlying.startswith("/"):
                    future_underlyings.add(underlying)
                else:
                    equity_underlyings.add(underlying)
            augmented.append(p)

        positions_by_account.append({
            "account_number": acct_num,
            "nickname": nickname,
            "positions": augmented,
        })

    return (
        positions_by_account,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    )


def fetch_market_and_beta_data(
    token: str,
    equity_option_syms: set[str],
    future_option_syms: set[str],
    equity_underlyings: set[str],
    future_underlyings: set[str],
) -> tuple[dict[str, dict], dict[str, float]]:
    """Retrieve option market data and underlying beta values in one request."""

    market_map: dict[str, dict] = {}
    beta_map: dict[str, float] = {}

    symbols_present = (
        equity_option_syms
        or future_option_syms
        or equity_underlyings
        or future_underlyings
    )
    if not symbols_present:
        return market_map, beta_map

    try:
        md_list = tastytrade.fetch_market_data(
            token,
            sorted(equity_underlyings),
            sorted(equity_option_syms),
            sorted(future_underlyings),
            sorted(future_option_syms),
        )
    except Exception as e:
        logging.error(f"Failed to fetch market/beta data: {e}")
        return market_map, beta_map

    for raw_item in md_list:
        item = tasty_dict(raw_item)
        sym = item.get("symbol")
        if not sym:
            continue
        if sym in equity_option_syms or sym in future_option_syms:
            market_map[sym] = item
        beta_val = item.get("beta")
        if beta_val is not None and (sym in equity_underlyings or sym in future_underlyings):
            try:
                beta_map[sym] = float(beta_val)
            except (ValueError, TypeError):
                pass

    return market_map, beta_map


def augment_positions_with_market_data(
    positions_by_account: list[dict], market_map: dict[str, dict], beta_map: dict[str, float]
) -> None:
    """Attach market data, compute P/L and beta for each position."""
    for acct in positions_by_account:
        for p in acct["positions"]:
            sym = p.get("symbol")
            if sym and sym in market_map:
                md_item = market_map[sym].copy()
                qty_dir = p.get("quantity-direction")
                direction_sign = position_math.direction_sign(qty_dir)
                quantity, multiplier = position_math.quantity_multiplier(p)
                delta_val = md_item.get("delta")
                if qty_dir and delta_val is not None:
                    try:
                        delta_float = abs(float(delta_val))
                    except (TypeError, ValueError):
                        pass
                    else:
                        if "C" in sym:
                            sign = 1 if qty_dir == "Long" else -1
                        elif "P" in sym:
                            sign = 1 if qty_dir == "Short" else -1
                        else:
                            sign = 1
                        md_item["computed_delta"] = round(sign * delta_float, 2)
                position_greek_sign = direction_sign * quantity * multiplier
                for greek in ("delta", "theta", "vega", "gamma", "rho"):
                    greek_value = to_float(md_item.get(greek))
                    if greek_value is not None:
                        md_item[f"computed_position_{greek}"] = round(
                            greek_value * position_greek_sign, 4
                        )
            else:
                md_item = {}

            p["market_data"] = md_item

            try:
                avg_open = float(p.get("average-open-price", "0"))
                mark = float(md_item.get("mark"))
                quantity, multiplier = position_math.quantity_multiplier(p)
                qty_dir = p.get("quantity-direction")
            except (TypeError, ValueError):
                approximate_pl = 0.0
            else:
                if qty_dir == "Long":
                    approximate_pl = (mark - avg_open) * quantity * multiplier
                else:
                    approximate_pl = (avg_open - mark) * quantity * multiplier

            p["approximate-p-l"] = round(approximate_pl, 2)
            p.update({
                key.replace("_", "-"): value
                for key, value in position_math.position_money_fields(p).items()
                if value is not None
            })

            underlying_sym = p.get("underlying-symbol")
            if underlying_sym in beta_map:
                p["beta"] = beta_map[underlying_sym]
                
            # Parse strike and option type for Equity Options
            inst_type = p.get("instrument-type")
            if inst_type == "Equity Option" and sym:
                strike, option_type = position_math.parse_equity_option_symbol(sym)
                if strike is not None:
                    p["strike"] = strike
                if option_type is not None:
                    p["option-type"] = option_type


def apply_volatility(token: str, accounts_data: list[dict]) -> None:
    """Augment groups with implied volatility information."""

    for acct in accounts_data:
        groups_list = acct["groups"]

        unique_roots = sorted({position_math.root_symbol(g["underlying_symbol"]) for g in groups_list if g["underlying_symbol"]})
        vol_rank_map: dict[str, float] = {}
        vol_change_map: dict[str, float] = {}
        if unique_roots:
            try:
                vol_data = tastytrade.fetch_volatility_data(token, unique_roots)
                for raw_item in vol_data:
                    item = tasty_dict(raw_item)
                    sym = item.get("symbol")
                    iv = item.get("implied-volatility-index-rank")
                    change = item.get("implied-volatility-index-5-day-change")
                    if sym is not None:
                        if iv is not None:
                            try:
                                vol_rank_map[sym] = round(float(iv) * 100, 1)
                            except (ValueError, TypeError):
                                vol_rank_map[sym] = None
                        if change is not None:
                            try:
                                vol_change_map[sym] = round(float(change) * 100, 2)
                            except (ValueError, TypeError):
                                vol_change_map[sym] = None
            except Exception as e:
                logging.error(f"Failed to fetch volatility data: {e}")

        for g in groups_list:
            root = position_math.root_symbol(g["underlying_symbol"])
            g["iv_rank"] = vol_rank_map.get(root)
            g["iv_5d_change"] = vol_change_map.get(root)


def apply_balance(token: str, accounts_data: list[dict]) -> None:
    """Attach normalized balance, utilization, and Greek risk context to each account."""

    for acct in accounts_data:
        acct_num = acct["account_number"]
        fetched_at = datetime.now(UTC).isoformat()
        warnings: list[str] = []
        values = {
            "net_liquidating_value_dollars": None,
            "margin_equity_dollars": None,
            "used_derivative_buying_power_dollars": None,
            "derivative_buying_power_dollars": None,
            "equity_buying_power_dollars": None,
        }

        try:
            bal = tasty_dict(tastytrade.fetch_account_balance(token, acct_num))
            values["margin_equity_dollars"] = to_float(bal.get("margin-equity"))
            values["net_liquidating_value_dollars"] = to_float(bal.get("net-liquidating-value")) or values["margin_equity_dollars"]
            values["used_derivative_buying_power_dollars"] = to_float(bal.get("used-derivative-buying-power"))
            values["derivative_buying_power_dollars"] = to_float(bal.get("derivative-buying-power"))
            values["equity_buying_power_dollars"] = to_float(bal.get("equity-buying-power"))
            if bal.get("net-liquidating-value") is None and values["margin_equity_dollars"] is not None:
                warnings.append("Net liquidating value unavailable; margin equity used as fallback.")
            missing = [label for key, label in (("net_liquidating_value_dollars", "net liquidating value"), ("used_derivative_buying_power_dollars", "used derivative buying power"), ("derivative_buying_power_dollars", "derivative buying power")) if values[key] is None]
            if missing:
                warnings.append("Missing " + ", ".join(missing) + ".")
            status = "partial" if missing or warnings else "ok"
        except Exception as e:
            logging.error(f"Failed to fetch balance for account {acct_num}: {e}")
            warnings.append("Brokerage balance could not be fetched.")
            status = "unavailable"

        net_liq = values["net_liquidating_value_dollars"]
        used = values["used_derivative_buying_power_dollars"]
        utilization = round(used / net_liq * 100, 1) if used is not None and net_liq else None
        theta = acct.get("theta_dollars_per_day")
        vega = acct.get("vega_dollars_per_vol_point")
        concentrations = position_grouping.underlying_concentrations(acct.get("groups", []))
        acct.update({
            **values,
            "percent_used_bp": int(utilization) if utilization is not None else None,
            "buying_power_utilization_percent": utilization,
            "buying_power_zone": position_grouping.buying_power_zone(utilization),
            "theta_percent_of_net_liq_per_day": round(theta / net_liq * 100, 4) if theta is not None and net_liq else None,
            "vega_plus_one_point_dollars": vega,
            "vega_plus_one_point_percent_of_net_liq": round(vega / net_liq * 100, 4) if vega is not None and net_liq else None,
            "underlying_concentrations": concentrations,
            "largest_underlying_concentration": concentrations[0] if concentrations else None,
            "balance_status": status,
            "balance_warnings": warnings,
            "balance_fetched_at": fetched_at,
        })


def load_positions(db: Session) -> list[dict]:
    """Every account's option positions, grouped into strategies with market, volatility and balance context."""
    token = acquire_token(db)
    accounts = fetch_accounts(token)
    (
        positions_by_account,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    ) = collect_positions_and_symbols(token, accounts)
    market_map, beta_map = fetch_market_and_beta_data(
        token,
        equity_option_syms,
        future_option_syms,
        equity_underlyings,
        future_underlyings,
    )
    augment_positions_with_market_data(positions_by_account, market_map, beta_map)
    accounts_data = position_grouping.group_positions_and_compute_totals(positions_by_account, beta_map)
    apply_volatility(token, accounts_data)
    apply_balance(token, accounts_data)
    return accounts_data
