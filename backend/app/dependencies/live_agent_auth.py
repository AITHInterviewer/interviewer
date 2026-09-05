"""Service-to-service гейтинг для `live-agent` (план `kind-fluttering-reef.md`, раздел 3):
общий секрет в заголовке, а не JWT/сессия пользователя — у `live-agent` нет user-сессии,
поэтому `require_capability`/`InternalUser`-стек здесь не подходит.
"""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.config import settings

LIVE_AGENT_TOKEN_HEADER = "X-Live-Agent-Token"


async def require_live_agent_token(
    x_live_agent_token: str | None = Header(default=None, alias=LIVE_AGENT_TOKEN_HEADER),
) -> None:
    if x_live_agent_token != settings.live_agent_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing live-agent token."
        )
