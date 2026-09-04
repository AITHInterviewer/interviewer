import pytest

from app.models.user import InternalUserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthenticationError, AuthService, DuplicateEmailError
from app.services.user_admin_service import InvalidRoleAssignmentError, UserAdminService


@pytest.mark.anyio
async def test_auth_service_registers_recruiter(db_session) -> None:
    service = AuthService(UserRepository(db_session))

    user = await service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )

    assert user.role is InternalUserRole.RECRUITER
    assert user.email == "recruiter@example.com"
    assert AuthService.verify_password("StrongPass123", user.password_hash)


@pytest.mark.anyio
async def test_auth_service_rejects_duplicate_email(db_session) -> None:
    service = AuthService(UserRepository(db_session))
    await service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )

    with pytest.raises(DuplicateEmailError):
        await service.register_recruiter(
            name="Recruiter Two",
            email="recruiter@example.com",
            password="StrongPass123",
        )


@pytest.mark.anyio
async def test_auth_service_authenticates_known_user(db_session) -> None:
    repository = UserRepository(db_session)
    service = AuthService(repository)
    created = await service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )

    user = await service.authenticate(email="recruiter@example.com", password="StrongPass123")

    assert user.id == created.id
    assert user.last_login_at is not None


@pytest.mark.anyio
async def test_auth_service_rejects_wrong_password(db_session) -> None:
    service = AuthService(UserRepository(db_session))
    await service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )

    with pytest.raises(AuthenticationError):
        await service.authenticate(email="recruiter@example.com", password="wrongpass123")


@pytest.mark.anyio
async def test_user_admin_service_creates_internal_accounts(db_session) -> None:
    repository = UserRepository(db_session)
    auth_service = AuthService(repository)
    recruiter = await auth_service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )
    admin_service = UserAdminService(repository)

    manager = await admin_service.create_internal_user(
        actor=recruiter,
        name="Manager One",
        email="manager@example.com",
        role=InternalUserRole.HIRING_MANAGER,
        temporary_password="TempPass123",
    )

    assert manager.role is InternalUserRole.HIRING_MANAGER
    assert manager.created_by_user_id == recruiter.id


@pytest.mark.anyio
async def test_user_admin_service_rejects_non_recruiter_actor(db_session) -> None:
    repository = UserRepository(db_session)
    auth_service = AuthService(repository)
    recruiter = await auth_service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )
    admin_service = UserAdminService(repository)
    expert = await admin_service.create_internal_user(
        actor=recruiter,
        name="Expert One",
        email="expert@example.com",
        role=InternalUserRole.EXPERT,
        temporary_password="TempPass123",
    )

    with pytest.raises(InvalidRoleAssignmentError):
        await admin_service.create_internal_user(
            actor=expert,
            name="Manager One",
            email="manager@example.com",
            role=InternalUserRole.HIRING_MANAGER,
            temporary_password="TempPass123",
        )
