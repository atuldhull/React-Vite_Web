-- ═══════════════════════════════════════════════════
--  Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'info'
              CHECK (type IN ('info','success','warning','test','project','leaderboard','certificate','announcement','event','achievement','friend')),
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread  ON public.notifications(user_id, is_read);
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- Certificate batches table
CREATE TABLE IF NOT EXISTS public.certificate_batches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT        NOT NULL,
  event_name      TEXT        NOT NULL,
  event_date      TEXT,
  issued_by       TEXT        NOT NULL DEFAULT 'Math Collective, BMSIT',
  signatory_name  TEXT,
  signatory_title TEXT,
  template_type   TEXT        NOT NULL DEFAULT 'elegant',
  template_image  TEXT,       -- URL of uploaded template image
  recipients      JSONB       NOT NULL DEFAULT '[]',
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.certificate_batches DISABLE ROW LEVEL SECURITY;

-- Individual certificates
CREATE TABLE IF NOT EXISTS public.certificates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID        REFERENCES public.certificate_batches(id) ON DELETE CASCADE,
  user_id         UUID,
  recipient_name  TEXT        NOT NULL,
  recipient_email TEXT,
  event_name      TEXT        NOT NULL,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  download_token  TEXT        UNIQUE DEFAULT gen_random_uuid()::text
);
ALTER TABLE public.certificates DISABLE ROW LEVEL SECURITY;

SELECT
  (SELECT count(*) FROM public.notifications)          AS notifications,
  (SELECT count(*) FROM public.certificate_batches)    AS cert_batches,
  (SELECT count(*) FROM public.certificates)           AS certificates;
