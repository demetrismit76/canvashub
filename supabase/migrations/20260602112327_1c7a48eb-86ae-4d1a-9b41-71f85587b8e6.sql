
-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.file_status AS ENUM ('open','closed','reopened','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- file_statuses
-- ============================================================
CREATE TABLE IF NOT EXISTS public.file_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  status public.file_status NOT NULL DEFAULT 'open',
  note text NOT NULL DEFAULT '',
  closed_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_statuses TO authenticated;
GRANT ALL ON public.file_statuses TO service_role;

ALTER TABLE public.file_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own file status"
  ON public.file_statuses FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all file statuses"
  ON public.file_statuses FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_file_statuses_updated
  BEFORE UPDATE ON public.file_statuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log (target_type, target_id);

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text, p_target_type text, p_target_id text, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_log (actor_user_id, action, target_type, target_id, meta)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, COALESCE(p_meta,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============================================================
-- org_settings  (single row, id = 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_settings (
  id int PRIMARY KEY DEFAULT 1,
  allow_team_creation_by_non_admins boolean NOT NULL DEFAULT true,
  allow_public_links boolean NOT NULL DEFAULT true,
  default_team_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read org settings"
  ON public.org_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner updates org settings"
  ON public.org_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner inserts org settings"
  ON public.org_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

INSERT INTO public.org_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_org_settings_updated
  BEFORE UPDATE ON public.org_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- pending_invites
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  invited_by uuid,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_invites TO authenticated;
GRANT ALL ON public.pending_invites TO service_role;

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
  ON public.pending_invites FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- Updated handle_new_user  (consume pending_invites)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status public.account_status;
  v_invite public.pending_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM public.pending_invites WHERE lower(email) = lower(new.email) LIMIT 1;

  IF FOUND OR lower(new.email) LIKE '%@gocanvas.com' THEN
    v_status := 'active';
  ELSE
    v_status := 'pending';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, email, status)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    v_status
  );

  IF v_status = 'active' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'user') ON CONFLICT DO NOTHING;
  END IF;

  IF FOUND THEN
    IF v_invite.team_id IS NOT NULL THEN
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (v_invite.team_id, new.id, 'member') ON CONFLICT DO NOTHING;
    END IF;
    DELETE FROM public.pending_invites WHERE id = v_invite.id;
  END IF;

  RETURN new;
END $$;

-- ============================================================
-- Admin RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'users_total',     (SELECT count(*) FROM public.profiles),
    'users_active',    (SELECT count(*) FROM public.profiles WHERE status = 'active'),
    'users_pending',   (SELECT count(*) FROM public.profiles WHERE status = 'pending'),
    'users_suspended', (SELECT count(*) FROM public.profiles WHERE status = 'suspended'),
    'shares_active',   (SELECT count(*) FROM public.review_shares WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())),
    'shares_revoked',  (SELECT count(*) FROM public.review_shares WHERE revoked_at IS NOT NULL),
    'shares_total',    (SELECT count(*) FROM public.review_shares),
    'files_reviewed',  (SELECT count(*) FROM public.form_files_review),
    'files_total',     (SELECT count(*) FROM public.form_files),
    'teams_total',     (SELECT count(*) FROM public.teams),
    'files_open',      (SELECT count(*) FROM public.file_statuses WHERE status = 'open'),
    'files_closed',    (SELECT count(*) FROM public.file_statuses WHERE status = 'closed'),
    'files_reopened',  (SELECT count(*) FROM public.file_statuses WHERE status = 'reopened'),
    'files_archived',  (SELECT count(*) FROM public.file_statuses WHERE status = 'archived'),
    'signups_30d',     COALESCE((
      SELECT jsonb_agg(jsonb_build_object('d', d::date, 'c', c) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at) AS d, count(*) AS c
        FROM public.profiles
        WHERE created_at > now() - interval '30 days'
        GROUP BY 1
      ) s
    ), '[]'::jsonb)
  ) INTO v;

  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_shares(p_search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, token uuid, file_name text, revisions int[],
  author_user_id uuid, author_email text, author_name text,
  recipient_user_id uuid, recipient_email text, recipient_name text,
  public_link_enabled boolean,
  created_at timestamptz, updated_at timestamptz,
  revoked_at timestamptz, expires_at timestamptz,
  response_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id, s.token, s.file_name, s.revisions,
    s.author_user_id, ap.email, ap.display_name,
    s.recipient_user_id, COALESCE(rp.email, s.recipient_email), rp.display_name,
    s.public_link_enabled,
    s.created_at, s.updated_at,
    s.revoked_at, s.expires_at,
    (SELECT count(*) FROM public.review_share_responses rsr WHERE rsr.share_id = s.id)
  FROM public.review_shares s
  LEFT JOIN public.profiles ap ON ap.user_id = s.author_user_id
  LEFT JOIN public.profiles rp ON rp.user_id = s.recipient_user_id
  WHERE public.is_super_admin(auth.uid())
    AND (
      p_search IS NULL OR p_search = ''
      OR s.file_name ILIKE '%'||p_search||'%'
      OR ap.email ILIKE '%'||p_search||'%'
      OR rp.email ILIKE '%'||p_search||'%'
      OR COALESCE(s.recipient_email,'') ILIKE '%'||p_search||'%'
    )
  ORDER BY s.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.review_shares SET revoked_at = now(), updated_at = now()
   WHERE id = p_share_id AND revoked_at IS NULL;
  PERFORM public.log_audit('share.revoked', 'share', p_share_id::text, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_bulk_invite(p_emails text[], p_team_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
  v_added int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOREACH v_email IN ARRAY p_emails LOOP
    v_email := lower(trim(v_email));
    CONTINUE WHEN v_email = '' OR v_email NOT LIKE '%@%';
    -- Already a profile?  Activate immediately and assign to team.
    UPDATE public.profiles SET status = 'active'
     WHERE lower(email) = v_email AND status <> 'active';
    IF FOUND THEN
      IF p_team_id IS NOT NULL THEN
        INSERT INTO public.team_members (team_id, user_id, role)
        SELECT p_team_id, user_id, 'member' FROM public.profiles WHERE lower(email) = v_email
        ON CONFLICT DO NOTHING;
      END IF;
      v_added := v_added + 1;
      CONTINUE;
    END IF;
    -- Otherwise queue the invite
    INSERT INTO public.pending_invites (email, invited_by, team_id)
    VALUES (v_email, auth.uid(), p_team_id)
    ON CONFLICT (email) DO UPDATE SET team_id = EXCLUDED.team_id, invited_by = EXCLUDED.invited_by;
    v_added := v_added + 1;
  END LOOP;
  PERFORM public.log_audit('invite.bulk', 'invite', NULL,
    jsonb_build_object('count', v_added, 'team_id', p_team_id));
  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped);
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_pending_invites()
RETURNS TABLE(id uuid, email text, team_id uuid, team_name text, invited_by uuid, invited_by_email text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.email, i.team_id, t.name, i.invited_by, p.email, i.created_at
  FROM public.pending_invites i
  LEFT JOIN public.teams t ON t.id = i.team_id
  LEFT JOIN public.profiles p ON p.user_id = i.invited_by
  WHERE public.is_super_admin(auth.uid())
  ORDER BY i.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.admin_list_file_statuses(p_status public.file_status DEFAULT NULL, p_search text DEFAULT NULL)
RETURNS TABLE(
  id uuid, user_id uuid, owner_email text, owner_name text,
  file_name text, status public.file_status, note text,
  closed_at timestamptz, reopened_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT fs.id, fs.user_id, p.email, p.display_name,
         fs.file_name, fs.status, fs.note,
         fs.closed_at, fs.reopened_at, fs.created_at, fs.updated_at
  FROM public.file_statuses fs
  LEFT JOIN public.profiles p ON p.user_id = fs.user_id
  WHERE public.is_super_admin(auth.uid())
    AND (p_status IS NULL OR fs.status = p_status)
    AND (p_search IS NULL OR p_search = ''
         OR fs.file_name ILIKE '%'||p_search||'%'
         OR p.email ILIKE '%'||p_search||'%')
  ORDER BY fs.updated_at DESC
$$;

CREATE OR REPLACE FUNCTION public.set_file_status(p_file_name text, p_status public.file_status, p_note text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_prev public.file_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT id, status INTO v_id, v_prev FROM public.file_statuses
   WHERE user_id = v_uid AND file_name = p_file_name;

  IF v_id IS NULL THEN
    INSERT INTO public.file_statuses (user_id, file_name, status, note,
      closed_at, reopened_at)
    VALUES (v_uid, p_file_name, p_status, COALESCE(p_note,''),
      CASE WHEN p_status = 'closed' THEN now() END,
      CASE WHEN p_status = 'reopened' THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.file_statuses SET
      status = p_status,
      note   = COALESCE(p_note, note),
      closed_at  = CASE WHEN p_status = 'closed'   THEN now() ELSE closed_at END,
      reopened_at = CASE WHEN p_status = 'reopened' THEN now() ELSE reopened_at END
     WHERE id = v_id;
  END IF;

  PERFORM public.log_audit('file_status.changed', 'file', p_file_name,
    jsonb_build_object('from', v_prev, 'to', p_status, 'note', p_note));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_impersonation_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.user_id = p_user_id),
    'roles',   COALESCE((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = p_user_id), '[]'::jsonb),
    'files',   COALESCE((
      SELECT jsonb_agg(jsonb_build_object('file_name', file_name, 'updated_at', updated_at, 'last_opened_at', last_opened_at) ORDER BY last_opened_at DESC)
      FROM public.form_files WHERE user_id = p_user_id), '[]'::jsonb),
    'shares_sent', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM public.review_shares s WHERE s.author_user_id = p_user_id), '[]'::jsonb),
    'shares_received', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC)
      FROM public.review_shares s WHERE s.recipient_user_id = p_user_id), '[]'::jsonb),
    'teams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('team_id', tm.team_id, 'role', tm.role, 'name', t.name))
      FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id WHERE tm.user_id = p_user_id), '[]'::jsonb),
    'statuses', COALESCE((
      SELECT jsonb_agg(to_jsonb(fs) ORDER BY fs.updated_at DESC)
      FROM public.file_statuses fs WHERE fs.user_id = p_user_id), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END $$;

-- ============================================================
-- Audit triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_audit_user_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('role.granted','user',NEW.user_id::text, jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('role.revoked','user',OLD.user_id::text, jsonb_build_object('role', OLD.role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_user_roles();

CREATE OR REPLACE FUNCTION public.tg_audit_profile_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_audit('profile.status_changed','user',NEW.user_id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_profile_status ON public.profiles;
CREATE TRIGGER trg_audit_profile_status AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_profile_status();

CREATE OR REPLACE FUNCTION public.tg_audit_teams() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('team.created','team',NEW.id::text, jsonb_build_object('name', NEW.name));
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM public.log_audit('team.renamed','team',NEW.id::text, jsonb_build_object('from', OLD.name, 'to', NEW.name));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('team.deleted','team',OLD.id::text, jsonb_build_object('name', OLD.name));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_audit_teams ON public.teams;
CREATE TRIGGER trg_audit_teams AFTER INSERT OR UPDATE OR DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_teams();

CREATE OR REPLACE FUNCTION public.tg_audit_team_members() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('team.member_added','team',NEW.team_id::text,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role));
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.log_audit('team.member_role_changed','team',NEW.team_id::text,
      jsonb_build_object('user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('team.member_removed','team',OLD.team_id::text,
      jsonb_build_object('user_id', OLD.user_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_audit_team_members ON public.team_members;
CREATE TRIGGER trg_audit_team_members AFTER INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_team_members();

CREATE OR REPLACE FUNCTION public.tg_audit_shares() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('share.created','share',NEW.id::text,
      jsonb_build_object('file_name', NEW.file_name, 'recipient', NEW.recipient_email, 'public', NEW.public_link_enabled));
  ELSIF TG_OP = 'UPDATE' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    PERFORM public.log_audit('share.revoked','share',NEW.id::text, jsonb_build_object('file_name', NEW.file_name));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_shares ON public.review_shares;
CREATE TRIGGER trg_audit_shares AFTER INSERT OR UPDATE ON public.review_shares
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_shares();
