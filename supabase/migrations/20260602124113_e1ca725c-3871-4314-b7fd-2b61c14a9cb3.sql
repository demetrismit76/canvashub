
-- Revoke EXECUTE from anon/public on SECURITY DEFINER functions that should not be publicly callable.
-- Keep anonymous access only for the two functions powering public review links:
--   get_review_share_by_token, upsert_review_share_response

DO $$
DECLARE
  r record;
  keep text[] := ARRAY['get_review_share_by_token', 'upsert_review_share_response'];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    IF NOT (r.proname = ANY(keep)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;
