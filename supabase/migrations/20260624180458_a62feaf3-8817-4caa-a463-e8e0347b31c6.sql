
-- ------- share_apply_done -------
CREATE OR REPLACE FUNCTION public.share_apply_done(
  p_token uuid, p_identifier text, p_value boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_uid uuid := auth.uid();
  v_map jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'share not found'; END IF;
  IF v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'share revoked'; END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN RAISE EXCEPTION 'share expired'; END IF;
  IF v_share.permission <> 'editor' THEN RAISE EXCEPTION 'viewer share'; END IF;
  IF NOT (v_uid = v_share.recipient_user_id OR v_uid = v_share.author_user_id OR v_share.public_link_enabled) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(done_map, '{}'::jsonb) INTO v_map
    FROM public.form_files_done
   WHERE user_id = v_share.author_user_id AND file_name = v_share.file_name;
  IF v_map IS NULL THEN v_map := '{}'::jsonb; END IF;

  IF p_value THEN
    v_map := v_map || jsonb_build_object(p_identifier, true);
  ELSE
    v_map := v_map - p_identifier;
  END IF;

  INSERT INTO public.form_files_done (user_id, file_name, done_map, updated_at)
  VALUES (v_share.author_user_id, v_share.file_name, v_map, now())
  ON CONFLICT (user_id, file_name) DO UPDATE
    SET done_map = EXCLUDED.done_map, updated_at = now();

  PERFORM public.log_audit('share.edited','share', v_share.id::text,
    jsonb_build_object('kind','done','identifier',p_identifier,'value',p_value));
END $$;

-- ------- share_apply_review -------
CREATE OR REPLACE FUNCTION public.share_apply_review(
  p_token uuid, p_revision integer, p_entry_key text, p_entry jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_uid uuid := auth.uid();
  v_file text;
  v_map jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'share not found'; END IF;
  IF v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'share revoked'; END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN RAISE EXCEPTION 'share expired'; END IF;
  IF v_share.permission <> 'editor' THEN RAISE EXCEPTION 'viewer share'; END IF;
  IF NOT (v_uid = v_share.recipient_user_id OR v_uid = v_share.author_user_id OR v_share.public_link_enabled) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (p_revision = ANY(v_share.revisions)) THEN
    RAISE EXCEPTION 'revision not part of this share';
  END IF;

  v_file := CASE WHEN p_revision <= 1 THEN v_share.file_name
                 ELSE v_share.file_name || '#r' || p_revision::text END;

  SELECT COALESCE(review_map, '{}'::jsonb) INTO v_map
    FROM public.form_files_review
   WHERE user_id = v_share.author_user_id AND file_name = v_file;
  IF v_map IS NULL THEN v_map := '{}'::jsonb; END IF;

  IF p_entry IS NULL THEN
    v_map := v_map - p_entry_key;
  ELSE
    v_map := v_map || jsonb_build_object(p_entry_key, p_entry);
  END IF;

  INSERT INTO public.form_files_review (user_id, file_name, review_map, updated_at)
  VALUES (v_share.author_user_id, v_file, v_map, now())
  ON CONFLICT (user_id, file_name) DO UPDATE
    SET review_map = EXCLUDED.review_map, updated_at = now();

  PERFORM public.log_audit('share.edited','share', v_share.id::text,
    jsonb_build_object('kind','review','revision',p_revision,'entry_key',p_entry_key));
END $$;

-- ------- share_set_project_note -------
CREATE OR REPLACE FUNCTION public.share_set_project_note(
  p_token uuid, p_revision integer, p_comment text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry jsonb;
BEGIN
  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    PERFORM public.share_apply_review(p_token, p_revision, '__project__', NULL);
  ELSE
    v_entry := jsonb_build_object('needsEdit', false, 'comment', p_comment);
    PERFORM public.share_apply_review(p_token, p_revision, '__project__', v_entry);
  END IF;
END $$;

-- ------- share_add_revision -------
CREATE OR REPLACE FUNCTION public.share_add_revision(p_token uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_uid uuid := auth.uid();
  v_next integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'share not found'; END IF;
  IF v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'share revoked'; END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN RAISE EXCEPTION 'share expired'; END IF;
  IF v_share.permission <> 'editor' THEN RAISE EXCEPTION 'viewer share'; END IF;
  IF NOT (v_uid = v_share.recipient_user_id OR v_uid = v_share.author_user_id OR v_share.public_link_enabled) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_next := COALESCE((SELECT max(x) FROM unnest(v_share.revisions) AS x), 1) + 1;

  UPDATE public.review_shares
     SET revisions = (SELECT array_agg(DISTINCT y ORDER BY y)
                        FROM unnest(array_append(v_share.revisions, v_next)) AS y),
         updated_at = now()
   WHERE id = v_share.id;

  PERFORM public.log_audit('share.revision_added','share', v_share.id::text,
    jsonb_build_object('revision', v_next));
  RETURN v_next;
END $$;

GRANT EXECUTE ON FUNCTION public.share_apply_done(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_apply_review(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_set_project_note(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_add_revision(uuid) TO authenticated;
