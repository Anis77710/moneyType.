-- Run this after 001_init.sql
-- Allows expiring rooms that have been waiting >5 min with only the host

CREATE POLICY "Anyone can expire stale waiting rooms"
  ON public.lobby_rooms FOR UPDATE
  USING (status = 'WAITING' AND players_current = 1 AND created_at < now() - interval '5 minutes')
  WITH CHECK (status = 'FINISHED');

