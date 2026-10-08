-- Saved scan results sync to the optional YOEO account so they survive a reinstall and appear on
-- other devices. Reports hold menu text and dish findings, never photos. Rows are removed with the
-- account through the owner foreign key, which delete_own_account() already cascades.
create table public.saved_reports (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 report jsonb not null check (jsonb_typeof(report)='object' and pg_column_size(report) <= 262144),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index saved_reports_owner on public.saved_reports(owner_id, created_at desc);
alter table public.saved_reports enable row level security;
create policy "Owner reads reports" on public.saved_reports for select to authenticated using ((select auth.uid())=owner_id);
create policy "Owner creates reports" on public.saved_reports for insert to authenticated with check ((select auth.uid())=owner_id);
create policy "Owner updates reports" on public.saved_reports for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy "Owner deletes reports" on public.saved_reports for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.saved_reports from anon;
grant select,insert,update,delete on public.saved_reports to authenticated;
-- touch_person_profile() only sets updated_at, so it serves this table as well.
create trigger touch_saved_report before update on public.saved_reports for each row execute function public.touch_person_profile();
