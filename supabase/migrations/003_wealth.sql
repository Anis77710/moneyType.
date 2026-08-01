ALTER TABLE leaderboard ADD COLUMN IF NOT EXISTS wealth integer;

CREATE INDEX IF NOT EXISTS idx_leaderboard_wealth ON leaderboard(wealth DESC);
