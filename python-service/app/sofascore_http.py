"""Thin HTTP client around SofaScore's public API.

SofaScore fingerprints clients at the TLS layer (ja3/ja4), so neither
`requests`, `httpx`, nor `cloudscraper` get through cleanly. `curl_cffi`
impersonates a real Chrome TLS handshake and reliably bypasses the block.
cloudscraper is kept as a fallback for the rare case curl_cffi gets a 429.
"""

import logging
import threading
from typing import Any
from urllib.parse import urljoin

import cloudscraper
from curl_cffi import requests as curl_requests

from app.settings import get_settings

logger = logging.getLogger(__name__)


BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Origin": "https://www.sofascore.com",
    "Referer": "https://www.sofascore.com/",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
}

CURL_IMPERSONATE = "chrome120"


class SofaScoreError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class SofaScoreClient:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._lock = threading.Lock()
        self._scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
        self._session = curl_requests.Session(impersonate=CURL_IMPERSONATE)

    def _full_url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        base = self._settings.sofascore_base_url + "/"
        return urljoin(base, path.lstrip("/"))

    def _get_via_curl(self, url: str):
        with self._lock:
            return self._session.get(
                url,
                headers=BROWSER_HEADERS,
                timeout=self._settings.sofascore_timeout,
            )

    def _get_via_cloudscraper(self, url: str):
        with self._lock:
            return self._scraper.get(
                url,
                headers=BROWSER_HEADERS,
                timeout=self._settings.sofascore_timeout,
            )

    def get_json(self, path: str) -> Any:
        url = self._full_url(path)

        response = None
        try:
            response = self._get_via_curl(url)
        except Exception as exc:
            logger.info("curl_cffi failed, falling back to cloudscraper url=%s err=%s", url, exc)

        status = response.status_code if response is not None else 0

        if response is None or status in (429, 503):
            try:
                response = self._get_via_cloudscraper(url)
            except Exception as exc:
                logger.warning("SofaScore request failed url=%s err=%s", url, exc)
                raise SofaScoreError(f"network error: {exc}") from exc
            status = response.status_code

        if status == 404:
            return None
        if status >= 400:
            logger.warning("SofaScore non-2xx status=%s url=%s", status, url)
            raise SofaScoreError(f"upstream error {status}", status=status)

        try:
            return response.json()
        except ValueError as exc:
            raise SofaScoreError("invalid json from upstream") from exc


_client: SofaScoreClient | None = None
_client_lock = threading.Lock()


def get_client() -> SofaScoreClient:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = SofaScoreClient()
    return _client
