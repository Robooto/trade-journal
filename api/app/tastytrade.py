import os
import requests
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from typing import Tuple, List, Dict

from app import crud


BASE_URL = os.getenv("TASTYTRADE_URL", "https://api.cert.tastyworks.com")

def login_to_tastytrade() -> Tuple[str, datetime]:
    """
    Authenticate with the Tastytrade API and get a session token.
    Returns a tuple of (session_token, expiration_datetime).
    """

    username = os.getenv("TASTYTRADE_USERNAME")
    password = os.getenv("TASTYTRADE_PASSWORD")
    if not username or not password:
        raise RuntimeError("Tastytrade credentials not set in environment variables.")

    payload = {
        "login": username,
        "password": password,
        "remember-me": True
    }

    url = f"{BASE_URL}/sessions"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "trade-journal/0.1"
    }
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    data = response.json()

    token = data["data"]["session-token"]
    expiration_str = data["data"]["session-expiration"]
    # Parse the expiration timestamp (e.g. "2024-09-12T20:25:32.440Z") to a timezone-aware datetime
    exp_dt = datetime.strptime(expiration_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    return token, exp_dt

def get_active_token(db: Session) -> str:
    """
    Retrieve a valid session token, using a cached token if possible or logging in if needed.
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
