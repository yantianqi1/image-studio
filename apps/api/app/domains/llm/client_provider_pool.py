from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, NoReturn

import httpx

from apps.api.app.core.errors import AppError

CLIENT_PROVIDER_MODELS_ENDPOINT = "/models"
CLIENT_PROVIDER_POOL_PROBE_TIMEOUT_SECONDS = 10.0
CLIENT_PROVIDER_URL_POOL_EMPTY_CODE = "client_provider_url_pool_empty"
CLIENT_PROVIDER_URL_UNRESOLVED_CODE = "client_provider_url_unresolved"


@dataclass(frozen=True)
class CandidateFailure:
    base_url: str
    message: str


def resolve_client_provider_base_url(*, api_key: str, url_pool: Iterable[str]) -> str:
    candidates = tuple(normalize_candidate_urls(url_pool))
    if not candidates:
        raise AppError(
            code=CLIENT_PROVIDER_URL_POOL_EMPTY_CODE,
            message="client provider url pool is empty",
            status_code=422,
        )
    failures: list[CandidateFailure] = []
    for base_url in candidates:
        failure = probe_client_provider_candidate(base_url=base_url, api_key=api_key)
        if failure is None:
            return base_url
        failures.append(failure)
    raise_unresolved_client_provider_url(failures)


def normalize_candidate_urls(url_pool: Iterable[str]) -> tuple[str, ...]:
    values: list[str] = []
    seen: set[str] = set()
    for item in url_pool:
        value = item.strip().rstrip("/")
        if not value or value in seen:
            continue
        seen.add(value)
        values.append(value)
    return tuple(values)


def probe_client_provider_candidate(*, base_url: str, api_key: str) -> CandidateFailure | None:
    if not base_url.startswith(("http://", "https://")):
        return CandidateFailure(base_url=base_url, message="url must start with http or https")
    try:
        response = httpx.get(
            build_models_url(base_url),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=CLIENT_PROVIDER_POOL_PROBE_TIMEOUT_SECONDS,
        )
    except httpx.TimeoutException:
        return CandidateFailure(base_url=base_url, message="provider /models probe timed out")
    except httpx.RequestError as exc:
        return CandidateFailure(base_url=base_url, message=str(exc))
    if response.status_code < 400:
        return None
    return CandidateFailure(base_url=base_url, message=extract_provider_error(response))


def build_models_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}{CLIENT_PROVIDER_MODELS_ENDPOINT}"


def extract_provider_error(response: httpx.Response | object) -> str:
    try:
        payload = response.json()
    except Exception:
        return getattr(response, "text", "provider rejected api key")
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
    return getattr(response, "text", "provider rejected api key")


def raise_unresolved_client_provider_url(failures: list[CandidateFailure]) -> NoReturn:
    detail = "; ".join(f"{item.base_url}: {item.message}" for item in failures)
    raise AppError(
        code=CLIENT_PROVIDER_URL_UNRESOLVED_CODE,
        message=f"client provider url pool did not accept this api key: {detail}",
        status_code=422,
    )
