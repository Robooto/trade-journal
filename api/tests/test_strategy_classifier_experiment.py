import pytest

from app.services.strategy_classifier import classify_strategy


def leg(option_type, strike, expiration, direction):
    return {
        "option_type": option_type,
        "strike": strike,
        "expiration_date": expiration,
        "quantity_direction": direction,
    }


@pytest.mark.parametrize(
    ("positions", "expected"),
    [
        (
            [leg("P", 700, "2026-06-19", "Short")],
            "short_put",
        ),
        (
            [
                leg("P", 700, "2026-06-19", "Short"),
                leg("C", 760, "2026-06-19", "Short"),
                leg("C", 770, "2026-06-19", "Long"),
            ],
            "jade_lizard",
        ),
        (
            [
                leg("P", 700, "2026-06-19", "Short"),
                leg("P", 700, "2026-07-17", "Long"),
            ],
            "calendar",
        ),
        (
            [
                leg("P", 700, "2026-06-19", "Short"),
                leg("P", 690, "2026-07-17", "Long"),
            ],
            "diagonal",
        ),
        (
            [
                leg("P", 700, "2026-06-19", "Short"),
                leg("P", 690, "2026-06-19", "Long"),
            ],
            "put_vertical",
        ),
        (
            [
                leg("P", 700, "2026-06-19", "Short"),
                leg("C", 760, "2026-06-19", "Short"),
            ],
            "short_strangle",
        ),
    ],
)
def test_classifies_common_option_strategies(positions, expected):
    result = classify_strategy(positions)

    assert result["label"] == expected
    assert result["confidence"] == "high"


def test_unknown_when_required_leg_data_is_missing():
    result = classify_strategy([
        {
            "symbol": "SPY_UNKNOWN",
            "quantity_direction": "Short",
        }
    ])

    assert result["label"] == "unknown"
    assert result["confidence"] == "low"
