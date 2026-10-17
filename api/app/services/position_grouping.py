"""Group option positions into strategies and roll them up into account totals."""
from collections import defaultdict

from app.services import position_math
from app.services.position_provenance import EXECUTION_GROUP_FIELD, EXECUTION_SOURCE_FIELD
from app.services.strategy_classifier import classify_strategy
from app.services.values import to_float


def _position_group_key(position: dict) -> str:
    """Explicit grouping key: a broker group fill on the position, else its opening execution."""
    group_fill = str(position.get("ext-group-fill-id") or position.get("group-fill-id") or "").strip()
    if group_fill:
        return f"group-fill:{group_fill}"
    execution = str(position.get(EXECUTION_GROUP_FIELD) or "").strip()
    if execution:
        return f"execution-{position.get(EXECUTION_SOURCE_FIELD) or 'order'}:{execution}"
    return ""


def _position_quantity(position: dict) -> float:
    try:
        return abs(float(position.get("quantity") or 0))
    except (TypeError, ValueError):
        return 0


def _cross_expiration_candidate(
    left: dict,
    right: dict,
    *,
    same_strike: bool,
) -> bool:
    if (
        left.get("instrument-type") != "Equity Option"
        or right.get("instrument-type") != "Equity Option"
        or left.get("option-type") not in {"C", "P"}
        or left.get("option-type") != right.get("option-type")
        or left.get("quantity-direction") == right.get("quantity-direction")
        or position_math.extract_expiration_date(left.get("expires-at", ""))
        == position_math.extract_expiration_date(right.get("expires-at", ""))
        or _position_quantity(left) != _position_quantity(right)
    ):
        return False
    if same_strike:
        return left.get("strike") == right.get("strike")
    return left.get("strike") != right.get("strike")


def _pair_unambiguous_cross_expiration_legs(
    positions: list[dict],
    *,
    same_strike: bool,
) -> tuple[list[list[dict]], list[dict]]:
    expiration_dates = [
        position_math.extract_expiration_date(position.get("expires-at", ""))
        for position in positions
    ]
    expiration_counts: dict[str, int] = defaultdict(int)
    for expiration_date in expiration_dates:
        expiration_counts[expiration_date] += 1
    eligible = {
        index
        for index, expiration_date in enumerate(expiration_dates)
        if expiration_counts[expiration_date] == 1
    }
    candidates: dict[int, list[int]] = {}
    for left_index, left in enumerate(positions):
        candidates[left_index] = [
            right_index
            for right_index, right in enumerate(positions)
            if left_index in eligible
            and right_index in eligible
            and _cross_expiration_candidate(
                left,
                right,
                same_strike=same_strike,
            )
        ]

    paired: set[int] = set()
    groups: list[list[dict]] = []
    for left_index, matches in candidates.items():
        if left_index in paired or len(matches) != 1:
            continue
        right_index = matches[0]
        if (
            right_index in paired
            or candidates.get(right_index) != [left_index]
        ):
            continue
        paired.update({left_index, right_index})
        groups.append([positions[left_index], positions[right_index]])
    return groups, [
        position
        for index, position in enumerate(positions)
        if index not in paired
    ]


def _position_strategy_groups(
    positions: list[dict],
) -> list[tuple[tuple[str, str], list[dict]]]:
    by_underlying: dict[str, list[dict]] = defaultdict(list)
    for position in positions:
        by_underlying[position.get("underlying-symbol", "") or ""].append(position)

    result: list[tuple[tuple[str, str], list[dict]]] = []
    for underlying, underlying_positions in by_underlying.items():
        explicit: dict[str, list[dict]] = defaultdict(list)
        remaining = []
        for position in underlying_positions:
            group_key = _position_group_key(position)
            if group_key:
                explicit[group_key].append(position)
            else:
                remaining.append(position)
        result.extend(
            ((underlying, group_key), legs)
            for group_key, legs in explicit.items()
        )

        calendars, remaining = _pair_unambiguous_cross_expiration_legs(
            remaining,
            same_strike=True,
        )
        diagonals, remaining = _pair_unambiguous_cross_expiration_legs(
            remaining,
            same_strike=False,
        )
        result.extend(
            ((underlying, f"calendar:{index}"), legs)
            for index, legs in enumerate(calendars)
        )
        result.extend(
            ((underlying, f"diagonal:{index}"), legs)
            for index, legs in enumerate(diagonals)
        )

        by_expiration: dict[str, list[dict]] = defaultdict(list)
        for position in remaining:
            by_expiration[
                position_math.extract_expiration_date(position.get("expires-at", "") or "")
            ].append(position)
        result.extend(
            ((underlying, f"expiration:{expiration}"), legs)
            for expiration, legs in by_expiration.items()
        )
    return result


def group_positions_and_compute_totals(
    positions_by_account: list[dict], beta_map: dict[str, float]
) -> list[dict]:
    """Group positions into explicit or safely inferred option strategies."""
    accounts_data: list[dict] = []

    for acct in positions_by_account:
        acct_num = acct["account_number"]
        nickname = acct["nickname"]
        pos_list = acct["positions"]

        account_beta_delta = 0.0
        account_beta_delta_shares = 0.0
        account_delta_shares = 0.0
        account_theta_dollars_per_day = 0.0
        account_vega_dollars_per_vol_point = 0.0
        account_gamma_display = 0.0
        account_position_delta = 0.0
        account_theta = 0.0
        account_vega = 0.0
        account_gamma = 0.0
        account_rho = 0.0
        groups_list = []
        for (underlying, grouping_key), plist in _position_strategy_groups(pos_list):
            expiration_dates = sorted({
                position_math.extract_expiration_date(position.get("expires-at", "") or "")
                for position in plist
                if position_math.extract_expiration_date(position.get("expires-at", "") or "")
            })
            first_expires = min(
                (position.get("expires-at", "") for position in plist),
                key=position_math.extract_expiration_date,
                default="",
            )
            total_credit_unrounded = 0.0
            total_open_value_dollars = 0.0
            total_current_value_dollars = 0.0
            total_signed_current_value_dollars = 0.0
            total_unrealized_pl_dollars = 0.0
            total_assignment_exposure_dollars = 0.0
            current_price_unrounded = 0.0
            delta_sum_unrounded = 0.0
            position_delta_sum_unrounded = 0.0
            theta_sum_unrounded = 0.0
            vega_sum_unrounded = 0.0
            gamma_sum_unrounded = 0.0
            rho_sum_unrounded = 0.0

            multiplier = 1
            for idx, p in enumerate(plist):
                qty_dir = p.get("quantity-direction")
                try:
                    avg_open = float(p.get("average-open-price", "0"))
                except (ValueError, TypeError):
                    avg_open = 0.0
                try:
                    qty = int(p.get("quantity", 1))
                except (ValueError, TypeError):
                    qty = 1
                try:
                    pl_val = float(p.get("approximate-p-l", 0))
                except (ValueError, TypeError):
                    pl_val = 0.0

                if idx == 0:
                    _, multiplier = position_math.quantity_multiplier(p)

                sign = -1 if qty_dir == "Long" else 1
                total_credit_unrounded += sign * avg_open * qty
                current_price_unrounded += pl_val
                money_fields = position_math.position_money_fields(p)
                total_open_value_dollars += money_fields.get("open_value_dollars") or 0
                total_current_value_dollars += money_fields.get("current_value_dollars") or 0
                total_signed_current_value_dollars += money_fields.get("net_current_value_dollars") or 0
                total_unrealized_pl_dollars += money_fields.get("unrealized_pl_dollars") or 0
                total_assignment_exposure_dollars += position_math.assignment_exposure(p) or 0

                md = p.get("market_data", {})
                try:
                    delta_sum_unrounded += float(md.get("computed_delta", 0))
                except (TypeError, ValueError):
                    pass
                position_delta = to_float(md.get("computed_position_delta"))
                if position_delta is not None:
                    position_delta_sum_unrounded += position_delta
                theta = to_float(md.get("computed_position_theta"))
                if theta is not None:
                    theta_sum_unrounded += theta
                vega = to_float(md.get("computed_position_vega"))
                if vega is not None:
                    vega_sum_unrounded += vega
                gamma = to_float(md.get("computed_position_gamma"))
                if gamma is not None:
                    gamma_sum_unrounded += gamma
                rho = to_float(md.get("computed_position_rho"))
                if rho is not None:
                    rho_sum_unrounded += rho

            total_credit_received = round(total_credit_unrounded * multiplier, 2)
            current_group_p_l = round(current_price_unrounded, 2)
            if total_credit_received != 0:
                percent_credit_received = int((current_group_p_l / abs(total_credit_received)) * 100)
            else:
                percent_credit_received = None

            total_delta = round(delta_sum_unrounded, 2)
            delta_shares = round(position_delta_sum_unrounded, 2)
            theta_dollars_per_day = round(theta_sum_unrounded, 2)
            vega_dollars_per_vol_point = round(vega_sum_unrounded, 2)
            gamma_display = round(gamma_sum_unrounded, 4)
            total_position_delta = position_math.brokerage_greek_total(position_delta_sum_unrounded)
            total_theta = position_math.brokerage_greek_total(theta_sum_unrounded)
            total_vega = position_math.brokerage_greek_total(vega_sum_unrounded)
            total_gamma = position_math.brokerage_greek_total(gamma_sum_unrounded)
            total_rho = position_math.brokerage_greek_total(rho_sum_unrounded)
            account_delta_shares += delta_shares
            account_theta_dollars_per_day += theta_dollars_per_day
            account_vega_dollars_per_vol_point += vega_dollars_per_vol_point
            account_gamma_display += gamma_display
            account_position_delta += total_position_delta
            account_theta += total_theta
            account_vega += total_vega
            account_gamma += total_gamma
            account_rho += total_rho

            beta_val = beta_map.get(underlying)
            beta_delta = None
            beta_delta_shares = None
            if beta_val is not None:
                beta_delta = round(beta_val * total_delta, 2)
                beta_delta_shares = round(beta_val * delta_shares, 2)
                account_beta_delta += beta_delta
                account_beta_delta_shares += beta_delta_shares

            strategy = classify_strategy(plist)
            grouping_source = (
                "broker_group_fill"
                if grouping_key.startswith(("group-fill:", "execution-group_fill:"))
                else "broker_order"
                if grouping_key.startswith("execution-order:")
                else "inferred"
                if grouping_key.startswith(("calendar:", "diagonal:"))
                else "expiration"
            )

            groups_list.append({
                "underlying_symbol": underlying,
                "expires_at": first_expires,
                "expiration_dates": expiration_dates,
                "strategy_label": strategy["label"],
                "strategy_confidence": strategy["confidence"],
                "grouping_source": grouping_source,
                "total_credit_received": total_credit_received,
                "total_credit_points": round(total_credit_unrounded, 2),
                "total_credit_dollars": total_credit_received,
                "net_open_credit_or_debit_dollars": total_credit_received,
                "open_value_dollars": round(total_open_value_dollars, 2),
                "current_value_dollars": round(total_signed_current_value_dollars, 2),
                "gross_current_value_dollars": round(total_current_value_dollars, 2),
                "unrealized_pl_dollars": round(total_unrealized_pl_dollars, 2),
                "days_to_nearest_expiration": position_math.days_to_expiration(first_expires),
                "assignment_exposure_dollars": round(total_assignment_exposure_dollars, 2),
                "max_loss_dollars": None,
                "buying_power_effect_dollars": None,
                "current_group_p_l": current_group_p_l,
                "percent_credit_received": percent_credit_received,
                "percent_credit_captured": (
                    round((total_unrealized_pl_dollars / total_credit_received) * 100, 1)
                    if total_credit_received > 0
                    else None
                ),
                "percent_max_profit_or_target": None,
                "total_delta": total_delta,
                "delta_shares": delta_shares,
                "theta_dollars_per_day": theta_dollars_per_day,
                "vega_dollars_per_vol_point": vega_dollars_per_vol_point,
                "gamma_display": gamma_display,
                "total_position_delta": total_position_delta,
                "total_theta": total_theta,
                "total_vega": total_vega,
                "total_gamma": total_gamma,
                "total_rho": total_rho,
                "beta_delta": beta_delta,
                "beta_delta_raw": beta_delta,
                "beta_delta_shares": beta_delta_shares,
                "positions": plist,
            })

        accounts_data.append({
            "account_number": acct_num,
            "nickname": nickname,
            "groups": groups_list,
            "total_beta_delta": round(account_beta_delta, 2),
            "total_beta_delta_raw": round(account_beta_delta, 2),
            "total_beta_delta_shares": round(account_beta_delta_shares, 2),
            "delta_shares": round(account_delta_shares, 2),
            "theta_dollars_per_day": round(account_theta_dollars_per_day, 2),
            "vega_dollars_per_vol_point": round(account_vega_dollars_per_vol_point, 2),
            "gamma_display": round(account_gamma_display, 4),
            "total_position_delta": int(round(account_position_delta)),
            "total_theta": int(round(account_theta)),
            "total_vega": int(round(account_vega)),
            "total_gamma": int(round(account_gamma)),
            "total_rho": int(round(account_rho)),
        })

    return accounts_data


def buying_power_zone(utilization_percent: float | None) -> str:
    """Return the app's review zone; these thresholds are not brokerage rules."""
    if utilization_percent is None:
        return "unavailable"
    if utilization_percent < 20:
        return "low"
    if utilization_percent <= 40:
        return "comfortable"
    return "elevated"


def underlying_concentrations(groups: list[dict]) -> list[dict]:
    """Rank underlying Greek exposure by its share of absolute beta-delta."""
    by_underlying: dict[str, dict[str, float | int | str]] = {}
    for group in groups:
        symbol = group.get("underlying_symbol") or "Unknown"
        item = by_underlying.setdefault(symbol, {
            "underlying_symbol": symbol,
            "delta_shares": 0.0,
            "beta_delta_shares": 0.0,
            "group_count": 0,
            "beta_delta_group_count": 0,
            "delta_fallback_group_count": 0,
        })
        item["delta_shares"] = float(item["delta_shares"]) + (
            group.get("delta_shares") or 0
        )
        beta_delta = group.get("beta_delta_shares")
        item["beta_delta_shares"] = float(item["beta_delta_shares"]) + (
            beta_delta if beta_delta is not None else group.get("delta_shares") or 0
        )
        basis_key = (
            "beta_delta_group_count"
            if beta_delta is not None
            else "delta_fallback_group_count"
        )
        item[basis_key] = int(item[basis_key]) + 1
        item["group_count"] = int(item["group_count"]) + 1

    total_absolute_exposure = sum(
        abs(float(item["beta_delta_shares"])) for item in by_underlying.values()
    )
    results = []
    for item in by_underlying.values():
        beta_count = int(item["beta_delta_group_count"])
        fallback_count = int(item["delta_fallback_group_count"])
        exposure_basis = (
            "mixed" if beta_count and fallback_count
            else "beta_delta_shares" if beta_count
            else "delta_shares_fallback"
        )
        results.append({
            "underlying_symbol": item["underlying_symbol"],
            "delta_shares": round(float(item["delta_shares"]), 2),
            "beta_delta_shares": round(float(item["beta_delta_shares"]), 2),
            "absolute_beta_delta_share_percent": (
                round(
                    abs(float(item["beta_delta_shares"]))
                    / total_absolute_exposure
                    * 100,
                    1,
                )
                if total_absolute_exposure
                else None
            ),
            "group_count": item["group_count"],
            "exposure_basis": exposure_basis,
        })
    return sorted(results, key=lambda item: abs(item["beta_delta_shares"]), reverse=True)
