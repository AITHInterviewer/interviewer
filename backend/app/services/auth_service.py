from datetime import UTC, datetime, timedelta
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.models.user import InternalUser
from app.repositories.user_repository import UserRepository

RECRUITER_ROLE_CODE = "recruiter"


class DuplicateEmailError(Exception):
    pass


class AuthenticationError(Exception):
    pass


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class AuthService:
    def __init__(self, user_repository: UserRepository) -> None:
        self.user_repository = user_repository

    async def register_recruiter(self, *, name: str, email: str, password: str) -> InternalUser:
        if await self.user_repository.get_by_email(email):
            raise DuplicateEmailError

        user = InternalUser(
            name=name,
            email=email.lower(),
            password_hash=self.hash_password(password),
            must_rotate_password=False,
        )
        await self.user_repository.create(user)
        await self.user_repository.add_role_assignment(
            user.id,
            RECRUITER_ROLE_CODE,
            assigned_by_user_id=user.id,
        )
        await self.user_repository.commit()
        return user

    async def authenticate(self, *, email: str, password: str) -> InternalUser:
        user = await self.user_repository.get_by_email(email)
        if user is None or not self.verify_password(password, user.password_hash):
            raise AuthenticationError

        user.last_login_at = datetime.now(UTC)
        await self.user_repository.commit()
        return user

    async def get_current_user(self, token: str) -> InternalUser:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        except JWTError as exc:
            raise AuthenticationError from exc

        subject = payload.get("sub")
        if not subject:
            raise AuthenticationError

        user = await self.user_repository.get_by_id(UUID(subject))
        if user is None:
            raise AuthenticationError
        return user

    def create_access_token(self, user: InternalUser) -> str:
        now = datetime.now(UTC)
        payload = {
            "sub": str(user.id),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=settings.jwt_access_token_expire_minutes)).timestamp()),
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        return pwd_context.verify(password, password_hash)
