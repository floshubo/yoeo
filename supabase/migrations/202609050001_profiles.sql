-- Apply in a Supabase project. Accounts are separate from person profiles:
-- an account may manage several people without giving children login credentials.
create table public.person_profiles (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 40),
 allergens jsonb not null default '[]'::jsonb check (jsonb_typeof(allergens)='array'),
 avatar text check (avatar is null or (length(avatar)<=150000 and avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')),
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index person_profiles_owner on public.person_profiles(owner_id);
alter table public.person_profiles enable row level security;
create policy "Owner reads profiles" on public.person_profiles for select to authenticated using ((select auth.uid())=owner_id);
create policy "Owner creates profiles" on public.person_profiles for insert to authenticated with check ((select auth.uid())=owner_id);
create policy "Owner updates profiles" on public.person_profiles for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy "Owner deletes profiles" on public.person_profiles for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.person_profiles from anon;
grant select,insert,update,delete on public.person_profiles to authenticated;
create function public.touch_person_profile() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger touch_person_profile before update on public.person_profiles for each row execute function public.touch_person_profile();
