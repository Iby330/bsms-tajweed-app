#!/usr/bin/env python3
"""
Google Sheets Outreach Tracker.

Creates and updates the Instagram Outreach tracking sheet in Google Drive.
Two tabs:
  - "DM Log"    : one row per DM sent, Status dropdown, Notes
  - "Dashboard" : live metrics — volume, conversion rates, status breakdown

Requires: data/google_token.json (created by the one-time OAuth setup).
"""

import os
import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SPREADSHEET_NAME = "Instagram Outreach"
LOG_TAB_NAME = "DM Log"
DASHBOARD_TAB_NAME = "Dashboard"

# Column definitions for DM Log: (header, width_px)
LOG_COLUMNS = [
    ("Date Sent",        120),
    ("Username",         160),
    ("Profile URL",      220),
    ("Messages",         500),
    ("Status",           160),
    ("Follow-up 1 Date", 140),
    ("Follow-up 2 Date", 140),
    ("Notes",            300),
]

LOG_HEADERS = [col[0] for col in LOG_COLUMNS]

STATUS_OPTIONS = [
    "Messaged",
    "Replied",
    "Booked Call",
    "Sale",
    "No Response",
    "Not Interested",
]

# Column indices (0-based)
STATUS_COL_INDEX    = 4  # E
FOLLOWUP1_COL_INDEX = 5  # F
FOLLOWUP2_COL_INDEX = 6  # G
NOTES_COL_INDEX     = 7  # H

SHEET_ID = "1tvxShyQ9oYNLtfw_guwsHnCIRCi6JeSTNYV3ppfDq8E"


def get_credentials():
    """Load and auto-refresh OAuth credentials from data/google_token.json."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError:
        raise ImportError("Run: python3.14 -m pip install gspread google-auth")

    token_path = os.getenv("GOOGLE_TOKEN_PATH", "data/google_token.json")

    if not os.path.exists(token_path):
        raise FileNotFoundError(
            f"Google token not found at: {token_path}\n"
            "Run the OAuth setup first."
        )

    with open(token_path) as f:
        token_data = json.load(f)

    creds = Credentials(
        token=token_data["token"],
        refresh_token=token_data["refresh_token"],
        token_uri=token_data["token_uri"],
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"],
        scopes=token_data["scopes"]
    )

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_data["token"] = creds.token
        with open(token_path, "w") as f:
            json.dump(token_data, f, indent=2)

    return creds


def get_sheets_client():
    """Return an authenticated gspread client using OAuth."""
    import gspread
    return gspread.authorize(get_credentials())


def get_or_create_spreadsheet(client, folder_name: str = "Outreach") -> "gspread.Spreadsheet":
    """
    Find the spreadsheet in the Outreach folder, or create it if it doesn't exist.
    Uses OAuth credentials (same token as the gspread client).
    """
    from googleapiclient.discovery import build

    creds = get_credentials()
    drive_service = build("drive", "v3", credentials=creds)

    results = drive_service.files().list(
        q=f"name='{SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields="files(id, name, parents)"
    ).execute()

    files = results.get("files", [])
    if files:
        spreadsheet_id = files[0]["id"]
        logger.info(f"Found existing spreadsheet: {SPREADSHEET_NAME} (ID: {spreadsheet_id})")
        return client.open_by_key(spreadsheet_id)

    folder_results = drive_service.files().list(
        q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id, name)"
    ).execute()

    folder_files = folder_results.get("files", [])
    folder_id = folder_files[0]["id"] if folder_files else None

    logger.info(f"Creating new spreadsheet: {SPREADSHEET_NAME}")
    spreadsheet = client.create(SPREADSHEET_NAME)

    if folder_id:
        drive_service.files().update(
            fileId=spreadsheet.id,
            addParents=folder_id,
            removeParents="root",
            fields="id, parents"
        ).execute()
        logger.info(f"Moved spreadsheet to '{folder_name}' folder")

    return spreadsheet


def setup_log_sheet(spreadsheet) -> "gspread.Worksheet":
    """
    Set up (or update) the DM Log tab: headers, column widths, Status dropdown.
    """
    try:
        ws = spreadsheet.worksheet(LOG_TAB_NAME)
    except Exception:
        ws = spreadsheet.add_worksheet(title=LOG_TAB_NAME, rows=1000, cols=len(LOG_COLUMNS))

    existing = ws.row_values(1)
    if existing != LOG_HEADERS:
        ws.update(range_name="A1", values=[LOG_HEADERS])

    requests = []

    # Bold headers + freeze row 1
    requests.append({
        "repeatCell": {
            "range": {
                "sheetId": ws.id,
                "startRowIndex": 0,
                "endRowIndex": 1,
            },
            "cell": {
                "userEnteredFormat": {
                    "textFormat": {"bold": True},
                }
            },
            "fields": "userEnteredFormat.textFormat",
        }
    })
    requests.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": ws.id,
                "gridProperties": {"frozenRowCount": 1}
            },
            "fields": "gridProperties.frozenRowCount"
        }
    })

    # Column widths
    for i, (_, width) in enumerate(LOG_COLUMNS):
        requests.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": ws.id,
                    "dimension": "COLUMNS",
                    "startIndex": i,
                    "endIndex": i + 1,
                },
                "properties": {"pixelSize": width},
                "fields": "pixelSize"
            }
        })

    # Status dropdown (column E, index 4)
    requests.append({
        "setDataValidation": {
            "range": {
                "sheetId": ws.id,
                "startRowIndex": 1,
                "endRowIndex": 1000,
                "startColumnIndex": STATUS_COL_INDEX,
                "endColumnIndex": STATUS_COL_INDEX + 1,
            },
            "rule": {
                "condition": {
                    "type": "ONE_OF_LIST",
                    "values": [{"userEnteredValue": s} for s in STATUS_OPTIONS],
                },
                "showCustomUi": True,
                "strict": True,
            }
        }
    })

    # Wrap text in Messages column (D, index 3) and Notes (F, index 5)
    for col_index in [3, 5]:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ws.id,
                    "startRowIndex": 1,
                    "endRowIndex": 1000,
                    "startColumnIndex": col_index,
                    "endColumnIndex": col_index + 1,
                },
                "cell": {"userEnteredFormat": {"wrapStrategy": "WRAP"}},
                "fields": "userEnteredFormat.wrapStrategy"
            }
        })

    spreadsheet.batch_update({"requests": requests})
    logger.info(f"Sheet '{LOG_TAB_NAME}' set up")
    return ws


def setup_dashboard_sheet(spreadsheet) -> "gspread.Worksheet":
    """
    Set up (or update) the Dashboard tab with live metrics from the DM Log.
    """
    try:
        ws = spreadsheet.worksheet(DASHBOARD_TAB_NAME)
        ws.clear()
    except Exception:
        ws = spreadsheet.add_worksheet(title=DASHBOARD_TAB_NAME, rows=50, cols=6)

    ref = f"'{LOG_TAB_NAME}'"
    E = f"{ref}!E2:E"  # Status column

    # [row, col, value_or_formula]  (1-based)
    cells = [
        # Title
        (1, 1, "INSTAGRAM OUTREACH DASHBOARD"),

        # ── Volume ──────────────────────────────────────────────────
        (3, 1, "VOLUME"),
        (4, 1, "Total Messaged"),
        (4, 2, f"=COUNTA({ref}!A2:A)"),
        (5, 1, "Replied"),
        (5, 2, f'=COUNTIF({E},"Replied")+COUNTIF({E},"Booked Call")+COUNTIF({E},"Sale")'),
        (6, 1, "Booked Call"),
        (6, 2, f'=COUNTIF({E},"Booked Call")+COUNTIF({E},"Sale")'),
        (7, 1, "Sale"),
        (7, 2, f'=COUNTIF({E},"Sale")'),
        (8, 1, "No Response"),
        (8, 2, f'=COUNTIF({E},"No Response")'),
        (9, 1, "Not Interested"),
        (9, 2, f'=COUNTIF({E},"Not Interested")'),

        # ── Conversion Rates ────────────────────────────────────────
        (11, 1, "CONVERSION RATES"),
        (12, 1, "Reply Rate"),
        (12, 2, "=IFERROR(B5/B4,0)"),
        (13, 1, "Call Booking Rate"),
        (13, 2, "=IFERROR(B6/B4,0)"),
        (14, 1, "Close Rate (of calls)"),
        (14, 2, "=IFERROR(B7/B6,0)"),
        (15, 1, "Overall Close Rate"),
        (15, 2, "=IFERROR(B7/B4,0)"),

        # ── Status Breakdown ─────────────────────────────────────────
        (17, 1, "STATUS BREAKDOWN"),
        (18, 1, "Status"),
        (18, 2, "Count"),
        (18, 3, "% of Messaged"),
        (19, 1, "Messaged"),
        (19, 2, f'=COUNTIF({E},"Messaged")'),
        (19, 3, "=IFERROR(B19/B4,0)"),
        (20, 1, "Replied"),
        (20, 2, f'=COUNTIF({E},"Replied")'),
        (20, 3, "=IFERROR(B20/B4,0)"),
        (21, 1, "Booked Call"),
        (21, 2, f'=COUNTIF({E},"Booked Call")'),
        (21, 3, "=IFERROR(B21/B4,0)"),
        (22, 1, "Sale"),
        (22, 2, f'=COUNTIF({E},"Sale")'),
        (22, 3, "=IFERROR(B22/B4,0)"),
        (23, 1, "No Response"),
        (23, 2, f'=COUNTIF({E},"No Response")'),
        (23, 3, "=IFERROR(B23/B4,0)"),
        (24, 1, "Not Interested"),
        (24, 2, f'=COUNTIF({E},"Not Interested")'),
        (24, 3, "=IFERROR(B24/B4,0)"),
    ]

    updates = []
    for row, col, value in cells:
        col_letter = chr(ord('A') + col - 1)
        updates.append({"range": f"{col_letter}{row}", "values": [[value]]})
    ws.batch_update(updates)

    # ── Formatting ───────────────────────────────────────────────────
    bold_rows = [0, 2, 10, 16, 17]   # 0-indexed: title, VOLUME, CONVERSION RATES, STATUS BREAKDOWN, column headers row
    requests = [
        *[{
            "repeatCell": {
                "range": {"sheetId": ws.id, "startRowIndex": r, "endRowIndex": r + 1,
                          "startColumnIndex": 0, "endColumnIndex": 4},
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}},
                "fields": "userEnteredFormat.textFormat"
            }
        } for r in bold_rows],
        # Percentage format for conversion rates (B12:B15, 0-indexed rows 11-14)
        {
            "repeatCell": {
                "range": {"sheetId": ws.id, "startRowIndex": 11, "endRowIndex": 15,
                          "startColumnIndex": 1, "endColumnIndex": 2},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
                "fields": "userEnteredFormat.numberFormat"
            }
        },
        # Percentage format for status breakdown % column (C19:C24, 0-indexed rows 18-23)
        {
            "repeatCell": {
                "range": {"sheetId": ws.id, "startRowIndex": 18, "endRowIndex": 24,
                          "startColumnIndex": 2, "endColumnIndex": 3},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
                "fields": "userEnteredFormat.numberFormat"
            }
        },
        # Column widths
        {"updateDimensionProperties": {
            "range": {"sheetId": ws.id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 1},
            "properties": {"pixelSize": 220}, "fields": "pixelSize"
        }},
        {"updateDimensionProperties": {
            "range": {"sheetId": ws.id, "dimension": "COLUMNS", "startIndex": 1, "endIndex": 2},
            "properties": {"pixelSize": 100}, "fields": "pixelSize"
        }},
        {"updateDimensionProperties": {
            "range": {"sheetId": ws.id, "dimension": "COLUMNS", "startIndex": 2, "endIndex": 3},
            "properties": {"pixelSize": 140}, "fields": "pixelSize"
        }},
    ]
    spreadsheet.batch_update({"requests": requests})
    logger.info(f"Sheet '{DASHBOARD_TAB_NAME}' set up")
    return ws


def log_outreach_result(result: Dict[str, Any]) -> bool:
    """
    Log a single DM result to the Google Sheet.

    Args:
        result: Result dict from send_instagram_dms.py containing:
            - username, date, messages_sent (list of str), profile_url, status

    Returns:
        True if logged successfully
    """
    try:
        client = get_sheets_client()
        spreadsheet = client.open_by_key(SHEET_ID)
        worksheet = spreadsheet.worksheet(LOG_TAB_NAME)

        messages = result.get("messages_sent", [])
        messages_text = "\n\n---\n\n".join(messages) if messages else ""

        row = [
            result.get("date", datetime.now().strftime("%Y-%m-%d")),
            result.get("username", ""),
            result.get("profile_url", f"https://instagram.com/{result.get('username', '')}"),
            messages_text,
            "Messaged",  # Status
            "",          # Follow-up 1 Date
            "",          # Follow-up 2 Date
            "",          # Notes
        ]

        worksheet.append_row(row, value_input_option="USER_ENTERED")
        logger.info(f"Logged @{result.get('username')} to Google Sheets")
        return True

    except Exception as e:
        logger.warning(f"Could not log to Google Sheets: {str(e)}")
        return False


def get_followup_accounts(date_sent: str, followup_number: int = 1) -> list:
    """
    Return list of usernames messaged on date_sent with no follow-up yet.

    Args:
        date_sent: "YYYY-MM-DD" or weekday name e.g. "Monday"
        followup_number: 1 or 2

    Returns:
        List of username strings
    """
    from datetime import date, timedelta

    # Resolve weekday names to a date
    weekdays = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]
    if date_sent.lower() in weekdays:
        today = date.today()
        target_weekday = weekdays.index(date_sent.lower())
        days_ago = (today.weekday() - target_weekday) % 7
        if days_ago == 0:
            days_ago = 7  # "Monday" means last Monday, not today
        resolved = (today - timedelta(days=days_ago)).strftime("%Y-%m-%d")
    else:
        resolved = date_sent

    followup_col_index = FOLLOWUP1_COL_INDEX if followup_number == 1 else FOLLOWUP2_COL_INDEX

    try:
        client = get_sheets_client()
        spreadsheet = client.open_by_key(SHEET_ID)
        ws = spreadsheet.worksheet(LOG_TAB_NAME)
        rows = ws.get_all_values()

        accounts = []
        for row in rows[1:]:  # skip header
            while len(row) <= followup_col_index:
                row.append("")
            if row[0] == resolved and not row[followup_col_index]:
                accounts.append(row[1])  # username

        logger.info(f"Found {len(accounts)} accounts for follow-up {followup_number} (sent {resolved})")
        return accounts

    except Exception as e:
        logger.error(f"Could not fetch follow-up list: {str(e)}")
        return []


def log_followup_sent(username: str, followup_number: int = 1) -> bool:
    """
    Stamp the follow-up date for a username in the sheet.

    Args:
        username: Instagram username
        followup_number: 1 or 2
    """
    followup_col_index = FOLLOWUP1_COL_INDEX if followup_number == 1 else FOLLOWUP2_COL_INDEX
    col_letter = chr(ord('A') + followup_col_index)
    today = datetime.now().strftime("%Y-%m-%d")

    try:
        client = get_sheets_client()
        spreadsheet = client.open_by_key(SHEET_ID)
        ws = spreadsheet.worksheet(LOG_TAB_NAME)
        rows = ws.get_all_values()

        for i, row in enumerate(rows[1:], start=2):
            if row[1] == username:
                ws.update(range_name=f"{col_letter}{i}", values=[[today]])
                logger.info(f"Logged follow-up {followup_number} for @{username}")
                return True

        logger.warning(f"@{username} not found in sheet")
        return False

    except Exception as e:
        logger.warning(f"Could not log follow-up for @{username}: {str(e)}")
        return False


def migrate_existing_rows() -> bool:
    """
    Fix rows logged in the old 3-column format (Message 1 / Message 2 / Message 3).
    Merges the three message columns into the single Messages column and sets Status
    to "Messaged" for any row where the Status cell isn't a known status value.

    Returns:
        True if migration ran successfully
    """
    try:
        client = get_sheets_client()
        spreadsheet = client.open_by_key(SHEET_ID)
        ws = spreadsheet.worksheet(LOG_TAB_NAME)

        all_rows = ws.get_all_values()
        if len(all_rows) <= 1:
            logger.info("No data rows to migrate")
            return True

        updates = []
        for i, row in enumerate(all_rows[1:], start=2):  # skip header, rows are 1-indexed
            # Pad short rows to at least 6 cols
            while len(row) < 6:
                row.append("")

            col_d = row[3]  # Messages (or old Message 1)
            col_e = row[4]  # Status   (or old Message 2)
            col_f = row[5]  # Notes    (or old Message 3)

            # If Status cell holds message text (not a valid status), it's old-format data
            if col_e and col_e not in STATUS_OPTIONS:
                parts = [p for p in [col_d, col_e, col_f] if p]
                merged = "\n\n---\n\n".join(parts)
                updates.append({
                    "range": f"D{i}:F{i}",
                    "values": [[merged, "Messaged", ""]]
                })
                logger.info(f"  Migrating row {i} (@{row[1]}): merged 3 message cols → 1")

        if updates:
            ws.batch_update(updates)
            logger.info(f"Migration complete: fixed {len(updates)} row(s)")
        else:
            logger.info("No rows needed migration")

        return True

    except Exception as e:
        logger.error(f"Migration failed: {str(e)}", exc_info=True)
        return False


def create_tracking_sheet() -> bool:
    """
    One-time setup: create the Instagram Outreach sheet with DM Log + Dashboard tabs.
    Run this directly to initialise the sheet before starting outreach.

    Returns:
        True if created successfully
    """
    try:
        logger.info("Setting up Instagram Outreach tracking sheet...")
        client = get_sheets_client()
        spreadsheet = get_or_create_spreadsheet(client)

        log_ws = setup_log_sheet(spreadsheet)
        migrate_existing_rows()

        try:
            dashboard_ws = spreadsheet.worksheet(DASHBOARD_TAB_NAME)
        except Exception:
            dashboard_ws = spreadsheet.add_worksheet(title=DASHBOARD_TAB_NAME, rows=50, cols=6)

        setup_dashboard_sheet(spreadsheet)

        # Ensure tab order: DM Log first, Dashboard second
        spreadsheet.reorder_worksheets([log_ws, dashboard_ws])

        sheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet.id}"
        logger.info(f"Sheet ready: {sheet_url}")
        print(f"\n✓ Google Sheet created/verified!")
        print(f"  Open it here: {sheet_url}\n")
        return True

    except FileNotFoundError as e:
        logger.error(str(e))
        return False
    except Exception as e:
        logger.error(f"Failed to set up sheet: {str(e)}", exc_info=True)
        return False


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    success = create_tracking_sheet()
    sys.exit(0 if success else 1)
