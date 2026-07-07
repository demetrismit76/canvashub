
-- Profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = user_id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Form files
create table public.form_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  schema_json jsonb not null,
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, file_name)
);

create index form_files_user_recent_idx on public.form_files (user_id, last_opened_at desc);

alter table public.form_files enable row level security;

create policy "Users view own files" on public.form_files
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own files" on public.form_files
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own files" on public.form_files
  for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own files" on public.form_files
  for delete to authenticated using (auth.uid() = user_id);

create trigger form_files_updated_at
  before update on public.form_files
  for each row execute function public.update_updated_at_column();

-- Trim to 20 most-recent per user
create or replace function public.trim_form_files_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.form_files
  where user_id = new.user_id
    and id not in (
      select id from public.form_files
      where user_id = new.user_id
      order by last_opened_at desc
      limit 20
    );
  return null;
end;
$$;

create trigger form_files_trim
  after insert or update of last_opened_at on public.form_files
  for each row execute function public.trim_form_files_history();

-- Per-file done map (replaces dm:done:<name> localStorage)
create table public.form_files_done (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  done_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, file_name)
);

alter table public.form_files_done enable row level security;

create policy "Users view own done" on public.form_files_done
  for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own done" on public.form_files_done
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own done" on public.form_files_done
  for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own done" on public.form_files_done
  for delete to authenticated using (auth.uid() = user_id);

create trigger form_files_done_updated_at
  before update on public.form_files_done
  for each row execute function public.update_updated_at_column();
