import pytest

from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthenticationError, AuthService, DuplicateEmailError
from app.services.role_service import RoleService
from app.services.user_admin_service import InvalidRoleAssignmentError, UserAdminService


@pytest.mark.anyio
async def test_auth_service_registers_recruiter_with_assignment(db_session) -> None:
    service = AuthService(UserRepository(db_session))

    user = await service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )

    assert user.email == "recruiter@example.com"
    assert AuthService.verify_password("StrongPass123", user.password_hash)
    role_codes = await UserRepository(db_session).list_role_codes(user.id)
    assert role_codes == ["recruiter"]


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
async def test_user_admin_service_creates_internal_accounts_with_roles(db_session) -> None:
    repository = UserRepository(db_session)
    auth_service = AuthService(repository)
    recruiter = await auth_service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )
    admin_service = UserAdminService(repository, RoleService())

    manager = await admin_service.create_internal_user(
        actor=recruiter,
        name="Manager One",
        email="manager@example.com",
        roles=["hiring_manager", "expert"],
        temporary_password="TempPass123",
    )

    assert manager.created_by_user_id == recruiter.id
    role_codes = await repository.list_role_codes(manager.id)
    assert sorted(role_codes) == ["expert", "hiring_manager"]


@pytest.mark.anyio
async def test_user_admin_service_rejects_unknown_role(db_session) -> None:
    repository = UserRepository(db_session)
    auth_service = AuthService(repository)
    recruiter = await auth_service.register_recruiter(
        name="Recruiter One",
        email="recruiter@example.com",
        password="StrongPass123",
    )
    admin_service = UserAdminService(repository, RoleService())

    with pytest.raises(InvalidRoleAssignmentError):
        await admin_service.create_internal_user(
            actor=recruiter,
            name="Mystery One",
            email="mystery@example.com",
            roles=["not_a_role"],
            temporary_password="TempPass123",
        )
