class TradeServiceError(Exception):
    """Base exception for trade service failures."""


class TastytradeAuthError(TradeServiceError):
    """Raised when Tastytrade authentication fails."""


class TastytradeFetchError(TradeServiceError):
    """Raised when fetching Tastytrade data fails."""
