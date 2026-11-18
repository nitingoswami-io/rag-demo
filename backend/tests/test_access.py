"""Demo access gate: pass format, /access/request and the /chat error contract.

No database or real OpenAI key needed: the lifespan (sample seeding) is not run and
the RAG call is replaced.
"""

import json
import time

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from app import access, main
from app.config import settings


def _set(**kw):
    for k, v in kw.items():
        object.__setattr__(settings, k, v)


@pytest.fixture(autouse=True)
def gate_on():
    old = {k: getattr(settings, k) for k in ("demo_access_secret", "resend_api_key", "access_notify_email")}
    _set(demo_access_secret="test-secret", resend_api_key="", access_notify_email="")
    access._seen.clear()
    main._hits.clear()
    yield
    _set(**old)


client = TestClient(main.app)
PACK = sorted(main.samples.pack_ids())[0]


def _chat(headers=None):
    return client.post("/chat", json={"message": "hi", "pack": PACK}, headers=headers or {})


def test_pass_round_trip():
    token = access.issue_pass("a@b.co")
    assert token.startswith("v1.")
    assert access.verify_pass(token) == "a@b.co"


def test_tampered_expired_and_foreign_passes_fail():
    token = access.issue_pass("a@b.co")
    head, payload, sig = token.split(".")
    assert access.verify_pass(f"{head}.{payload}.{sig[:-2]}xx") is None
    _set(demo_access_secret="another-secret")
    assert access.verify_pass(token) is None
    _set(demo_access_secret="test-secret")
    assert access.verify_pass(access.issue_pass("a@b.co", days=-1)) is None

    # A pass for another demo is refused, a site-wide one is honoured.
    def forge(aud):
        body = "v1." + access._b64(json.dumps({"sub": "a@b.co", "aud": aud, "exp": int(time.time()) + 60}).encode())
        return f"{body}.{access._sign(body)}"

    assert access.verify_pass(forge("voice-insight")) is None
    assert access.verify_pass(forge("*")) == "a@b.co"


def test_config_reports_gate():
    assert client.get("/config").json()["access_required"] is True


def test_request_access_logs_link_without_resend(caplog):
    r = client.post("/access/request", json={"email": "Visitor@Example.com"})
    assert r.status_code == 202
    assert "/?pass=v1." in caplog.text and "visitor@example.com" in caplog.text


def test_request_access_rejects_bad_email_and_swallows_honeypot(caplog):
    assert client.post("/access/request", json={"email": "nope"}).json()["code"] == "invalid_email"
    caplog.clear()
    assert client.post("/access/request", json={"email": "bot@x.co", "website": "spam"}).status_code == 202
    assert "pass=" not in caplog.text


def test_repeat_requests_are_accepted_but_not_resent(caplog):
    client.post("/access/request", json={"email": "a@b.co"})
    caplog.clear()
    assert client.post("/access/request", json={"email": "a@b.co"}).status_code == 202
    assert "pass=" not in caplog.text


def test_chat_needs_a_pass():
    r = _chat()
    assert r.status_code == 401 and r.json()["code"] == "access_required"


def test_chat_with_pass_reaches_the_pipeline(monkeypatch):
    monkeypatch.setattr(main, "answer", lambda *a: {"answer": "ok", "sources": [], "stats": {
        "retrieve_ms": 1, "generate_ms": 1, "total_ms": 2, "chunks_searched": 0, "context_chars": 0,
        "history_turns": 0, "prompt_tokens": None, "completion_tokens": None, "model": "m"}})
    r = _chat({"X-Demo-Pass": access.issue_pass("a@b.co")})
    assert r.status_code == 200 and r.json()["answer"] == "ok"


def _openai_error(cls, status, code):
    resp = httpx.Response(status, request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"))
    return cls("provider says no", response=resp, body={"code": code, "message": "provider says no"})


@pytest.mark.parametrize(
    "error,status,code",
    [
        (_openai_error(openai.RateLimitError, 429, "insufficient_quota"), 503, "demo_unavailable"),
        (_openai_error(openai.AuthenticationError, 401, "invalid_api_key"), 503, "demo_unavailable"),
        (_openai_error(openai.RateLimitError, 429, "rate_limit_exceeded"), 429, "rate_limited"),
    ],
)
def test_provider_errors_are_mapped_not_leaked(monkeypatch, error, status, code):
    def boom(*_):
        raise error

    monkeypatch.setattr(main, "answer", boom)
    r = _chat({"X-Demo-Pass": access.issue_pass("a@b.co")})
    assert r.status_code == status and r.json()["code"] == code
    assert "provider says no" not in r.text


def test_gate_off_means_open(monkeypatch):
    _set(demo_access_secret="")
    monkeypatch.setattr(main, "answer", lambda *a: (_ for _ in ()).throw(RuntimeError("reached")))
    assert _chat().status_code == 500  # past the gate, into the (failing) pipeline
    assert client.get("/config").json()["access_required"] is False
