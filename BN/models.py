"""Pydantic request/response schemas."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


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
    showtime: str
    customer_name: str
    customer_email: EmailStr
    seats: List[str]
    total_amount: float
    payment_status: str
    created_at: Optional[datetime] = None
