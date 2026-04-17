-- =============================================================================
-- Migration: 20260417_phases_1_2_4.sql
-- Phases 1, 2, and 4 tables (Admin UX Parity, Affiliates/CMS/Themes, Fraud)
-- =============================================================================

-- -----------------------------------------------------------------------
-- PHASE 1
-- -----------------------------------------------------------------------

-- F14-01: Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_seed BOOLEAN DEFAULT false,
  brand_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_scopes (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  UNIQUE(role_id, scope)
);

CREATE TABLE IF NOT EXISTS operator_role_assignments (
  id SERIAL PRIMARY KEY,
  operator_id TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(operator_id, role_id)
);

-- F14-03: Player Notes
CREATE TABLE IF NOT EXISTS player_notes (
  id SERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  author_operator_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) <= 4000),
  visibility TEXT NOT NULL DEFAULT 'internal_all' CHECK (visibility IN ('internal_all') OR visibility LIKE 'internal_role_%'),
  pinned BOOLEAN DEFAULT false,
  reference_to INTEGER REFERENCES player_notes(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

-- F14-04: Export jobs
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  format TEXT NOT NULL CHECK (format IN ('csv', 'pdf')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  signed_url TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS export_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}',
  format TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  destination TEXT NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- F14-05: Country rules
CREATE TABLE IF NOT EXISTS country_rules (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency TEXT,
  locale TEXT,
  odds_format TEXT DEFAULT 'decimal',
  max_stake NUMERIC,
  blocked_game_ids JSONB DEFAULT '[]',
  allowed_game_ids JSONB,
  rg_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, country_code)
);

-- -----------------------------------------------------------------------
-- PHASE 2
-- -----------------------------------------------------------------------

-- F15-01: Affiliates
CREATE TABLE IF NOT EXISTS affiliate_tiers (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL CHECK (model IN ('REVSHARE', 'CPA', 'CPL', 'HYBRID')),
  default_revshare_pct NUMERIC DEFAULT 0,
  default_cpa_amount NUMERIC DEFAULT 0,
  min_ftds_per_month INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliates (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  tier_id INTEGER REFERENCES affiliate_tiers(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended')),
  revshare_pct NUMERIC,
  cpa_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id INTEGER REFERENCES affiliates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  utm_source TEXT,
  utm_campaign TEXT,
  utm_medium TEXT,
  country_whitelist JSONB DEFAULT '[]',
  landing_path TEXT DEFAULT '/',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES affiliate_links(id),
  ip TEXT,
  user_agent TEXT,
  country_geo TEXT,
  referrer TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id UUID REFERENCES affiliate_clicks(id),
  player_id TEXT NOT NULL,
  conversion_type TEXT NOT NULL CHECK (conversion_type IN ('SIGNUP', 'FTD')),
  amount NUMERIC DEFAULT 0,
  commission_amount NUMERIC DEFAULT 0,
  commission_status TEXT NOT NULL DEFAULT 'accruing' CHECK (commission_status IN ('accruing', 'payable', 'paid', 'reversed')),
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS affiliate_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id INTEGER REFERENCES affiliates(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  approver_operator_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- F15-02: CMS
CREATE TABLE IF NOT EXISTS content_pages (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  default_locale TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  seo_title TEXT,
  seo_description TEXT,
  og_image TEXT,
  schema_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, slug)
);

CREATE TABLE IF NOT EXISTS content_page_translations (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES content_pages(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL,
  body_mdx TEXT NOT NULL DEFAULT '',
  author_operator_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, locale)
);

CREATE TABLE IF NOT EXISTS content_visibility (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES content_pages(id) ON DELETE CASCADE,
  country_allow_list JSONB DEFAULT '[]',
  country_block_list JSONB DEFAULT '[]',
  segment_allow_list JSONB DEFAULT '[]',
  segment_block_list JSONB DEFAULT '[]',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
);

-- F15-03: Themes
CREATE TABLE IF NOT EXISTS brand_themes (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL UNIQUE,
  preset_name TEXT DEFAULT 'default',
  custom_tokens JSONB DEFAULT '{}',
  logo_url TEXT,
  background_image_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- PHASE 4
-- -----------------------------------------------------------------------

-- F17-01: Fraud signals
CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id INTEGER,
  player_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('velocity', 'ato', 'collusion', 'bonus_abuse', 'kyc_anomaly', 'payment_fraud')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'escalated', 'suppressed', 'resolved')),
  assigned_to TEXT,
  suppression_rule JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------
-- SEED DATA
-- -----------------------------------------------------------------------

INSERT INTO roles (name, description, is_seed) VALUES
  ('Super Admin', 'Full platform access', true),
  ('Brand Admin', 'Brand-scoped access', true),
  ('Finance Manager', 'Financial reporting and exports', true),
  ('CRM Manager', 'Player management and bonuses', true),
  ('Customer Support', 'Player view and notes', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_scopes (role_id, scope)
SELECT r.id, s.scope FROM roles r
CROSS JOIN (VALUES
  ('metrics:read'), ('player:view'), ('audit:read'), ('ui:reports:export'),
  ('ui:player:view_pii'), ('bonus:issue'), ('player:restrict'), ('notes:read:internal_all'),
  ('marketing:payouts:approve'), ('settings:roles:write'), ('settings:countries:write')
) s(scope)
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;
