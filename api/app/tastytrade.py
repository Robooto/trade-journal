import os
import requests
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from typing import Tuple, List, Dict

from app import crud


BASE_URL = os.getenv("TASTYTRADE_URL", "https://api.tastyworks.com")

def login_to_tastytrade() -> Tuple[str, datetime]:
    """
    Authenticate with the Tastytrade API and get an OAuth access token.
    Returns a tuple of (auth_header_value, expiration_datetime).
    """

    client_secret = os.getenv("TASTYTRADE_SECRET")
    refresh_token = os.getenv("TASTYTRADE_REFRESH")
    if not client_secret or not refresh_token:
        raise RuntimeError("Tastytrade OAuth credentials not set in environment variables.")

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_secret": client_secret,
    }

    url = f"{BASE_URL}/oauth/token"
    headers = {
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    data = response.json()

    access_token = data["access_token"]
    token_type = data.get("token_type", "Bearer")
    expires_value = data.get("expires_in", 0)
    try:
        expires_in = int(float(expires_value))
    except (TypeError, ValueError):
        expires_in = 0
    buffer_seconds = 30  # refresh a little early to avoid using an expired token
    exp_dt = datetime.now(timezone.utc) + timedelta(seconds=max(expires_in - buffer_seconds, 0))
    bearer_token = f"{token_type} {access_token}".strip()
    return bearer_token, exp_dt

def get_active_token(db: Session) -> str:
    """
    Retrieve a valid access token, using a cached token if possible or logging in if needed.
    This function checks the token stored in the database and refreshes it if expired.
    """
    token_entry = crud.get_session_token(db)

    if token_entry:
        if token_entry.expiration.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
            return token_entry.token
    # If no token found or it's expired, log in again to get a new token
    new_token, new_expiration = login_to_tastytrade()
    crud.save_session_token(db, new_token, new_expiration)
    return new_token

def fetch_accounts(token: str) -> List[Dict[str, str]]:
    """
    Fetch all accounts for the logged-in user via the Tastytrade API.

    Returns a list of dicts with ``account_number`` and ``nickname`` keys.
    """
    headers = {
        "Authorization": token,
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json",
    }
    url = f"{BASE_URL}/customers/me/accounts"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()

    accounts = []
    for item in data["data"]["items"]:
        acct = item.get("account", {})
        accounts.append({
            "account_number": acct.get("account-number", ""),
            "nickname": acct.get("nickname", ""),
        })
    return accounts

def fetch_positions(token: str, account_number: str) -> List[dict]:
    """
    Retrieve all positions for a given account from the Tastytrade API.
    Returns a list of position dictionaries for the specified account.
    """
    headers = {
        "Authorization": token,
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json"
    }
    url = f"{BASE_URL}/accounts/{account_number}/positions?net-positions=true&include-marks=true"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()

    positions = data["data"]["items"]
    return positions

def fetch_market_data(token: str, equity: List[str], equity_option: List[str], future: List[str], future_option: List[str]) -> List[dict]:
    """
    Fetch market data for the given symbols from the Tastytrade API.
    Returns a list of market data dictionaries.
    """
    headers = {
        "Authorization": token,
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json"
    }
    url = f"{BASE_URL}/market-data/by-type"
    params = {
        "equity": ",".join(equity),
        "equity-option": ",".join(equity_option),
        "future": ",".join(future),
        "future-option": ",".join(future_option)
    }
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    data = response.json()
    return data["data"]["items"]

def fetch_volatility_data(token: str, symbols: List[str]) -> List[dict]:
    """
    Fetch volatility data for the given symbols from the Tastytrade API.
    Returns a list of volatility data dictionaries.
    """
    headers = {
        "Authorization": token,
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json"
    }
    url = f"{BASE_URL}/market-metrics"
    params = {
        "symbols": ",".join(symbols)
    }
    response = requests.get(url, headers=headers, params=params)
    response.raise_for_status()
    data = response.json()
    return data["data"]["items"]

def fetch_account_balance(token: str, account_number: str) -> dict:
    """
    Fetch the account balance for a specific account from the Tastytrade API.
    Returns a dictionary with balance information.
    """
    headers = {
        "Authorization": token,
        "User-Agent": "trade-journal/0.1",
        "Accept": "application/json"
    }
    url = f"{BASE_URL}/accounts/{account_number}/balances"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()

    return data["data"]
