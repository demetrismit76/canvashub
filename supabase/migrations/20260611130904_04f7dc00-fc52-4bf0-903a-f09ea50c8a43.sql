ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS ui_font text NOT NULL DEFAULT 'system';