"""HTTP-клиент к backend для evaluation-agent.

Реализует ровно два вызова, нужных воркеру:
- `GET /api/v1/interviews/{id}/evaluation-input`
- `POST /api/v1/interviews/{id}/evaluation`
"""

from __future__ import annotations

from typing import Any, Self
from uuid import UUID

import httpx

from evaluation_agent.config import settings


class BackendClientError(Exception):
    """Любая ошибка при обращении к backend."""


class BackendClient:
    """Async HTTP-клиент с единым service-token заголовком."""

    def __init__(self, base_url: str | None = None, service_token: str | None = None) -> None:
        self.base_url = (base_url or settings.backend_url).rstrip("/")
        self.service_token = service_token or settings.backend_service_token
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"X-Service-Token": self.service_token},
            timeout=httpx.Timeout(30.0, connect=5.0),
        )

    async def get_evaluation_input(self, interview_id: UUID) -> dict[str, Any]:
        response = await self._client.get(f"/api/v1/interviews/{interview_id}/evaluation-input")
        if response.status_code != 200:
            raise BackendClientError(
                f"Failed to fetch evaluation input for {interview_id}: "
                f"{response.status_code} {response.text}"
            )
        return response.json()

    async def post_evaluation(self, interview_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post(
            f"/api/v1/interviews/{interview_id}/evaluation",
            json=payload,
        )
        if response.status_code != 200:
            raise BackendClientError(
                f"Failed to post evaluation for {interview_id}: "
                f"{response.status_code} {response.text}"
            )
        return response.json()

    async def get_evaluation(self, interview_id: UUID) -> dict[str, Any]:
        response = await self._client.get(f"/api/v1/interviews/{interview_id}/evaluation")
        if response.status_code != 200:
            raise BackendClientError(
                f"Failed to fetch evaluation for {interview_id}: "
                f"{response.status_code} {response.text}"
            )
        return response.json()

    async def claim_evaluation_job(self) -> dict[str, Any] | None:
        response = await self._client.post("/api/v1/evaluation-jobs/claim")
        if response.status_code != 200:
            raise BackendClientError(
                f"Failed to claim evaluation job: {response.status_code} {response.text}"
            )
        data = response.json()
        return data if data is not None else None

    async def complete_evaluation_job(self, job_id: UUID) -> None:
        response = await self._client.post(f"/api/v1/evaluation-jobs/{job_id}/complete")
        if response.status_code != 204:
            raise BackendClientError(
                f"Failed to complete job {job_id}: {response.status_code} {response.text}"
            )

    async def fail_evaluation_job(self, job_id: UUID, error: str) -> None:
        response = await self._client.post(
            f"/api/v1/evaluation-jobs/{job_id}/fail",
            json={"error": error},
        )
        if response.status_code != 204:
            raise BackendClientError(
                f"Failed to fail job {job_id}: {response.status_code} {response.text}"
            )

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()
