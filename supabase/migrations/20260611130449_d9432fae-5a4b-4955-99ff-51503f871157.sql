ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS allowed_views text[] NOT NULL DEFAULT ARRAY['grid','preview','structure','gocanvas','graph','flow','magic']::text[],
  ADD COLUMN IF NOT EXISTS default_view text NOT NULL DEFAULT 'magic';