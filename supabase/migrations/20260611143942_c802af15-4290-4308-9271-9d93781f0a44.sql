ALTER TABLE public.form_files
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS form_files_user_archived_idx
  ON public.form_files (user_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS form_files_user_active_recent_idx
  ON public.form_files (user_id, last_opened_at DESC)
  WHERE archived_at IS NULL;