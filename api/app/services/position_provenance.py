"""Tie open option legs to the order that opened them, so separate trades stay separate.

Positions from tastytrade carry no order history, so legs are otherwise grouped by
underlying and expiration, which merges two trades on the same expiration. The open
execution ledger lists every opening order (by group-fill ID, else order ID) with its
legs. A leg is stamped with its opening order only when that is unambiguous:

1. Orders whose legs include the leg's contract are candidates.
2. Prefer candidates whose legs are all still open: an older, closed trade on the same
   contract has a leg that is no longer held.
3. Several still-open candidates with the same contracts are adds to one position and
   share the earliest order's group; otherwise the leg is left unstamped, and so are
   the other legs of every trade it might belong to.

Unstamped legs keep the existing expiration/calendar grouping.
"""
from collections import defaultdict
from typing import Any

EXECUTION_GROUP_FIELD = "execution-group-id"
EXECUTION_SOURCE_FIELD = "execution-provenance"


def stamp_execution_groups(positions: list[dict], groups: list[Any]) -> list[str]:
    """Stamp positions in place; return the open option symbols no opening order covers."""
    option_positions = [p for p in positions if "Option" in str(p.get("instrument-type") or "") and p.get("symbol")]
    open_symbols = {str(p["symbol"]) for p in option_positions}
    by_symbol: dict[str, list[Any]] = defaultdict(list)
    for group in groups:
        if getattr(group, "provenance_source", None) not in {"group_fill", "order"}:
            continue
        for symbol in {str(leg.symbol) for leg in group.legs}:
            by_symbol[symbol].append(group)

    uncovered = []
    ambiguous_groups: set[str] = set()
    for position in option_positions:
        symbol = str(position["symbol"])
        candidates = by_symbol.get(symbol, [])
        if not candidates:
            uncovered.append(symbol)
            continue
        chosen = _choose(candidates, open_symbols)
        if chosen is None:
            ambiguous_groups.update(g.execution_group_id for g in candidates)
            continue
        position[EXECUTION_GROUP_FIELD] = chosen.execution_group_id
        position[EXECUTION_SOURCE_FIELD] = chosen.provenance_source
    # A contract shared by two trades (netted into one position) can't be split, so
    # neither trade is grouped by execution; this avoids partial structures.
    for position in option_positions:
        if position.get(EXECUTION_GROUP_FIELD) in ambiguous_groups:
            position.pop(EXECUTION_GROUP_FIELD, None)
            position.pop(EXECUTION_SOURCE_FIELD, None)
    return uncovered


def _choose(candidates: list[Any], open_symbols: set[str]) -> Any | None:
    if len(candidates) == 1:
        return candidates[0]
    still_open = [g for g in candidates if {str(leg.symbol) for leg in g.legs} <= open_symbols]
    if len(still_open) == 1:
        return still_open[0]
    if still_open and len({frozenset(str(leg.symbol) for leg in g.legs) for g in still_open}) == 1:
        return min(still_open, key=lambda g: (g.opened_at, g.execution_group_id))
    return None
