-- ═══════════════════════════════════════════════════════════
-- MESSAGING SYSTEM — Database Schema
-- Run these in Supabase SQL Editor to create the tables
-- ═══════════════════════════════════════════════════════════

-- Friendships / Follow system
CREATE TABLE IF NOT EXISTS friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,        -- who sent the request
  recipient_id UUID NOT NULL,        -- who received
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | blocked
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, recipient_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_recipient ON friendships(recipient_id);

-- Conversations (1-to-1 for now, extensible to groups)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_a UUID NOT NULL,       -- lower user_id always goes here (for dedup)
  participant_b UUID NOT NULL,       -- higher user_id
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(participant_a, participant_b)
);

CREATE INDEX idx_conversations_a ON conversations(participant_a);
CREATE INDEX idx_conversations_b ON conversations(participant_b);

-- Messages (E2EE: content is encrypted, server stores cipher text)
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  -- E2EE fields: server stores encrypted blob, NOT plaintext
  encrypted_content TEXT NOT NULL,     -- AES-GCM encrypted message (base64)
  iv TEXT NOT NULL,                    -- initialization vector (base64)
  message_type TEXT DEFAULT 'text',    -- text | emoji | image
  -- Metadata (NOT encrypted — needed for queries)
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Public keys for E2EE (ECDH key exchange)
-- Each user registers a public key; the paired private key stays in browser only
CREATE TABLE IF NOT EXISTS user_public_keys (
  user_id UUID PRIMARY KEY,
  public_key TEXT NOT NULL,           -- ECDH public key (JWK JSON, base64)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User chat settings
CREATE TABLE IF NOT EXISTS chat_settings (
  user_id UUID PRIMARY KEY,
  allow_messages_from TEXT DEFAULT 'friends',  -- 'everyone' | 'friends' | 'nobody'
  show_online_status BOOLEAN DEFAULT true,
  show_read_receipts BOOLEAN DEFAULT true,
  show_last_seen BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Block list (separate from friendship blocks for clarity)
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(blocker_id, blocked_id)
);

-- Message reports
CREATE TABLE IF NOT EXISTS message_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES messages(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | reviewed | dismissed
  created_at TIMESTAMPTZ DEFAULT now()
);
