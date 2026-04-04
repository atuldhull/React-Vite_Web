-- ═══════════════════════════════════════════════════════════════
-- Notification type constraint update
-- Run this if your notifications table already exists
-- Adds: 'event', 'achievement', 'friend' notification types
-- Date: April 4, 2026
-- ═══════════════════════════════════════════════════════════════

-- Drop the old CHECK constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate with expanded types
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'info', 'success', 'warning',
    'test', 'project', 'leaderboard',
    'certificate', 'announcement',
    'event', 'achievement', 'friend'
  ));

-- Verify
SELECT DISTINCT type FROM public.notifications ORDER BY type;
