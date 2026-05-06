#!/usr/bin/env python3
"""Google Workspace OAuth Bootstrap.

Performs OAuth 2.0 Installed App flow for a Google Workspace account and
writes credentials to taylorwilsdon/google_workspace_mcp's expected path:

  ~/.google_workspace_mcp/credentials/<email>.json

Usage:
  python google-workspace-oauth.py <email> <port>

Requires:
  - taylorwilsdon/google_workspace_mcp cloned at ~/mcp-servers/google_workspace_mcp
  - OAuth Desktop client JSON at ~/<your-secrets>/google-oauth-desktop.json
  - email added as Test User in the GCP project (if OAuth client is in
    publishing status "Testing")

Why this script:
  - `flow.run_local_server()` regenerates the auth URL state internally on each
    call, so printing a URL beforehand causes MismatchingStateError on callback.
    This script pre-generates a fixed state and passes it via kwargs to keep
    URL and listener in sync.
  - Captures the actual URL via NullBrowser monkey-patch on `webbrowser.get`
    (NOT `webbrowser.open` — `run_local_server` calls
    `webbrowser.get(browser).open(auth_url)`). Captured URL is saved to
    `/tmp/oauth-url-<email>.txt` so it can be sent to a remote channel
    (Telegram, Slack) and clicked from the same machine.

Recovery patterns:
  - "Personal MCP has not completed Google verification" / 403 access_denied
    → add the email as Test User in GCP console, then retry.
  - MismatchingStateError → almost always a stale URL from a previous run; this
    script avoids the canonical script bug, but make sure the user clicks the
    URL just printed, not an older one.
  - OSError [Errno 48] Address already in use → TIME_WAIT on macOS keeps the
    port busy after a kill; bump the port number (Desktop OAuth clients accept
    any localhost:* without registration).
  - Refresh token revoked (HTTP 400 invalid_grant on token endpoint) → clients
    in publishing status "Testing" have refresh tokens auto-revoked after ~7
    days. Re-run this script to get a fresh refresh token.
"""

import json
import os
import secrets
import sys
import webbrowser
from urllib.parse import quote

from google_auth_oauthlib.flow import InstalledAppFlow

# Resolve client secret path: env var, then default
CLIENT_SECRET = os.environ.get(
    "GOOGLE_OAUTH_CLIENT_SECRET_PATH",
    os.path.expanduser("~/mission-control/.secrets/google-oauth-desktop.json"),
)

SCOPES = [
    # Identity
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
    # Gmail
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    # Drive
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    # Calendar
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    # Docs / Sheets / Slides
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
    # Tasks / Forms / Contacts
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/forms",
    "https://www.googleapis.com/auth/contacts.readonly",
    # Chat
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.spaces",
]


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: google-workspace-oauth.py <email> <port>", file=sys.stderr)
        sys.exit(1)

    email = sys.argv[1]
    port = int(sys.argv[2])

    creds_dir = os.path.expanduser("~/.google_workspace_mcp/credentials")
    os.makedirs(creds_dir, mode=0o700, exist_ok=True)

    url_out = f"/tmp/oauth-url-{email.replace('@', '_at_')}.txt"

    class NullBrowser:
        def open(self, url: str, new: int = 0, autoraise: bool = True) -> bool:
            with open(url_out, "w") as fh:
                fh.write(url)
            print(f"AUTH_URL_FINAL: {url}", flush=True)
            return True

    def fake_get(name: str | None = None) -> NullBrowser:
        return NullBrowser()

    # Intercept browser launch so we can pipe the URL elsewhere
    webbrowser.get = fake_get  # type: ignore[assignment]

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)

    # Pre-generate state so URL printed and listener match (run_local_server
    # would otherwise regenerate it via an internal authorization_url() call)
    fixed_state = secrets.token_urlsafe(30)
    print(f"FIXED_STATE: {fixed_state}", flush=True)
    print(f"EMAIL: {email}, PORT: {port}", flush=True)

    creds = flow.run_local_server(
        port=port,
        access_type="offline",
        prompt="consent",
        login_hint=email,
        state=fixed_state,
        success_message=f"Authentication successful for {email}. You can close this window.",
        open_browser=True,
    )

    if not creds.refresh_token:
        print("WARN: no refresh_token returned", flush=True)

    safe_email = quote(email, safe="@._-")
    out_path = os.path.join(creds_dir, f"{safe_email}.json")

    creds_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else [],
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }

    fd = os.open(out_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(creds_data, fh, indent=2)

    print(f"WRITTEN: {out_path}", flush=True)


if __name__ == "__main__":
    main()
