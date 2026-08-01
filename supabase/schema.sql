-- Run this in the Supabase SQL editor.
-- Adds the test_results table (full test history + record announcements)
-- and DELETE policies so the lobby can auto-clean abandoned rooms and hosts can delete their own rooms.

-- ============ test_results ============

create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  wpm integer not null default 0,
  accuracy integer not null default 0,
  raw_wpm integer not null default 0,
  consistency integer not null default 0,
  chars integer not null default 0,
  correct integer not null default 0,
  incorrect integer not null default 0,
  extra integer not null default 0,
  missed integer not null default 0,
  wealth numeric,
  mode text not null,
  duration integer,
  words_count integer,
  is_record boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.test_results enable row level security;

create policy "test_results are readable by everyone"
  on public.test_results for select using (true);

create policy "users can insert their own test_results"
  on public.test_results for insert with check (auth.uid() = user_id);

create policy "users can update their own test_results"
  on public.test_results for update using (auth.uid() = user_id);

create policy "users can delete their own test_results"
  on public.test_results for delete using (auth.uid() = user_id);

-- ============ lobby: room deletion ============

-- Let hosts delete their own rooms (creator delete button).
create policy "hosts can delete their own rooms"
  on public.lobby_rooms for delete using (auth.uid() = host_id);

-- Let the 5-minute abandoned-room cleanup (runs client-side) remove rooms
-- where nobody is competing (1 player = just the host waiting).
create policy "abandoned rooms can be deleted by cleanup"
  on public.lobby_rooms for delete using (players_current <= 1);

-- Participants of a deleted room must be removable too. If your
-- lobby_participants.room_id foreign key already has ON DELETE CASCADE,
-- this policy is only needed for the client-side cleanup path.
create policy "participants can be deleted with their room"
  on public.lobby_participants for delete using (true);

-- Optional (recommended): add cascade so deleting a room removes its participants automatically.
-- alter table public.lobby_participants
--   drop constraint if exists lobby_participants_room_id_fkey,
--   add constraint lobby_participants_room_id_fkey
--     foreign key (room_id) references public.lobby_rooms(id) on delete cascade;
