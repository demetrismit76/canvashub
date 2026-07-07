
-- Trigger-only functions: should never be callable via the API
REVOKE ALL ON FUNCTION public.trim_form_files_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_profile_activated() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- has_role is used by RLS policies for authenticated users; revoke from anon only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
