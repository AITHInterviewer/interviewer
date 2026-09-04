import pytest

from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService


@pytest.mark.anyio
async def test_user_repository_creates_and_reads_user(db_session) -> None:
    repository = UserRepository(db_session)
    user = InternalUser(
        name="Repo User",
        email="repo@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
    )

    await repository.create(user)
    await repository.commit()

    by_email = await repository.get_by_email("repo@example.com")
    by_id = await repository.get_by_id(user.id)

    assert by_email is not None
    assert by_email.email == "repo@example.com"
    assert by_id is not None
    assert by_id.id == user.id


@pytest.mark.anyio
async def test_user_repository_role_assignment_lifecycle(db_session) -> None:
    repository = UserRepository(db_session)
    user = InternalUser(
        name="Repo User",
        email="repo@example.com",
        password_hash=AuthService.hash_password("StrongPass123"),
    )
    await repository.create(user)

    await repository.add_role_assignment(user.id, "expert", assigned_by_user_id=user.id)
    await repository.commit()
    assert await repository.list_role_codes(user.id) == ["expert"]
    assert await repository.count_assignments_by_role("expert") == 1

    removed = await repository.remove_role_assignment(user.id, "expert")
    await repository.commit()
    assert removed is True
    assert await repository.list_role_codes(user.id) == []
    assert await repository.count_assignments_by_role("expert") == 0

    missing_removed = await repository.remove_role_assignment(user.id, "expert")
    assert missing_removed is False
