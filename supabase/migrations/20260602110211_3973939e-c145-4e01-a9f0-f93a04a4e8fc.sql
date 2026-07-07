-- =============================================================
-- review_shares
-- =============================================================
CREATE TABLE public.review_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL,
  recipient_user_id uuid,                 -- null = public link only
  recipient_email text,                   -- captured for display when teammate
  file_name text NOT NULL,
  form_schema jsonb NOT NULL,             -- bundled DeviceMagic JSON
  revisions integer[] NOT NULL DEFAULT ARRAY[1],
  public_link_enabled boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_shares TO authenticated;
GRANT ALL ON public.review_shares TO service_role;

ALTER TABLE public.review_shares ENABLE ROW LEVEL SECURITY;

-- Author full control over their own shares
CREATE POLICY "Authors manage own shares (select)" ON public.review_shares
  FOR SELECT TO authenticated USING (auth.uid() = author_user_id);
CREATE POLICY "Authors manage own shares (insert)" ON public.review_shares
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_user_id);
CREATE POLICY "Authors manage own shares (update)" ON public.review_shares
  FOR UPDATE TO authenticated USING (auth.uid() = author_user_id);
CREATE POLICY "Authors manage own shares (delete)" ON public.review_shares
  FOR DELETE TO authenticated USING (auth.uid() = author_user_id);

-- Recipients can read shares addressed directly to them, while active
CREATE POLICY "Recipients view shares addressed to them" ON public.review_shares
  FOR SELECT TO authenticated USING (
    auth.uid() = recipient_user_id
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE INDEX idx_review_shares_author ON public.review_shares(author_user_id);
CREATE INDEX idx_review_shares_recipient ON public.review_shares(recipient_user_id);
CREATE INDEX idx_review_shares_token ON public.review_shares(token);

CREATE TRIGGER update_review_shares_updated_at
BEFORE UPDATE ON public.review_shares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================
-- review_share_responses
-- =============================================================
CREATE TABLE public.review_share_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id uuid NOT NULL REFERENCES public.review_shares(id) ON DELETE CASCADE,
  responder_user_id uuid,                 -- null = anonymous public-link visitor
  responder_session_id text,              -- non-null when responder_user_id is null
  responder_label text NOT NULL,          -- display name shown to author
  revision integer NOT NULL,
  entry_key text NOT NULL,                -- node path or "__project__"
  resolved boolean NOT NULL DEFAULT false,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responder_identity_present CHECK (
    responder_user_id IS NOT NULL OR responder_session_id IS NOT NULL
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_share_responses TO authenticated;
GRANT ALL ON public.review_share_responses TO service_role;

ALTER TABLE public.review_share_responses ENABLE ROW LEVEL SECURITY;

-- One row per (share, responder, revision, entry).
-- Two partial unique indexes cover signed-in vs anonymous responders.
CREATE UNIQUE INDEX uniq_share_response_user
  ON public.review_share_responses(share_id, responder_user_id, revision, entry_key)
  WHERE responder_user_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_share_response_session
  ON public.review_share_responses(share_id, responder_session_id, revision, entry_key)
  WHERE responder_user_id IS NULL;
CREATE INDEX idx_share_response_share ON public.review_share_responses(share_id);

-- Signed-in recipient: manage own responses, but only against a share they can see.
CREATE POLICY "Recipient reads own responses" ON public.review_share_responses
  FOR SELECT TO authenticated USING (
    responder_user_id = auth.uid()
  );

CREATE POLICY "Recipient inserts own responses" ON public.review_share_responses
  FOR INSERT TO authenticated WITH CHECK (
    responder_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.review_shares s
      WHERE s.id = share_id
        AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND (s.recipient_user_id = auth.uid() OR s.public_link_enabled = true)
    )
  );

CREATE POLICY "Recipient updates own responses" ON public.review_share_responses
  FOR UPDATE TO authenticated USING (
    responder_user_id = auth.uid()
  );

CREATE POLICY "Recipient deletes own responses" ON public.review_share_responses
  FOR DELETE TO authenticated USING (
    responder_user_id = auth.uid()
  );

-- Authors can read all responses on their own shares.
CREATE POLICY "Author reads responses on own shares" ON public.review_share_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.review_shares s
      WHERE s.id = share_id AND s.author_user_id = auth.uid()
    )
  );

CREATE TRIGGER update_review_share_responses_updated_at
BEFORE UPDATE ON public.review_share_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================
-- Functions
-- =============================================================

-- Look up a teammate by email without exposing profiles broadly.
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email text)
RETURNS TABLE (user_id uuid, display_name text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name, p.email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(p.email) = lower(trim(p_email))
    AND p.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_email(text) TO authenticated;


-- Resolve a share by token. Returns the share, the author's review_map for
-- each shared revision, and all responses. Works for signed-in recipients and
-- anonymous public-link visitors (via security definer).
CREATE OR REPLACE FUNCTION public.get_review_share_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_review jsonb;
  v_responses jsonb;
  v_author jsonb;
BEGIN
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_share.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'revoked'); END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Access control:
  --   * public_link_enabled = true → anyone with the token may view
  --   * else require auth.uid() to be the recipient or the author
  IF v_share.public_link_enabled = false THEN
    IF auth.uid() IS NULL
       OR (auth.uid() <> v_share.recipient_user_id AND auth.uid() <> v_share.author_user_id) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
  END IF;

  -- Bundle the author's review_map for each shared revision
  --   composite file_name is fileName or fileName#r{n}; r=1 keeps bare fileName
  SELECT jsonb_object_agg(
           rev::text,
           COALESCE((
             SELECT r.review_map FROM public.form_files_review r
             WHERE r.user_id = v_share.author_user_id
               AND r.file_name = CASE WHEN rev <= 1 THEN v_share.file_name
                                      ELSE v_share.file_name || '#r' || rev::text END
             LIMIT 1
           ), '{}'::jsonb)
         )
  INTO v_review
  FROM unnest(v_share.revisions) AS rev;

  -- Responses for this share
  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'responder_session_id'), '[]'::jsonb)
  INTO v_responses
  FROM public.review_share_responses r
  WHERE r.share_id = v_share.id;

  -- Author display
  SELECT jsonb_build_object('display_name', p.display_name, 'email', p.email)
  INTO v_author
  FROM public.profiles p WHERE p.user_id = v_share.author_user_id;

  RETURN jsonb_build_object(
    'share', to_jsonb(v_share),
    'author', COALESCE(v_author, '{}'::jsonb),
    'review_maps', COALESCE(v_review, '{}'::jsonb),
    'responses', v_responses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_share_by_token(uuid) TO anon, authenticated;


-- Insert / update a recipient response by share token.
CREATE OR REPLACE FUNCTION public.upsert_review_share_response(
  p_token uuid,
  p_session_id text,
  p_label text,
  p_revision integer,
  p_entry_key text,
  p_resolved boolean,
  p_comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'share not found'; END IF;
  IF v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'share revoked'; END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN
    RAISE EXCEPTION 'share expired';
  END IF;
  IF NOT (p_revision = ANY(v_share.revisions)) THEN
    RAISE EXCEPTION 'revision not part of this share';
  END IF;

  -- Authorise:
  --   * authenticated recipient/author OK
  --   * anonymous OK only when public_link_enabled
  IF v_user IS NULL THEN
    IF NOT v_share.public_link_enabled THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF p_session_id IS NULL OR length(p_session_id) < 8 THEN
      RAISE EXCEPTION 'session id required';
    END IF;
  ELSIF v_user <> v_share.recipient_user_id
        AND v_user <> v_share.author_user_id
        AND NOT v_share.public_link_enabled THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.review_share_responses
      (share_id, responder_user_id, responder_session_id, responder_label,
       revision, entry_key, resolved, comment)
    VALUES (v_share.id, v_user, NULL, COALESCE(NULLIF(trim(p_label), ''), 'Reviewer'),
            p_revision, p_entry_key, COALESCE(p_resolved, false), COALESCE(p_comment, ''))
    ON CONFLICT (share_id, responder_user_id, revision, entry_key)
      WHERE responder_user_id IS NOT NULL
      DO UPDATE SET resolved = EXCLUDED.resolved,
                    comment = EXCLUDED.comment,
                    responder_label = EXCLUDED.responder_label,
                    updated_at = now()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.review_share_responses
      (share_id, responder_user_id, responder_session_id, responder_label,
       revision, entry_key, resolved, comment)
    VALUES (v_share.id, NULL, p_session_id, COALESCE(NULLIF(trim(p_label), ''), 'Anonymous'),
            p_revision, p_entry_key, COALESCE(p_resolved, false), COALESCE(p_comment, ''))
    ON CONFLICT (share_id, responder_session_id, revision, entry_key)
      WHERE responder_user_id IS NULL
      DO UPDATE SET resolved = EXCLUDED.resolved,
                    comment = EXCLUDED.comment,
                    responder_label = EXCLUDED.responder_label,
                    updated_at = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_review_share_response(uuid, text, text, integer, text, boolean, text) TO anon, authenticated;


-- Convenience: list shares received by current user (active only)
CREATE OR REPLACE FUNCTION public.list_shares_received()
RETURNS TABLE (
  id uuid,
  token uuid,
  file_name text,
  revisions integer[],
  author_display_name text,
  author_email text,
  created_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.token, s.file_name, s.revisions,
         p.display_name, p.email,
         s.created_at, s.updated_at, s.expires_at
  FROM public.review_shares s
  LEFT JOIN public.profiles p ON p.user_id = s.author_user_id
  WHERE auth.uid() IS NOT NULL
    AND s.recipient_user_id = auth.uid()
    AND s.revoked_at IS NULL
    AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY s.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_shares_received() TO authenticated;