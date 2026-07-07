
-- Allowed tables for restore (parent-first order)
CREATE OR REPLACE FUNCTION public._restore_allowed_tables()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'profiles','teams','gocanvas_accounts','org_settings',
    'user_roles','team_members','pending_invites',
    'form_files','form_files_done','form_files_review','file_statuses',
    'review_shares','review_share_responses'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_truncate(p_tables text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := public._restore_allowed_tables();
  v_t text;
  v_list text := '';
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH v_t IN ARRAY p_tables LOOP
    IF NOT (v_t = ANY(v_allowed)) THEN
      RAISE EXCEPTION 'table % is not allowed for restore', v_t;
    END IF;
    v_list := v_list || CASE WHEN v_list = '' THEN '' ELSE ', ' END || format('public.%I', v_t);
  END LOOP;

  IF v_list = '' THEN RETURN; END IF;

  EXECUTE format('TRUNCATE TABLE %s RESTART IDENTITY CASCADE', v_list);

  PERFORM public.log_audit('restore.truncated','system','restore',
    jsonb_build_object('tables', p_tables));
END $$;

CREATE OR REPLACE FUNCTION public.admin_restore_insert(p_table text, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := public._restore_allowed_tables();
  v_count integer := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table % is not allowed for restore', p_table;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  -- Quiet user triggers during bulk load (audit + role bootstraps)
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', p_table);

  BEGIN
    EXECUTE format(
      'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)',
      p_table, p_table
    ) USING p_rows;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_table);
    RAISE;
  END;

  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_table);

  PERFORM public.log_audit('restore.inserted','system', p_table,
    jsonb_build_object('rows', v_count));
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.admin_restore_truncate(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_restore_insert(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_restore_truncate(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_insert(text, jsonb) TO authenticated;
