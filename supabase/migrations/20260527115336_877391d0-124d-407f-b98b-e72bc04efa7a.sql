
-- Enum for account status
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('pending', 'active', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add status + email to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing profiles to active (existing users keep access)
UPDATE public.profiles SET status = 'active' WHERE status = 'pending';

-- Backfill email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Replace handle_new_user to set status based on email domain
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_status public.account_status;
begin
  if lower(new.email) like '%@gocanvas.com' then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into public.profiles (user_id, display_name, email, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    v_status
  );

  -- Auto-grant 'user' role on activation; admins still need to be granted explicitly
  if v_status = 'active' then
    insert into public.user_roles (user_id, role) values (new.id, 'user')
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Admin RLS: view and update all profiles
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- When an admin flips a profile to 'active', auto-create the 'user' role
CREATE OR REPLACE FUNCTION public.on_profile_activated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.status = 'active' and (old.status is distinct from 'active') then
    insert into public.user_roles (user_id, role) values (new.user_id, 'user')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_on_profile_activated ON public.profiles;
CREATE TRIGGER trg_on_profile_activated
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.on_profile_activated();
