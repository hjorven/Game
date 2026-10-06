-- Supabase-Schema für die Highscore-Board
-- In Supabase: SQL Editor → New query → diesen Code einfügen → Run.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  room        text        not null default 'main',
  player_id   text        not null,
  player_name text        not null,
  mode        text        not null,
  kills       int         not null default 0,
  deaths      int         not null default 0,
  won         boolean     not null default false,
  played_at   timestamptz not null default now()
);

create index if not exists scores_room_kills_idx
  on public.scores (room, kills desc);

-- RLS: für alle lesbar, für alle einfügbar (anonymer Key reicht),
-- Ändern/Löschen ist für niemanden erlaubt.
alter table public.scores enable row level security;

create policy "scores_read"   on public.scores for select using (true);
create policy "scores_insert" on public.scores for insert with check (true);
