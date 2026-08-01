-- Run this in Supabase Dashboard -> SQL Editor

-- Leaderboard table
CREATE TABLE public.leaderboard (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  wpm integer NOT NULL,
  accuracy integer NOT NULL,
  chars integer NOT NULL,
  mode text NOT NULL,
  duration integer,
  words_count integer,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_leaderboard_wpm ON public.leaderboard(wpm DESC);
CREATE INDEX idx_leaderboard_mode ON public.leaderboard(mode);
CREATE INDEX idx_leaderboard_user ON public.leaderboard(user_id);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read leaderboard"
  ON public.leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert their own scores"
  ON public.leaderboard FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scores"
  ON public.leaderboard FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Lobby rooms table
CREATE TABLE public.lobby_rooms (
  id text PRIMARY KEY,
  name text NOT NULL,
  host_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  host_name text NOT NULL,
  players_current integer DEFAULT 1 NOT NULL,
  players_max integer DEFAULT 8 NOT NULL,
  avg_req text DEFAULT 'ANY' NOT NULL,
  status text DEFAULT 'WAITING' NOT NULL CHECK (status IN ('WAITING', 'IN_PROGRESS', 'FINISHED')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_lobby_rooms_status ON public.lobby_rooms(status);

ALTER TABLE public.lobby_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read rooms"
  ON public.lobby_rooms FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create rooms"
  ON public.lobby_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update their room"
  ON public.lobby_rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "Host can delete their room"
  ON public.lobby_rooms FOR DELETE
  TO authenticated
  USING (auth.uid() = host_id);

-- Lobby participants table
CREATE TABLE public.lobby_participants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id text REFERENCES public.lobby_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name text NOT NULL,
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_lobby_participants_room ON public.lobby_participants(room_id);

ALTER TABLE public.lobby_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read participants"
  ON public.lobby_participants FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can join rooms"
  ON public.lobby_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave rooms"
  ON public.lobby_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
