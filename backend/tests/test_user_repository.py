import pytest

from app.models.user import InternalUser, InternalUserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService


@pytest.mark.anyio
async def test_user_repository_creates_and_reads_user(db_session) -> None:
    repository = UserRepository(db_session)
    user = InternalUser(
        name="Repo User",
        email="repo@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
        role=InternalUserRole.RECRUITER,
    )

    await repository.create(user)
    await repository.commit()

    by_email = await repository.get_by_email("repo@example.com")
    by_id = await repository.get_by_id(user.id)

    assert by_email is not None
    assert by_email.email == "repo@example.com"
    assert by_id is not None
    assert by_id.id == user.id
