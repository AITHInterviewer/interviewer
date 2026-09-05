from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, engine
from app.routers import (
    auth,
    candidate_interview,
    health,
    interview_ws,
    interviews_admin,
    mock_interview,
    pilot,
    roles,
    vacancies,
)
from app.services.role_service import RoleService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Loading the registry here enforces startup validation (FR-021):
    # a malformed registry fails application startup with a clear error.
    app.state.role_service = RoleService()

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    yield


app = FastAPI(title="AInterviewer Backend API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(candidate_interview.router)
app.include_router(interview_ws.router)
app.include_router(mock_interview.router)
app.include_router(auth.router)
app.include_router(roles.router)
app.include_router(vacancies.router)
app.include_router(interviews_admin.router)
app.include_router(pilot.router)
