-- =========================================================
-- TEAMS
-- =========================================================
CREATE TABLE public.teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- TEAM MEMBERS
-- =========================================================
CREATE TYPE public.team_member_role AS ENUM ('owner','member');

CREATE TABLE public.team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  role       public.team_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- HELPERS (SECURITY DEFINER to avoid policy recursion)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_team_member(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_owner(_team_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND role = 'owner'
  );
$$;

-- Super-user = admin OR owner
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','owner')
  );
$$;

-- =========================================================
-- RLS: teams
-- =========================================================
CREATE POLICY "Members view their teams"
ON public.teams FOR SELECT TO authenticated
USING (public.is_team_member(id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Any signed-in user can create a team"
ON public.teams FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team owners or super-admins update teams"
ON public.teams FOR UPDATE TO authenticated
USING (public.is_team_owner(id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Team owners or super-admins delete teams"
ON public.teams FOR DELETE TO authenticated
USING (public.is_team_owner(id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- =========================================================
-- RLS: team_members
-- =========================================================
CREATE POLICY "Members view team roster"
ON public.team_members FOR SELECT TO authenticated
USING (public.is_team_member(team_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Owners or super-admins add members"
ON public.team_members FOR INSERT TO authenticated
WITH CHECK (public.is_team_owner(team_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Owners or super-admins update members"
ON public.team_members FOR UPDATE TO authenticated
USING (public.is_team_owner(team_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Owners, super-admins, or self can remove"
ON public.team_members FOR DELETE TO authenticated
USING (
  public.is_team_owner(team_id, auth.uid())
  OR public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
);

-- Bootstrap: creator is automatically an owner of their team
CREATE OR REPLACE FUNCTION public.bootstrap_team_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bootstrap_team_owner
AFTER INSERT ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_team_owner();

CREATE TRIGGER trg_teams_updated
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Admin/Owner: list every profile (for role management UI)
-- =========================================================
CREATE OR REPLACE FUNCTION public.list_all_profiles()
RETURNS TABLE (
  user_id uuid, display_name text, email text,
  status public.account_status, created_at timestamptz,
  roles public.app_role[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.display_name, p.email, p.status, p.created_at,
         COALESCE(
           (SELECT array_agg(r.role ORDER BY r.role)
            FROM public.user_roles r WHERE r.user_id = p.user_id),
           ARRAY[]::public.app_role[]
         ) AS roles
  FROM public.profiles p
  WHERE public.is_super_admin(auth.uid())
  ORDER BY p.created_at DESC;
$$;

-- =========================================================
-- Expand a team into shareable recipients (members, with email)
-- Callable by any team member or super-admin.
-- =========================================================
CREATE OR REPLACE FUNCTION public.list_team_recipients(p_team_id uuid)
RETURNS TABLE (user_id uuid, display_name text, email text, role public.team_member_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.user_id, p.display_name, p.email, tm.role
  FROM public.team_members tm
  JOIN public.profiles p ON p.user_id = tm.user_id
  WHERE (public.is_team_member(p_team_id, auth.uid()) OR public.is_super_admin(auth.uid()))
    AND tm.team_id = p_team_id
    AND p.status = 'active'
  ORDER BY tm.role, p.display_name NULLS LAST, p.email;
$$;
