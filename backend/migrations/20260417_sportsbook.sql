CREATE TABLE IF NOT EXISTS sports (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  sport_id INTEGER REFERENCES sports(id),
  country_code CHAR(2),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  season TEXT,
  display_order INTEGER DEFAULT 0,
  UNIQUE(sport_id, slug)
);

CREATE TABLE IF NOT EXISTS sb_events (
  id SERIAL PRIMARY KEY,
  league_id INTEGER REFERENCES leagues(id),
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  start_ts TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished', 'cancelled')),
  provider_event_id TEXT,
  stream_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sb_markets (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES sb_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'settled')),
  min_stake NUMERIC DEFAULT 0.5,
  max_stake NUMERIC DEFAULT 10000
);

CREATE TABLE IF NOT EXISTS sb_selections (
  id SERIAL PRIMARY KEY,
  market_id INTEGER REFERENCES sb_markets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  line NUMERIC,
  current_odds NUMERIC NOT NULL,
  previous_odds NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'suspended', 'won', 'lost', 'void'))
);

CREATE TABLE IF NOT EXISTS sb_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  bet_type TEXT NOT NULL DEFAULT 'SINGLE' CHECK (bet_type IN ('SINGLE', 'ACCUMULATOR', 'SYSTEM')),
  stake NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  potential_payout NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'won', 'lost', 'void', 'cashed_out')),
  cash_out_value NUMERIC,
  placed_ts TIMESTAMPTZ DEFAULT NOW(),
  settled_ts TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sb_bet_legs (
  id SERIAL PRIMARY KEY,
  bet_id UUID REFERENCES sb_bets(id) ON DELETE CASCADE,
  selection_id INTEGER REFERENCES sb_selections(id),
  odds_at_placement NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void'))
);

-- Seed sports
INSERT INTO sports (name, slug, icon_url, display_order) VALUES
  ('Football', 'football', null, 1),
  ('Basketball', 'basketball', null, 2),
  ('Tennis', 'tennis', null, 3),
  ('Esports', 'esports', null, 4)
ON CONFLICT (slug) DO NOTHING;

-- Seed leagues
INSERT INTO leagues (sport_id, country_code, name, slug, season, display_order)
SELECT s.id, 'GB', 'Premier League', 'premier-league', '2025/26', 1
FROM sports s WHERE s.slug = 'football'
ON CONFLICT DO NOTHING;

INSERT INTO leagues (sport_id, country_code, name, slug, season, display_order)
SELECT s.id, 'ES', 'La Liga', 'la-liga', '2025/26', 2
FROM sports s WHERE s.slug = 'football'
ON CONFLICT DO NOTHING;

INSERT INTO leagues (sport_id, country_code, name, slug, season, display_order)
SELECT s.id, 'NS', 'NeoStrike Demo League', 'neostrike-demo', '2026', 99
FROM sports s WHERE s.slug = 'football'
ON CONFLICT DO NOTHING;
