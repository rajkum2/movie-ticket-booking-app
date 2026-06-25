-- Layer 3b migration — run once in the Supabase SQL Editor on an existing DB.
-- (Already folded into schema.sql / schema.fresh.sql for fresh installs.)
-- Idempotent: safe to re-run.

-- Per-seat lock table: one row per booked seat. The primary key is what makes
-- double-booking impossible even under concurrent requests.
create table if not exists booking_seats (
    movie_id   bigint not null,
    showtime   text   not null,
    seat       text   not null,
    booking_id bigint not null references bookings(id) on delete cascade,
    primary key (movie_id, showtime, seat)
);

-- Backfill locks for any bookings made before this table existed.
insert into booking_seats (movie_id, showtime, seat, booking_id)
select b.movie_id, b.showtime, jsonb_array_elements_text(b.seats), b.id
from bookings b
where b.seats is not null
on conflict do nothing;

-- Atomic create: inserts the booking + its seat locks in ONE transaction.
-- Raises SEAT_CLASH (mapped to HTTP 409 by the backend) if any requested seat
-- is already taken. This is the single source of truth for the write.
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
-- Per-user agent memory (the `memory` capability). Same pgvector + Jina stack
-- as RAG, scoped per user. match_user_memories takes p_user_id so the backend
-- can never read another user's memories.
-- ---------------------------------------------------------------------------
create extension if not exists vector;

create table if not exists user_memories (
    id         bigint generated always as identity primary key,
    user_id    bigint not null references users(id) on delete cascade,
    content    text   not null,
    embedding  vector(1024) not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_user_memories_user on user_memories (user_id);
create index if not exists idx_user_memories_embedding
    on user_memories using hnsw (embedding vector_cosine_ops);

create or replace function match_user_memories(
    p_user_id       bigint,
    query_embedding vector(1024),
    match_threshold float default 0.3,
    match_count     int default 5
)
returns table (id bigint, content text, similarity float)
language sql stable as $$
    select m.id, m.content, 1 - (m.embedding <=> query_embedding) as similarity
    from user_memories m
    where m.user_id = p_user_id
      and 1 - (m.embedding <=> query_embedding) >= match_threshold
    order by m.embedding <=> query_embedding
    limit match_count;
$$;
