import secrets

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import func, select

from app.auth.deps import CurrentUser, Session
from app.auth.models import Household, User
from app.auth.security import create_access_token, hash_password, verify_password
from app.auth.service import household_members

router = APIRouter(tags=["account"])

# Avatar colours handed out in join order (first two match the mock).
MEMBER_COLORS = ["#b9532f", "#5d8582", "#8a6bb0", "#c79a3b", "#6b9a5b", "#4a5aa8"]


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


class MemberOut(BaseModel):
    id: int
    name: str
    color: str


class HouseholdOut(BaseModel):
    id: int
    name: str
    invite_code: str
    reward_per: int
    reward_cap: int
    members: list[MemberOut]


class GoalsOut(BaseModel):
    kcal: int
    protein: int
    fiber: int
    sugar: int


class MeOut(BaseModel):
    id: int
    email: str
    name: str
    color: str
    goals: GoalsOut
    household: HouseholdOut


class MePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    goal_kcal: int | None = Field(default=None, ge=800, le=6000)
    goal_protein: int | None = Field(default=None, ge=0, le=400)
    goal_fiber: int | None = Field(default=None, ge=0, le=100)
    goal_sugar: int | None = Field(default=None, ge=0, le=300)


class HouseholdPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    reward_per: int | None = Field(default=None, ge=2, le=3)
    reward_cap: int | None = Field(default=None, ge=1, le=5)


async def me_out(session, user: User) -> MeOut:
    h = user.household
    members = await household_members(session, h.id)
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        color=user.color,
        goals=GoalsOut(
            kcal=user.goal_kcal,
            protein=user.goal_protein,
            fiber=user.goal_fiber,
            sugar=user.goal_sugar,
        ),
        household=HouseholdOut(
            id=h.id,
            name=h.name,
            invite_code=h.invite_code,
            reward_per=h.reward_per,
            reward_cap=h.reward_cap,
            members=[MemberOut(id=m.id, name=m.name, color=m.color) for m in members],
        ),
    )


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
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
        members = await session.scalar(
            select(func.count()).select_from(User).where(User.household_id == household.id)
        )
    else:
        household = Household(name=body.household_name, invite_code=secrets.token_urlsafe(6))
        session.add(household)
        members = 0

    user = User(
        email=email,
        name=body.name,
        password_hash=hash_password(body.password),
        household=household,
        color=MEMBER_COLORS[members % len(MEMBER_COLORS)],
    )
    session.add(user)
    await session.commit()
    return TokenOut(access_token=create_access_token(user.id))


@router.post("/auth/login")
async def login(body: LoginIn, session: Session) -> TokenOut:
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(access_token=create_access_token(user.id))


@router.get("/auth/me")
async def me(user: CurrentUser, session: Session) -> MeOut:
    return await me_out(session, user)


@router.patch("/auth/me")
async def update_me(body: MePatch, user: CurrentUser, session: Session) -> MeOut:
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user, ["household"])
    return await me_out(session, user)


@router.patch("/household")
async def update_household(body: HouseholdPatch, user: CurrentUser, session: Session) -> MeOut:
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(user.household, key, value)
    await session.commit()
    await session.refresh(user, ["household"])
    return await me_out(session, user)
