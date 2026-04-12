-- ═══════════════════════════════════════════════════════════════
--  MATH COLLECTIVE — MIGRATION v2
--  Run this in Supabase SQL Editor AFTER migration.sql
--  Adds: notifications, certificate_batches, certificates
--        teacher role support, department/subject columns
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Extend students table for teachers ──
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS subject    TEXT,
  ADD COLUMN IF NOT EXISTS weekly_xp  INTEGER NOT NULL DEFAULT 0;

-- Drop old role constraint (student/admin only) and re-add with teacher
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_role_check') THEN
    ALTER TABLE public.students DROP CONSTRAINT students_role_check;
  END IF;
  ALTER TABLE public.students
    ADD CONSTRAINT students_role_check
    CHECK (role IN ('student', 'teacher', 'admin'));
END $$;

-- ── 2. NOTIFICATIONS table ──
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'info',
  link       TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread  ON public.notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- ── 3. CERTIFICATE_BATCHES table ──
CREATE TABLE IF NOT EXISTS public.certificate_batches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  event_name       TEXT        NOT NULL,
  event_date       TEXT,
  issued_by        TEXT,
  signatory_name   TEXT,
  signatory_title  TEXT,
  template_type    TEXT        NOT NULL DEFAULT 'elegant',
  recipients       JSONB,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_batches_created_by ON public.certificate_batches(created_by);

ALTER TABLE public.certificate_batches DISABLE ROW LEVEL SECURITY;

-- ── 4. CERTIFICATES table (one row per recipient) ──
CREATE TABLE IF NOT EXISTS public.certificates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID        NOT NULL REFERENCES public.certificate_batches(id) ON DELETE CASCADE,
  user_id          UUID,                         -- NULL if recipient not a registered user
  recipient_name   TEXT        NOT NULL,
  recipient_email  TEXT,
  event_name       TEXT        NOT NULL,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certs_batch   ON public.certificates(batch_id);
CREATE INDEX IF NOT EXISTS idx_certs_user    ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certs_email   ON public.certificates(recipient_email);

ALTER TABLE public.certificates DISABLE ROW LEVEL SECURITY;

-- ── 5. Verify ──
SELECT
  (SELECT count(*) FROM public.notifications)         AS notifications,
  (SELECT count(*) FROM public.certificate_batches)   AS cert_batches,
  (SELECT count(*) FROM public.certificates)          AS certificates,
  (SELECT count(*) FROM public.students WHERE role = 'teacher') AS teachers;