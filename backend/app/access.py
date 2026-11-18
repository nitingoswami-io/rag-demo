"""Demo access passes: request a link by email, then send it with each /chat call.

The protocol is shared by every demo on nitingoswami.io (docs/DEMO_ACCESS.md):

    pass = "v1." + base64url(json {sub, aud, iat, exp}) + "." + base64url(HMAC-SHA256)

Stateless on purpose: the signature is the whole check, so there is no session
table. Rotating DEMO_ACCESS_SECRET revokes every pass at once.
"""

import base64
import hashlib
import hmac
import html
import json
import logging
import re
import time
from collections import defaultdict, deque

import httpx

from .config import settings

log = logging.getLogger("access")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def gate_active() -> bool:
    return bool(settings.demo_access_secret)


# --- The pass ---
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(body: str) -> str:
    return _b64(hmac.new(settings.demo_access_secret.encode(), body.encode(), hashlib.sha256).digest())


def issue_pass(email: str, days: int | None = None) -> str:
    now = int(time.time())
    payload = {
        "sub": email,
        "aud": settings.demo_id,
        "iat": now,
        "exp": now + 86400 * (days or settings.demo_pass_days),
    }
    body = "v1." + _b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def verify_pass(token: str | None) -> str | None:
    """The email a valid pass belongs to, or None."""
    if not token or not gate_active():
        return None
    parts = token.strip().split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return None
    body = f"{parts[0]}.{parts[1]}"
    if not hmac.compare_digest(_sign(body), parts[2]):
        return None
    try:
        data = json.loads(_unb64(parts[1]))
    except ValueError:
        return None
    if data.get("aud") not in (settings.demo_id, "*"):
        return None
    if not isinstance(data.get("exp"), int) or data["exp"] < time.time():
        return None
    sub = data.get("sub")
    return sub if isinstance(sub, str) else None


def normalise_email(raw: str) -> str | None:
    email = raw.strip().lower()
    return email if len(email) <= 254 and EMAIL_RE.match(email) else None


# --- Limits (in memory: one process is enough for this demo) ---
_seen: dict[str, deque] = defaultdict(deque)


def _allow(key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    q = _seen[key]
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def allow_chat(email: str) -> bool:
    return _allow(f"chat:{email}", settings.pass_chats_per_day, 86400)


# --- Email (Resend REST API; no SDK) ---
def _send(to: str, subject: str, text: str, link: str | None = None) -> None:
    if not settings.resend_api_key:
        log.warning("RESEND_API_KEY unset; not emailing %s. Subject: %s\n%s", to, subject, text)
        return
    body = html.escape(text).replace("\n", "<br>")
    if link:
        safe = html.escape(link, quote=True)
        body = body.replace(html.escape(link), f'<a href="{safe}">Open the live demo</a>')
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.access_email_from,
                "to": [to],
                "subject": subject,
                "text": text,
                "html": f'<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5">{body}</div>',
            },
            timeout=10,
        )
        r.raise_for_status()
    except httpx.HTTPError as e:
        log.error("Could not email %s: %s", to, e)
        raise


def _public_url() -> str:
    if settings.demo_public_url:
        return settings.demo_public_url
    return settings.allowed_origins[0] if settings.allowed_origins else "http://localhost:3000"


def request_access(raw_email: str, reason: str, ip: str) -> None:
    """Email a pass link. Returns quietly when limited, so callers learn nothing."""
    email = normalise_email(raw_email)
    if email is None:
        raise ValueError("Enter a valid email address.")
    if not _allow(f"req-ip:{ip}", 5, 3600) or not _allow(f"req-email:{email}", 1, 600):
        log.info("Access request for %s from %s rate-limited", email, ip)
        return

    link = f"{_public_url()}/?pass={issue_pass(email)}"
    days = settings.demo_pass_days
    _send(
        email,
        "Your link to the live RAG Demo",
        f"Hi,\n\nHere is your link to the live RAG Demo. It unlocks the demo for {days} days:\n\n"
        f"{link}\n\n"
        "The demo runs on paid OpenAI credit, so there's a daily cap on questions.\n"
        f"To run it with your own key, clone the repo: {settings.repo_url}\n\n"
        "Nitin Goswami\nhttps://www.nitingoswami.io",
        link=link,
    )
    log.info("Access link sent to %s (reason=%s)", email, reason)

    if settings.access_notify_email:
        flag = "OUT OF CREDIT: " if reason == "demo_unavailable" else ""
        try:
            _send(
                settings.access_notify_email,
                f"[{settings.demo_id}] {flag}access requested by {email}",
                f"{email} requested access to {settings.demo_id} (reason: {reason}, ip: {ip}).",
            )
        except httpx.HTTPError:
            pass  # The visitor's email went out; a missed owner copy is not their problem.


_last_alert: float | None = None


def alert_unavailable(error: Exception) -> None:
    """Tell the owner the provider stopped working. At most once an hour."""
    global _last_alert
    log.error("Provider unavailable: %s", error)
    if not settings.access_notify_email or (
        _last_alert is not None and time.monotonic() - _last_alert < 3600
    ):
        return
    _last_alert = time.monotonic()
    try:
        _send(
            settings.access_notify_email,
            f"[{settings.demo_id}] OpenAI is refusing requests",
            f"The live demo could not answer because the provider refused the call:\n\n{error}\n\n"
            "Top up credit at https://platform.openai.com/settings/organization/billing/ "
            "or check the API key. Visitors see the access dialog meanwhile.",
        )
    except httpx.HTTPError:
        pass
