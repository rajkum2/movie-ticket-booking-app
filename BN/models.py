"""Pydantic request/response schemas."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Movies
# ---------------------------------------------------------------------------
class Movie(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    poster_url: Optional[str] = None
    genre: Optional[str] = None
    language: Optional[str] = None
    duration_minutes: Optional[int] = None
    rating: Optional[float] = None
    price: float
    showtimes: List[str] = []


class MovieCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    poster_url: Optional[str] = None
    genre: Optional[str] = None
    language: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    rating: Optional[float] = Field(default=None, ge=0, le=10)
    price: float = Field(..., ge=0)
    showtimes: List[str] = []


class MovieUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    poster_url: Optional[str] = None
    genre: Optional[str] = None
    language: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    rating: Optional[float] = Field(default=None, ge=0, le=10)
    price: Optional[float] = Field(default=None, ge=0)
    showtimes: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Seats / bookings
# ---------------------------------------------------------------------------
class SeatAvailability(BaseModel):
    movie_id: int
    showtime: str
    booked_seats: List[str]


class BookingCreate(BaseModel):
    movie_id: int
    showtime: str
    customer_name: str = Field(..., min_length=1, max_length=120)
    customer_email: EmailStr
    seats: List[str] = Field(..., min_length=1)


class Booking(BaseModel):
    id: int
    movie_id: int
    movie_title: Optional[str] = None
    user_id: Optional[int] = None
    showtime: str
    customer_name: str
    customer_email: EmailStr
    seats: List[str]
    total_amount: float
    payment_status: str
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Auth / users
# ---------------------------------------------------------------------------
Role = Literal["admin", "user"]


class User(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    role: Role
    created_at: Optional[datetime] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=120)
    role: Role = "user"


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    full_name: Optional[str] = Field(default=None, max_length=120)
    role: Optional[Role] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    user: User
