-- Run in Supabase SQL Editor
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS bio           TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_letter TEXT DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS avatar_emoji  TEXT DEFAULT '😎',
  ADD COLUMN IF NOT EXISTS avatar_color  TEXT DEFAULT 'linear-gradient(135deg,#7c3aed,#3b82f6)',
  ADD COLUMN IF NOT EXISTS avatar_config TEXT DEFAULT NULL;

UPDATE public.students
SET avatar_letter = UPPER(LEFT(name, 1))
WHERE name IS NOT NULL AND name != '';

SELECT name, bio, avatar_config FROM public.students LIMIT 5;