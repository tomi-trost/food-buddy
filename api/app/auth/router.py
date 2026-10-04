import secrets

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import select

from app.auth.deps import CurrentUser, Session
from app.auth.models import Household, User
from app.auth.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    household_name: str | None = Field(default=None, min_length=1, max_length=80)
    invite_code: str | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="after")
    def one_household_option(self) -> "RegisterIn":
        if (self.household_name is None) == (self.invite_code is None):
            raise ValueError("Give either household_name (new household) or invite_code (join)")
        return self


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class HouseholdOut(BaseModel):
    id: int
    name: str
    invite_code: str


class MeOut(BaseModel):
    id: int
    email: str
    name: str
    household: HouseholdOut


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, session: Session) -> TokenOut:
    email = body.email.lower()
    if await session.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    if body.invite_code is not None:
        household = await session.scalar(
            select(Household).where(Household.invite_code == body.invite_code)
        )
        if household is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown invite code")
    else:
        household = Household(name=body.household_name, invite_code=secrets.token_urlsafe(6))
        session.add(household)

    user = User(
        email=email, name=body.name, password_hash=hash_password(body.password), household=household
    )
    session.add(user)
    await session.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/login")
async def login(body: LoginIn, session: Session) -> TokenOut:
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/me")
async def me(user: CurrentUser) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        household=HouseholdOut(
            id=user.household.id, name=user.household.name, invite_code=user.household.invite_code
        ),
    )
