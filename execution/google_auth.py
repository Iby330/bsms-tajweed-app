#!/usr/bin/env python3
"""
Shared Google OAuth authentication helper.

Uses OAuth 2.0 (Desktop app flow) instead of service account keys —
no admin permissions required.

First run: opens a browser window, you log in once with your Google account.
All subsequent runs: uses saved token silently, no browser needed.

Token is saved to data/google_token.json and auto-refreshed when it expires.

SETUP (one-time, ~2 minutes):
  1. Go to console.cloud.google.com (your business Google account)
  2. Create or select a project
  3. Enable Google Sheets API + Google Drive API
  4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
  5. Application type: Desktop app  (NOT service account)
  6. Download the JSON → save as google_oauth_client.json in this project folder
  7. Run: python3.14 execution/linkedin_setup_sheets.py
     → Browser opens, log in, done. Token saved for all future runs.
"""

import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

TOKEN_PATH    = Path(__file__).parent.parent / "data" / "google_token.json"
DEFAULT_CLIENT_PATH = Path(__file__).parent.parent / "google_oauth_client.json"


def get_credentials():
    """
    Return authenticated OAuth 2.0 Credentials (spreadsheets + drive scopes).

    Shared by both the gspread client and any googleapiclient service
    (Drive, Docs, Sheets). Loads the saved token, refreshes it silently if
    expired, and only falls back to the browser flow if there's no usable token.

    - First call ever: opens browser for one-time login, saves token
    - Subsequent calls: loads token silently, refreshes if expired
    """
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
    except ImportError:
        raise ImportError(
            "Run: pip install google-auth google-auth-oauthlib google-api-python-client gspread"
        )

    client_secret_path = os.getenv("GOOGLE_OAUTH_CLIENT_PATH", str(DEFAULT_CLIENT_PATH))
    creds = None

    # Load saved token if it exists
    if TOKEN_PATH.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        except Exception as e:
            logger.warning(f"Could not load saved token: {e}. Re-authenticating...")
            creds = None

    # Refresh expired token, or run browser flow for first-time auth
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            logger.info("Refreshing expired Google token...")
            creds.refresh(Request())
        else:
            if not Path(client_secret_path).exists():
                raise FileNotFoundError(
                    f"OAuth client file not found at: {client_secret_path}\n\n"
                    "Follow these steps:\n"
                    "  1. Go to console.cloud.google.com\n"
                    "  2. Enable Google Sheets API + Google Drive API + Google Docs API\n"
                    "  3. Credentials → Create → OAuth 2.0 Client ID → Desktop app\n"
                    "  4. Download JSON → save as 'google_oauth_client.json' in the project folder\n"
                    "  5. Re-run this script\n"
                )
            logger.info("Opening browser for one-time Google login...")
            flow = InstalledAppFlow.from_client_secrets_file(client_secret_path, SCOPES)
            creds = flow.run_local_server(port=0, prompt='consent')
            logger.info("Login successful.")

        # Save token for future runs
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())
        logger.info(f"Token saved to {TOKEN_PATH}")

    return creds


def get_gspread_client():
    """
    Return an authenticated gspread client using OAuth 2.0.

    - First call: opens browser for one-time login, saves token
    - Subsequent calls: loads token silently, refreshes if expired
    """
    try:
        import gspread
    except ImportError:
        raise ImportError("Run: pip install gspread google-auth google-auth-oauthlib")

    return gspread.authorize(get_credentials())
