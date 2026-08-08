"""Shared HTTP client: declared User-Agent, timeouts, retries with jitter."""

import os

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

# SEC fair-access policy requires a declared UA with contact info and ≤10 req/s
# (we stay ≤5). Set SEC_USER_AGENT="AppName you@example.com" in the env.
def user_agent() -> str:
    return os.environ.get("SEC_USER_AGENT", "PopOrSlop dev@poporslop.local")


def client() -> httpx.Client:
    return httpx.Client(
        headers={"user-agent": user_agent()},
        timeout=httpx.Timeout(30.0),
        follow_redirects=True,
    )


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=1, max=20), reraise=True)
def get(c: httpx.Client, url: str) -> httpx.Response:
    res = c.get(url)
    # Retry on transient server-side trouble; 4xx is a real error.
    if res.status_code >= 500 or res.status_code == 429:
        res.raise_for_status()
    return res
