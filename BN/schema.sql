-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- It creates the tables, inserts a few sample movies, and the backend seeds
-- two demo users on startup.
--
-- Order matters: `users` is created before anything that references it, so
-- this file is safe to run on a brand-new (empty) project. The `alter table`
-- statements are idempotent and keep older databases — created before some
-- columns existed — up to date; on a fresh project they are no-ops.
--
-- For a clean, fresh-project-only version without the back-compat ALTERs, see
-- `schema.fresh.sql`. For 115+ additional movies (great for search/filter
-- testing), also run `seed-movies.sql` after this file.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Users (created first — bookings and rag_documents reference it)
--
-- OAuth users (e.g. Google sign-in) don't have a local password, so
-- password_hash is nullable.
-- ---------------------------------------------------------------------------
create table if not exists users (
    id              bigint generated always as identity primary key,
    email           text    not null unique,
    password_hash   text,
    full_name       text,
    role            text    not null default 'user' check (role in ('admin', 'user')),
    session_token   text    unique,
    created_at      timestamptz not null default now()
);

-- For databases predating Google sign-in: make password_hash nullable.
alter table users alter column password_hash drop not null;

-- ---------------------------------------------------------------------------
-- Movies
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
    showtimes        jsonb   not null default '[]'::jsonb,
    trailer_url      text,
    backdrop_url     text,
    ai_summary       text
);

-- If the movies table predates these columns, add them.
alter table movies add column if not exists trailer_url text;
alter table movies add column if not exists backdrop_url text;
-- Cache of AI-generated summaries (DeepSeek). Populated lazily on first request.
alter table movies add column if not exists ai_summary text;

-- ---------------------------------------------------------------------------
-- Feature flags (server-side capability toggles)
--
-- Global on/off switches for experimental chat capabilities (e.g. tool use).
-- Admins flip them via PUT /feature-flags/{key}; they apply to ALL users, so
-- turning one off instantly reverts everyone to the baseline behaviour — handy
-- for comparing a capability on vs off. The backend seeds any missing known
-- flags on startup (see BN/featureflags.py KNOWN_FLAGS), so you usually don't
-- insert rows here.
-- ---------------------------------------------------------------------------
create table if not exists feature_flags (
    key         text primary key,
    enabled     boolean     not null default false,
    label       text,
    description text,
    updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists bookings (
    id              bigint generated always as identity primary key,
    movie_id        bigint not null references movies(id) on delete cascade,
    user_id         bigint references users(id) on delete set null,
    showtime        text   not null,
    customer_name   text   not null,
    customer_email  text   not null,
    seats           jsonb  not null default '[]'::jsonb,
    total_amount    numeric(10,2) not null default 0,
    payment_status  text   not null default 'PAID',
    created_at      timestamptz not null default now()
);

-- If bookings already existed without user_id, add the column.
alter table bookings add column if not exists user_id bigint references users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Per-seat lock table + atomic booking transaction (Layer 3b)
--
-- One row per booked seat; the primary key prevents double-booking even under
-- concurrent requests. `create_booking_tx` inserts the booking and its seat
-- locks in one transaction and raises SEAT_CLASH (HTTP 409) on a conflict.
-- ---------------------------------------------------------------------------
create table if not exists booking_seats (
    movie_id   bigint not null,
    showtime   text   not null,
    seat       text   not null,
    booking_id bigint not null references bookings(id) on delete cascade,
    primary key (movie_id, showtime, seat)
);

insert into booking_seats (movie_id, showtime, seat, booking_id)
select b.movie_id, b.showtime, jsonb_array_elements_text(b.seats), b.id
from bookings b
where b.seats is not null
on conflict do nothing;

create or replace function create_booking_tx(
    p_user_id        bigint,
    p_movie_id       bigint,
    p_showtime       text,
    p_seats          text[],
    p_customer_name  text,
    p_customer_email text,
    p_total          numeric
) returns bookings
language plpgsql
as $$
declare
    new_booking bookings;
    s text;
begin
    insert into bookings (movie_id, user_id, showtime, customer_name,
                          customer_email, seats, total_amount, payment_status)
    values (p_movie_id, p_user_id, p_showtime, p_customer_name,
            p_customer_email, to_jsonb(p_seats), p_total, 'PAID')
    returning * into new_booking;

    foreach s in array p_seats loop
        insert into booking_seats (movie_id, showtime, seat, booking_id)
        values (p_movie_id, p_showtime, s, new_booking.id);
    end loop;

    return new_booking;
exception when unique_violation then
    raise exception 'SEAT_CLASH';
end;
$$;

-- ---------------------------------------------------------------------------
-- RAG knowledge base (pgvector + Jina embeddings)
-- ---------------------------------------------------------------------------
create table if not exists rag_documents (
    id           bigint generated always as identity primary key,
    title        text not null,
    source       text,
    uploaded_by  bigint references users(id) on delete set null,
    created_at   timestamptz not null default now()
);

create table if not exists rag_chunks (
    id           bigint generated always as identity primary key,
    document_id  bigint not null references rag_documents(id) on delete cascade,
    chunk_index  int    not null,
    content      text   not null,
    embedding    vector(1024) not null,
    created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_bookings_movie_showtime
    on bookings (movie_id, showtime);
create index if not exists idx_bookings_user on bookings (user_id);
create index if not exists idx_users_token on users (session_token);
create index if not exists idx_rag_chunks_doc on rag_chunks (document_id);
create index if not exists idx_rag_chunks_embedding
    on rag_chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Vector similarity search via supabase-py rpc(). Returns the top matching
-- chunks above the threshold, ordered by cosine similarity (1 - distance).
-- ---------------------------------------------------------------------------
create or replace function match_rag_chunks(
    query_embedding vector(1024),
    match_threshold float default 0.4,
    match_count int default 5
)
returns table (
    id bigint,
    document_id bigint,
    chunk_index int,
    content text,
    similarity float
)
language sql stable as $$
    select c.id,
           c.document_id,
           c.chunk_index,
           c.content,
           1 - (c.embedding <=> query_embedding) as similarity
    from rag_chunks c
    where 1 - (c.embedding <=> query_embedding) >= match_threshold
    order by c.embedding <=> query_embedding
    limit match_count;
$$;

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

-- ---------------------------------------------------------------------------
-- Demo users
--
-- The backend seeds two demo accounts on startup (with proper bcrypt hashes),
-- so you do not need to insert them here:
--
--   admin@cinebook.com    /  admin123    (role: admin)
--   user@cinebook.com     /  user123     (role: user)
--
-- If you'd rather create more users, POST to /auth/register (creates a normal
-- user) or have an admin call POST /users.
-- ---------------------------------------------------------------------------
