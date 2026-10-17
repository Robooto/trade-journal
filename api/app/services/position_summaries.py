"""Compact market, volatility and position summaries for LLM/assistant consumers."""
from collections import defaultdict
from typing import Any

from app.services import position_math
from app.services.strategy_classifier import classify_strategy
from app.services.values import tasty_dict


def build_market_data_summary(items: list[Any], requested_symbols: list[str]) -> dict:
    """Return a compact, numeric market data payload suitable for LLM context."""
    normalized = []
    seen_symbols = set()

    for raw_item in items:
        item = tasty_dict(raw_item)
        symbol = item.get("symbol")
        if not symbol:
            continue
        seen_symbols.add(symbol)
        normalized.append(position_math.compact_dict({
            "symbol": symbol,
            "mark": position_math.numeric_field(item, "mark"),
            "open": position_math.numeric_field(item, "open"),
            "close": position_math.numeric_field(item, "close"),
            "bid": position_math.numeric_field(item, "bid"),
            "ask": position_math.numeric_field(item, "ask"),
            "last": position_math.numeric_field(item, "last", "last-price"),
            "beta": position_math.numeric_field(item, "beta"),
            "delta": position_math.numeric_field(item, "delta"),
            "theta": position_math.numeric_field(item, "theta"),
            "vega": position_math.numeric_field(item, "vega"),
            "gamma": position_math.numeric_field(item, "gamma"),
            "rho": position_math.numeric_field(item, "rho"),
            "implied_volatility": position_math.numeric_field(
                item,
                "implied-volatility",
                "implied-volatility-index",
                "volatility",
            ),
        }))

    return {
        "items": normalized,
        "requested_symbols": requested_symbols,
        "missing_symbols": [
            symbol for symbol in requested_symbols if symbol not in seen_symbols
        ],
    }


def build_volatility_data_summary(items: list[Any], requested_symbols: list[str]) -> dict:
    """Return compact volatility data with percentages already scaled for humans."""
    normalized = []
    seen_symbols = set()

    for raw_item in items:
        item = tasty_dict(raw_item)
        symbol = item.get("symbol")
        if not symbol:
            continue
        seen_symbols.add(symbol)
        iv_rank = position_math.numeric_field(item, "implied-volatility-index-rank")
        iv_change = position_math.numeric_field(item, "implied-volatility-index-5-day-change")
        normalized.append(position_math.compact_dict({
            "symbol": symbol,
            "iv_rank_percent": round(iv_rank * 100, 1) if iv_rank is not None else None,
            "iv_5d_change_percent": round(iv_change * 100, 2) if iv_change is not None else None,
        }))

    return {
        "items": normalized,
        "requested_symbols": requested_symbols,
        "missing_symbols": [
            symbol for symbol in requested_symbols if symbol not in seen_symbols
        ],
    }


def build_llm_positions_summary(accounts_data: list[dict]) -> dict:
    """Strip broker-specific nesting from grouped positions for LLM consumers."""
    accounts = []
    portfolio = {
        "account_count": 0,
        "group_count": 0,
        "strategy_group_count": 0,
        "position_count": 0,
        "percent_used_bp": None,
        "net_liquidating_value_dollars": 0.0,
        "used_derivative_buying_power_dollars": 0.0,
        "derivative_buying_power_dollars": 0.0,
        "buying_power_utilization_percent": None,
        "theta_percent_of_net_liq_per_day": None,
        "vega_plus_one_point_dollars": 0.0,
        "vega_plus_one_point_percent_of_net_liq": None,
        "balance_account_count": 0,
        "total_beta_delta": 0.0,
        "total_beta_delta_raw": 0.0,
        "total_beta_delta_shares": 0.0,
        "total_position_delta": 0,
        "delta_shares": 0,
        "theta_dollars_per_day": 0,
        "vega_dollars_per_vol_point": 0,
        "gamma_display": 0,
        "theta": 0,
        "vega": 0,
        "gamma": 0,
        "rho": 0,
        "unrealized_pl_dollars": 0.0,
        "assignment_exposure_dollars": 0.0,
        "max_loss_dollars": None,
        "buying_power_effect_dollars": None,
    }
    percent_used_values = []

    for account in accounts_data:
        portfolio["account_count"] += 1
        if account.get("percent_used_bp") is not None:
            percent_used_values.append(account["percent_used_bp"])
        net_liq = account.get("net_liquidating_value_dollars")
        used_buying_power = account.get("used_derivative_buying_power_dollars")
        if net_liq is not None and used_buying_power is not None:
            portfolio["balance_account_count"] += 1
            portfolio["net_liquidating_value_dollars"] += net_liq
            portfolio["used_derivative_buying_power_dollars"] += used_buying_power
            portfolio["derivative_buying_power_dollars"] += (
                account.get("derivative_buying_power_dollars") or 0
            )
        portfolio["total_beta_delta"] += account.get("total_beta_delta") or 0
        portfolio["total_beta_delta_raw"] += account.get("total_beta_delta_raw") or account.get("total_beta_delta") or 0
        portfolio["total_beta_delta_shares"] += account.get("total_beta_delta_shares") or 0
        portfolio["total_position_delta"] += account.get("total_position_delta") or 0
        portfolio["delta_shares"] += account.get("delta_shares") or account.get("total_position_delta") or 0
        portfolio["theta_dollars_per_day"] += account.get("theta_dollars_per_day") or account.get("total_theta") or 0
        portfolio["vega_dollars_per_vol_point"] += account.get("vega_dollars_per_vol_point") or account.get("total_vega") or 0
        portfolio["gamma_display"] += account.get("gamma_display") or account.get("total_gamma") or 0
        portfolio["theta"] += account.get("total_theta") or 0
        portfolio["vega"] += account.get("total_vega") or 0
        portfolio["gamma"] += account.get("total_gamma") or 0
        portfolio["rho"] += account.get("total_rho") or 0

        groups = []
        positions_by_underlying: dict[str, list[dict]] = defaultdict(list)
        for group in account.get("groups", []):
            portfolio["group_count"] += 1
            positions = []
            for position in group.get("positions", []):
                portfolio["position_count"] += 1
                underlying = position.get("underlying-symbol") or group.get("underlying_symbol", "")
                if underlying:
                    positions_by_underlying[underlying].append(position)
                market_data = position.get("market_data", {})
                money_fields = position_math.position_money_fields(position)
                assignment_exposure_dollars = position_math.assignment_exposure(position)
                positions.append(position_math.compact_dict({
                    "symbol": position.get("symbol") or position.get("instrument-symbol"),
                    "instrument_type": position.get("instrument-type"),
                    "underlying_symbol": position.get("underlying-symbol") or underlying,
                    "expiration_date": position_math.extract_expiration_date(position.get("expires-at", "")),
                    "days_to_expiration": position_math.days_to_expiration(position.get("expires-at", "")),
                    "quantity": position_math.optional_int(position.get("quantity")),
                    "quantity_direction": position.get("quantity-direction"),
                    "multiplier": position_math.quantity_multiplier(position)[1],
                    "average_open_price": position_math.numeric_field(position, "average-open-price"),
                    "mark": position_math.numeric_field(market_data, "mark"),
                    **money_fields,
                    "approximate_pl": position_math.numeric_field(position, "approximate-p-l"),
                    "strike": position_math.numeric_field(position, "strike"),
                    "option_type": position.get("option-type"),
                    "delta_shares": position_math.numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta_dollars_per_day": position_math.numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega_dollars_per_vol_point": position_math.numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma_display": position_math.numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "delta": position_math.numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta": position_math.numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega": position_math.numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma": position_math.numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "rho": position_math.numeric_field(market_data, "computed_position_rho", "rho"),
                    "assignment_exposure_dollars": assignment_exposure_dollars,
                    "max_loss_dollars": position_math.numeric_field(position, "max-loss", "max_loss"),
                    "buying_power_effect_dollars": position_math.numeric_field(
                        position,
                        "buying-power-effect",
                        "buying_power_effect",
                        "buying-power-effect-dollars",
                    ),
                }))

            strategy = classify_strategy(group.get("positions", []))
            management_flags = position_math.management_flags(
                strategy_label=strategy["label"],
                days_to_nearest_expiration=group.get("days_to_nearest_expiration"),
                percent_credit_captured=group.get("percent_credit_captured"),
                beta_delta_shares=group.get("beta_delta_shares"),
                theta_dollars_per_day=group.get("theta_dollars_per_day", group.get("total_theta")),
                vega_dollars_per_vol_point=group.get("vega_dollars_per_vol_point", group.get("total_vega")),
                assignment_exposure_dollars=group.get("assignment_exposure_dollars"),
                positions=group.get("positions", []),
            )
            portfolio["unrealized_pl_dollars"] += group.get("unrealized_pl_dollars") or 0
            portfolio["assignment_exposure_dollars"] += group.get("assignment_exposure_dollars") or 0
            groups.append(position_math.compact_dict({
                "underlying_symbol": group.get("underlying_symbol", ""),
                "expiration_date": position_math.extract_expiration_date(group.get("expires_at", "")),
                "total_credit_received": group.get("total_credit_received", 0),
                "total_credit_points": group.get("total_credit_points"),
                "total_credit_dollars": group.get("total_credit_dollars"),
                "net_open_credit_or_debit_dollars": group.get("net_open_credit_or_debit_dollars"),
                "open_value_dollars": group.get("open_value_dollars"),
                "current_value_dollars": group.get("current_value_dollars"),
                "gross_current_value_dollars": group.get("gross_current_value_dollars"),
                "unrealized_pl_dollars": group.get("unrealized_pl_dollars"),
                "days_to_nearest_expiration": group.get("days_to_nearest_expiration"),
                "assignment_exposure_dollars": group.get("assignment_exposure_dollars"),
                "max_loss_dollars": group.get("max_loss_dollars"),
                "buying_power_effect_dollars": group.get("buying_power_effect_dollars"),
                "current_pl": group.get("current_group_p_l", 0),
                "percent_credit_received": group.get("percent_credit_received"),
                "percent_credit_captured": group.get("percent_credit_captured"),
                "percent_max_profit_or_target": group.get("percent_max_profit_or_target"),
                "total_delta": group.get("total_delta"),
                "total_position_delta": group.get("total_position_delta"),
                "beta_delta": group.get("beta_delta"),
                "beta_delta_raw": group.get("beta_delta_raw"),
                "beta_delta_shares": group.get("beta_delta_shares"),
                "delta_shares": group.get("delta_shares", group.get("total_position_delta")),
                "theta_dollars_per_day": group.get("theta_dollars_per_day", group.get("total_theta")),
                "vega_dollars_per_vol_point": group.get("vega_dollars_per_vol_point", group.get("total_vega")),
                "gamma_display": group.get("gamma_display", group.get("total_gamma")),
                "theta": group.get("total_theta"),
                "vega": group.get("total_vega"),
                "gamma": group.get("total_gamma"),
                "rho": group.get("total_rho"),
                "iv_rank_percent": group.get("iv_rank"),
                "iv_5d_change_percent": group.get("iv_5d_change"),
                "strategy": strategy,
                "management_flags": management_flags,
                "positions": positions,
            }))

        underlying_strategies = []
        strategy_groups = []
        for underlying_symbol, underlying_positions in sorted(positions_by_underlying.items()):
            strategy = classify_strategy(underlying_positions)
            expiration_dates = sorted({
                position_math.extract_expiration_date(position.get("expires-at", ""))
                for position in underlying_positions
                if position.get("expires-at")
            })
            nearest_dte_values = [
                dte
                for dte in (position_math.days_to_expiration(position.get("expires-at", "")) for position in underlying_positions)
                if dte is not None
            ]
            total_open = round(sum(
                position_math.position_money_fields(position).get("net_open_credit_or_debit_dollars") or 0
                for position in underlying_positions
            ), 2)
            total_current = round(sum(
                position_math.position_money_fields(position).get("net_current_value_dollars") or 0
                for position in underlying_positions
            ), 2)
            total_unrealized = round(sum(
                position_math.position_money_fields(position).get("unrealized_pl_dollars") or 0
                for position in underlying_positions
            ), 2)
            assignment_exposure = round(sum(
                position_math.assignment_exposure(position) or 0 for position in underlying_positions
            ), 2)
            theta = int(round(sum(
                position_math.numeric_field(position.get("market_data", {}), "computed_position_theta") or 0
                for position in underlying_positions
            )))
            vega = int(round(sum(
                position_math.numeric_field(position.get("market_data", {}), "computed_position_vega") or 0
                for position in underlying_positions
            )))
            delta_shares = int(round(sum(
                position_math.numeric_field(position.get("market_data", {}), "computed_position_delta") or 0
                for position in underlying_positions
            )))
            gamma = int(round(sum(
                position_math.numeric_field(position.get("market_data", {}), "computed_position_gamma") or 0
                for position in underlying_positions
            )))
            beta = position_math.numeric_field(underlying_positions[0], "beta") if underlying_positions else None
            beta_delta_shares = round(delta_shares * beta, 2) if beta is not None else None
            percent_credit_captured = (
                round((total_unrealized / total_open) * 100, 1) if total_open > 0 else None
            )
            nearest_dte = min(nearest_dte_values) if nearest_dte_values else None
            legs = []
            for position in underlying_positions:
                market_data = position.get("market_data", {})
                legs.append(position_math.compact_dict({
                    "symbol": position.get("symbol") or position.get("instrument-symbol"),
                    "instrument_type": position.get("instrument-type"),
                    "underlying_symbol": position.get("underlying-symbol") or underlying_symbol,
                    "expiration_date": position_math.extract_expiration_date(position.get("expires-at", "")),
                    "days_to_expiration": position_math.days_to_expiration(position.get("expires-at", "")),
                    "quantity": position_math.optional_int(position.get("quantity")),
                    "quantity_direction": position.get("quantity-direction"),
                    "multiplier": position_math.quantity_multiplier(position)[1],
                    "strike": position_math.numeric_field(position, "strike"),
                    "option_type": position.get("option-type"),
                    "average_open_price": position_math.numeric_field(position, "average-open-price"),
                    "mark": position_math.numeric_field(market_data, "mark"),
                    **position_math.position_money_fields(position),
                    "approximate_pl": position_math.numeric_field(position, "approximate-p-l"),
                    "delta_shares": position_math.numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta_dollars_per_day": position_math.numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega_dollars_per_vol_point": position_math.numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma_display": position_math.numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "delta": position_math.numeric_field(market_data, "computed_position_delta", "delta"),
                    "theta": position_math.numeric_field(market_data, "computed_position_theta", "theta"),
                    "vega": position_math.numeric_field(market_data, "computed_position_vega", "vega"),
                    "gamma": position_math.numeric_field(market_data, "computed_position_gamma", "gamma"),
                    "rho": position_math.numeric_field(market_data, "computed_position_rho", "rho"),
                    "assignment_exposure_dollars": position_math.assignment_exposure(position),
                }))
            strategy_group = position_math.compact_dict({
                "underlying_symbol": underlying_symbol,
                "strategy": strategy,
                "leg_count": len(underlying_positions),
                "expiration_dates": expiration_dates,
                "legs": legs,
                "net_open_credit_or_debit_dollars": total_open,
                "current_value_dollars": total_current,
                "unrealized_pl_dollars": total_unrealized,
                "percent_credit_captured": percent_credit_captured,
                "percent_max_profit_or_target": None,
                "days_to_nearest_expiration": nearest_dte,
                "theta_dollars_per_day": theta,
                "vega_dollars_per_vol_point": vega,
                "delta_shares": delta_shares,
                "gamma_display": gamma,
                "beta_delta_raw": None,
                "beta_delta_shares": beta_delta_shares,
                "assignment_exposure_dollars": assignment_exposure,
                "max_loss_dollars": None,
                "buying_power_effect_dollars": None,
                "management_flags": position_math.management_flags(
                    strategy_label=strategy["label"],
                    days_to_nearest_expiration=nearest_dte,
                    percent_credit_captured=percent_credit_captured,
                    beta_delta_shares=beta_delta_shares,
                    theta_dollars_per_day=theta,
                    vega_dollars_per_vol_point=vega,
                    assignment_exposure_dollars=assignment_exposure,
                    positions=underlying_positions,
                ),
            })
            strategy_groups.append(strategy_group)
            portfolio["strategy_group_count"] += 1
            if strategy["label"] != "unknown":
                underlying_strategies.append({
                    "underlying_symbol": underlying_symbol,
                    "leg_count": len(underlying_positions),
                    "expiration_dates": expiration_dates,
                    **strategy,
                })

        accounts.append(position_math.compact_dict({
            "account_number": account.get("account_number", ""),
            "nickname": account.get("nickname", ""),
            "percent_used_bp": account.get("percent_used_bp"),
            "net_liquidating_value_dollars": account.get("net_liquidating_value_dollars"),
            "margin_equity_dollars": account.get("margin_equity_dollars"),
            "used_derivative_buying_power_dollars": account.get("used_derivative_buying_power_dollars"),
            "derivative_buying_power_dollars": account.get("derivative_buying_power_dollars"),
            "equity_buying_power_dollars": account.get("equity_buying_power_dollars"),
            "buying_power_utilization_percent": account.get("buying_power_utilization_percent"),
            "buying_power_zone": account.get("buying_power_zone", "unavailable"),
            "theta_percent_of_net_liq_per_day": account.get("theta_percent_of_net_liq_per_day"),
            "vega_plus_one_point_dollars": account.get("vega_plus_one_point_dollars"),
            "vega_plus_one_point_percent_of_net_liq": account.get("vega_plus_one_point_percent_of_net_liq"),
            "underlying_concentrations": account.get("underlying_concentrations", []),
            "largest_underlying_concentration": account.get("largest_underlying_concentration"),
            "balance_status": account.get("balance_status", "unavailable"),
            "balance_warnings": account.get("balance_warnings", []),
            "balance_fetched_at": account.get("balance_fetched_at"),
            "total_beta_delta": account.get("total_beta_delta"),
            "total_beta_delta_raw": account.get("total_beta_delta_raw"),
            "total_beta_delta_shares": account.get("total_beta_delta_shares"),
            "total_position_delta": account.get("total_position_delta"),
            "delta_shares": account.get("delta_shares", account.get("total_position_delta")),
            "theta_dollars_per_day": account.get("theta_dollars_per_day", account.get("total_theta")),
            "vega_dollars_per_vol_point": account.get("vega_dollars_per_vol_point", account.get("total_vega")),
            "gamma_display": account.get("gamma_display", account.get("total_gamma")),
            "theta": account.get("total_theta"),
            "vega": account.get("total_vega"),
            "gamma": account.get("total_gamma"),
            "rho": account.get("total_rho"),
            "underlying_strategies": underlying_strategies,
            "strategy_groups": strategy_groups,
            "groups": groups,
        }))

    if percent_used_values:
        portfolio["percent_used_bp"] = max(percent_used_values)
    net_liq = portfolio["net_liquidating_value_dollars"]
    if portfolio["balance_account_count"] and net_liq:
        portfolio["buying_power_utilization_percent"] = round(
            portfolio["used_derivative_buying_power_dollars"] / net_liq * 100, 1
        )
        portfolio["theta_percent_of_net_liq_per_day"] = round(
            portfolio["theta_dollars_per_day"] / net_liq * 100, 4
        )
        portfolio["vega_plus_one_point_percent_of_net_liq"] = round(
            portfolio["vega_dollars_per_vol_point"] / net_liq * 100, 4
        )
    else:
        portfolio["net_liquidating_value_dollars"] = None
        portfolio["used_derivative_buying_power_dollars"] = None
        portfolio["derivative_buying_power_dollars"] = None
    portfolio["vega_plus_one_point_dollars"] = portfolio["vega_dollars_per_vol_point"]
    portfolio["total_beta_delta"] = round(portfolio["total_beta_delta"], 2)
    portfolio["total_beta_delta_raw"] = round(portfolio["total_beta_delta_raw"], 2)
    portfolio["total_beta_delta_shares"] = round(portfolio["total_beta_delta_shares"], 2)
    portfolio["unrealized_pl_dollars"] = round(portfolio["unrealized_pl_dollars"], 2)
    portfolio["assignment_exposure_dollars"] = round(portfolio["assignment_exposure_dollars"], 2)

    units = {
        "mark": "price",
        "close": "price",
        "average_open_price": "price",
        "total_credit_received": "legacy dollars; use total_credit_points/total_credit_dollars",
        "total_credit_points": "option points, signed credit positive and debit negative",
        "total_credit_dollars": "dollars, signed credit positive and debit negative",
        "net_open_credit_or_debit_dollars": "dollars, credit positive and debit negative",
        "open_value_dollars": "absolute dollars per leg or gross group dollars",
        "current_value_dollars": "absolute dollars per leg; signed net dollars for groups",
        "unrealized_pl_dollars": "dollars",
        "assignment_exposure_dollars": "dollars",
        "max_loss_dollars": "dollars or null when unknown",
        "buying_power_effect_dollars": "dollars or null when unknown",
        "current_pl": "dollars",
        "approximate_pl": "dollars",
        "percent_used_bp": "legacy whole percent; use buying_power_utilization_percent",
        "net_liquidating_value_dollars": "dollars; broker net liquidating value, with margin equity fallback noted in balance_warnings",
        "margin_equity_dollars": "dollars",
        "used_derivative_buying_power_dollars": "dollars",
        "derivative_buying_power_dollars": "dollars available as reported by brokerage",
        "equity_buying_power_dollars": "dollars available as reported by brokerage",
        "buying_power_utilization_percent": "used derivative buying power divided by net liquidating value; percent",
        "theta_percent_of_net_liq_per_day": "theta dollars per day divided by net liquidating value; percent",
        "vega_plus_one_point_dollars": "estimated signed dollar change for a one-point increase in implied volatility",
        "vega_plus_one_point_percent_of_net_liq": "signed +1 volatility-point estimate divided by net liquidating value; percent",
        "absolute_beta_delta_share_percent": "share of total absolute Greek exposure; beta-delta shares when available, delta-shares fallback otherwise; not capital or notional concentration",
        "balance_fetched_at": "UTC timestamp when the app fetched the brokerage balance",
        "percent_credit_received": "legacy percent; use percent_credit_captured for credit trades",
        "percent_credit_captured": "percent of opening credit captured for net credit trades; null otherwise",
        "percent_max_profit_or_target": "percent or null when not available",
        "iv_rank_percent": "percent",
        "iv_5d_change_percent": "percent",
        "days_to_expiration": "calendar days",
        "days_to_nearest_expiration": "calendar days",
        "total_delta": "raw option delta sum",
        "total_position_delta": "legacy delta shares integer; use delta_shares",
        "delta_shares": "share-equivalent delta",
        "theta_dollars_per_day": "dollars per day",
        "vega_dollars_per_vol_point": "dollars per 1 volatility point",
        "gamma_display": "brokerage display integer",
        "theta": "brokerage display integer",
        "vega": "brokerage display integer",
        "gamma": "brokerage display integer",
        "rho": "brokerage display integer",
        "beta_delta": "legacy raw option beta-weighted delta",
        "beta_delta_raw": "raw option beta-weighted delta",
        "beta_delta_shares": "share-equivalent beta-weighted delta",
    }

    return {
        "portfolio": position_math.compact_dict(portfolio),
        "units": units,
        "accounts": accounts,
    }
