-- ═══════════════════════════════════════════════════════════
-- REFERRAL SYSTEM — Database Schema
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Referral codes (each user gets one unique code)
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- e.g. "MATH-A7X3K"
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_referral_code ON referral_codes(code);

-- Referral tracking (who invited whom)
CREATE TABLE IF NOT EXISTS referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL,           -- who shared the code
  referred_id UUID NOT NULL UNIQUE,    -- who signed up (one referrer per user)
  status TEXT DEFAULT 'pending',       -- pending | verified | rewarded | rejected
  referrer_xp_awarded INTEGER DEFAULT 0,
  referred_xp_awarded INTEGER DEFAULT 0,
  ip_address TEXT,                     -- for anti-abuse
  created_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);

-- Referral daily limits (anti-abuse)
CREATE TABLE IF NOT EXISTS referral_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(ip_address, date)
);
