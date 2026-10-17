"""Build a tastytrade OCO exit (take-profit limit + stop) for one open position."""
from app.schemas.trades import BracketOrderRequest


def _is_credit_trade(quantity_direction: str, cost_effect: str | None) -> bool:
    direction = (quantity_direction or "").strip().lower()
    if direction == "short":
        return True
    if direction == "long":
        return False
    return (cost_effect or "").strip().lower() == "credit"


def _round_price(value: float) -> float:
    return round(float(value) + 1e-8, 2)


def _clamp_price(value: float) -> float:
    if value < 0.01:
        return 0.01
    return value


def build_bracket_payload(req: BracketOrderRequest) -> tuple[dict, float, float]:
    is_credit = _is_credit_trade(req.quantity_direction, req.cost_effect)
    entry_price = float(req.entry_price)
    if is_credit:
        take_profit_price = entry_price * (1 - req.take_profit_percent / 100)
        stop_loss_price = entry_price * (1 + req.stop_loss_percent / 100)
    else:
        take_profit_price = entry_price * (1 + req.take_profit_percent / 100)
        stop_loss_price = max(0.01, entry_price * (1 - req.stop_loss_percent / 100))

    take_profit_price = _round_price(_clamp_price(take_profit_price))
    stop_loss_price = _round_price(_clamp_price(stop_loss_price))

    action = "Buy to Close" if req.quantity_direction.strip().lower() == "short" else "Sell to Close"
    price_effect = "Debit" if is_credit else "Credit"

    payload = {
        "type": "OCO",
        "orders": [
            {
                "order-type": "Limit",
                "price": take_profit_price,
                "price-effect": price_effect,
                "time-in-force": "GTC",
                "legs": [
                    {
                        "symbol": req.symbol,
                        "instrument-type": req.instrument_type,
                        "action": action,
                        "quantity": req.quantity,
                    }
                ],
            },
            {
                "order-type": "Stop",
                "time-in-force": "GTC",
                "stop-trigger": stop_loss_price,
                "legs": [
                    {
                        "symbol": req.symbol,
                        "instrument-type": req.instrument_type,
                        "action": action,
                        "quantity": req.quantity,
                    }
                ],
            },
        ],
    }
    return payload, take_profit_price, stop_loss_price
