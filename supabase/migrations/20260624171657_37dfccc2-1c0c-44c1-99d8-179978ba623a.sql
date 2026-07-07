
CREATE OR REPLACE FUNCTION public.get_review_share_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_share public.review_shares%ROWTYPE;
  v_review jsonb;
  v_responses jsonb;
  v_author jsonb;
  v_done jsonb;
BEGIN
  SELECT * INTO v_share FROM public.review_shares WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_share.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('error', 'revoked'); END IF;
  IF v_share.expires_at IS NOT NULL AND v_share.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF v_share.public_link_enabled = false THEN
    IF auth.uid() IS NULL
       OR (auth.uid() <> v_share.recipient_user_id AND auth.uid() <> v_share.author_user_id) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
  END IF;

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

  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'responder_session_id'), '[]'::jsonb)
  INTO v_responses
  FROM public.review_share_responses r
  WHERE r.share_id = v_share.id;

  SELECT jsonb_build_object('display_name', p.display_name, 'email', p.email)
  INTO v_author
  FROM public.profiles p WHERE p.user_id = v_share.author_user_id;

  SELECT COALESCE(d.done_map, '{}'::jsonb)
  INTO v_done
  FROM public.form_files_done d
  WHERE d.user_id = v_share.author_user_id
    AND d.file_name = v_share.file_name
  LIMIT 1;

  RETURN jsonb_build_object(
    'share', to_jsonb(v_share),
    'author', COALESCE(v_author, '{}'::jsonb),
    'review_maps', COALESCE(v_review, '{}'::jsonb),
    'done_map', COALESCE(v_done, '{}'::jsonb),
    'responses', v_responses
  );
END;
$function$;
