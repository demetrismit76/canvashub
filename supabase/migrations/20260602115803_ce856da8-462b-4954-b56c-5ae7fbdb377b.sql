REVOKE EXECUTE ON FUNCTION public.bootstrap_team_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_profile_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_shares() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_team_members() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_teams() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_audit_user_roles() FROM anon, authenticated, public;