-- Revoke anon/public EXECUTE on SECURITY DEFINER functions that should be auth-only.
-- Keep get_review_share_by_token and upsert_review_share_response callable by anon
-- because public share links rely on them.

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_profile_by_email(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_shares_received() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_all_profiles() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_team_recipients(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_share(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_impersonation_snapshot(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_shares(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_invite(text[], uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_invites() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_file_statuses(public.file_status, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_file_status(text, public.file_status, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) FROM anon, public;
