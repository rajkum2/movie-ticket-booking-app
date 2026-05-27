-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- It creates the two tables and inserts a few sample movies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists movies (
    id               bigint generated always as identity primary key,
    title            text    not null,
    description      text,
    poster_url       text,
    genre            text,
    language         text,
    duration_minutes int,
    rating           numeric(2,1),
    price            numeric(8,2) not null default 12.00,
    showtimes        jsonb   not null default '[]'::jsonb
);

create table if not exists bookings (
    id              bigint generated always as identity primary key,
    movie_id        bigint not null references movies(id) on delete cascade,
    showtime        text   not null,
    customer_name   text   not null,
    customer_email  text   not null,
    seats           jsonb  not null default '[]'::jsonb,
    total_amount    numeric(10,2) not null default 0,
    payment_status  text   not null default 'PAID',
    created_at      timestamptz not null default now()
);

create index if not exists idx_bookings_movie_showtime
    on bookings (movie_id, showtime);

-- ---------------------------------------------------------------------------
-- Sample movies
-- ---------------------------------------------------------------------------
insert into movies (title, description, poster_url, genre, language, duration_minutes, rating, price, showtimes)
values
  (
    'Interstellar',
    'A team of explorers travel through a wormhole in space in an attempt to ensure humanity''s survival.',
    'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    'Sci-Fi', 'English', 169, 8.6, 14.00,
    '["10:00 AM", "01:30 PM", "06:00 PM", "09:30 PM"]'::jsonb
  ),
  (
    'The Dark Knight',
    'Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent.',
    'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    'Action', 'English', 152, 9.0, 13.50,
    '["11:00 AM", "02:30 PM", "07:00 PM"]'::jsonb
  ),
  (
    'Inception',
    'A thief who steals corporate secrets through dream-sharing technology is given a chance to erase his past.',
    'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
    'Sci-Fi', 'English', 148, 8.8, 13.00,
    '["10:30 AM", "03:00 PM", "08:00 PM"]'::jsonb
  ),
  (
    'Spirited Away',
    'During her family''s move to the suburbs, a girl wanders into a world ruled by gods and spirits.',
    'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
    'Animation', 'Japanese', 125, 8.5, 11.50,
    '["12:00 PM", "04:00 PM", "07:30 PM"]'::jsonb
  );
