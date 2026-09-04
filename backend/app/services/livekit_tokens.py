"""LiveKit access token issuance — specs/004-candidate-interview-flow/contracts/livekit-token.md (T011).

Backend — единственный, кто подписывает токен (`settings.livekit_api_secret`); frontend
никогда не видит секрет (см. контракт).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TypedDict

from livekit.api import AccessToken, VideoGrants

from app.config import settings

_TOKEN_TTL = timedelta(hours=2)  # с запасом на длительность интервью (2.1.2 — до ~1ч в верхней границе)


class LiveKitTokenResponse(TypedDict):
    token: str
    room_name: str
    ws_url: str
    expires_at: str


def issue_candidate_token(interview_id: str) -> LiveKitTokenResponse:
    """`room_name` = `Interview.id`, не `access_token` — не палим токен доступа в
    LiveKit-метаданных комнаты (см. контракт)."""
    expires_at = datetime.now(timezone.utc) + _TOKEN_TTL
    grants = VideoGrants(room_join=True, room=interview_id, can_publish=True, can_subscribe=True)
    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(f"candidate-{interview_id}")
        .with_grants(grants)
        .with_ttl(_TOKEN_TTL)
        .to_jwt()
    )
    return {
        "token": token,
        "room_name": interview_id,
        "ws_url": settings.livekit_ws_url,
        "expires_at": expires_at.isoformat(),
    }
