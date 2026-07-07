ALTER TABLE public.review_shares
  ADD COLUMN IF NOT EXISTS permission text NOT NULL DEFAULT 'viewer'
    CHECK (permission IN ('viewer','editor'));