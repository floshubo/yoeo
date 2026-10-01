-- Signed-in users can call quota RPCs only for their own account. Browser clients cannot grant Pro or write the quota tables directly.
create table public.scan_accounts (
 account_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null default 'free' check(plan in ('free','pro')),
 pro_until timestamptz,
 scans_used integer not null default 0 check(scans_used>=0)
);
create table public.scan_reservations (
 id uuid primary key,
 account_id uuid not null references public.scan_accounts(account_id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','complete','failed')),
 created_at timestamptz not null default now()
);
create index scan_reservations_account on public.scan_reservations(account_id,status,created_at);
alter table public.scan_accounts enable row level security;
alter table public.scan_reservations enable row level security;
revoke all on public.scan_accounts,public.scan_reservations from anon,authenticated;
grant all on public.scan_accounts,public.scan_reservations to service_role;

create function public.scan_usage_status(account_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.scan_accounts; pending integer; is_pro boolean;
begin
 if auth.uid() is null or auth.uid() <> scan_usage_status.account_id then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.scan_accounts(account_id) values(scan_usage_status.account_id) on conflict do nothing;
 select * into a from public.scan_accounts s where s.account_id=scan_usage_status.account_id;
 select count(*) into pending from public.scan_reservations r where r.account_id=a.account_id and r.status='pending' and r.created_at>now()-interval '5 minutes';
 is_pro:=a.plan='pro' and (a.pro_until is null or a.pro_until>now());
 return jsonb_build_object('plan',case when is_pro then 'pro' else 'free' end,'used',a.scans_used,'remaining',case when is_pro then null else greatest(0,3-a.scans_used-pending) end,'limit',3);
end; $$;

create function public.reserve_scan(account_id uuid,reservation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.scan_accounts; pending integer; is_pro boolean;
begin
 if auth.uid() is null or auth.uid() <> reserve_scan.account_id then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.scan_accounts(account_id) values(reserve_scan.account_id) on conflict do nothing;
 select * into a from public.scan_accounts s where s.account_id=reserve_scan.account_id for update;
 update public.scan_reservations r set status='failed' where r.account_id=a.account_id and r.status='pending' and r.created_at<=now()-interval '5 minutes';
 select count(*) into pending from public.scan_reservations r where r.account_id=a.account_id and r.status='pending';
 is_pro:=a.plan='pro' and (a.pro_until is null or a.pro_until>now());
 if not is_pro and a.scans_used+pending>=3 then return jsonb_build_object('allowed',false); end if;
 insert into public.scan_reservations(id,account_id) values(reservation_id,a.account_id);
 return jsonb_build_object('allowed',true);
end; $$;

create function public.finish_scan(account_id uuid,reservation_id uuid,succeeded boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.uid() is null or auth.uid() <> finish_scan.account_id then raise exception 'Not authorized' using errcode='42501'; end if;
 perform 1 from public.scan_accounts a where a.account_id=finish_scan.account_id for update;
 update public.scan_reservations r set status=case when succeeded then 'complete' else 'failed' end where r.id=reservation_id and r.account_id=finish_scan.account_id and r.status='pending';
 get diagnostics changed=row_count;
 if succeeded and changed=1 then update public.scan_accounts a set scans_used=scans_used+1 where a.account_id=finish_scan.account_id; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.scan_usage_status(uuid),public.reserve_scan(uuid,uuid),public.finish_scan(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.scan_usage_status(uuid),public.reserve_scan(uuid,uuid),public.finish_scan(uuid,uuid,boolean) to authenticated;
