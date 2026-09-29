begin;

create table public.kick_audit_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  channel_login text not null check (channel_login ~ '^[a-z0-9_-]{1,25}$'),
  report jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint kick_audit_expiry check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint kick_audit_public_contract check (coalesce((
    jsonb_typeof(report) = 'object'
    and report->>'version' = 'kick-audit-v1'
    and report->>'platform' = 'kick'
    and report->>'source' = 'Kick Developer Public API'
    and report->'profile'->>'slug' = channel_login
    and report ?& array['version','platform','source','fetchedAt','profile','channel','stream','ai']
    and report - array['version','platform','source','fetchedAt','profile','channel','stream','ai'] = '{}'::jsonb
    and (report->'profile') - array['id','slug','displayName','description','profileImageUrl'] = '{}'::jsonb
    and (report->'channel') - array['title','category','bannerUrl'] = '{}'::jsonb
    and (report->'stream') - array['isLive','viewers','startedAt'] = '{}'::jsonb
    and (report->'ai') - array['status','reason','findings'] = '{}'::jsonb
    and jsonb_typeof(report->'ai'->'findings') = 'array'
    and jsonb_array_length(report->'ai'->'findings') <= 3
    and octet_length(report::text) <= 32768
  ), false))
);

create index kick_audit_shares_owner_created on public.kick_audit_shares(owner_id, created_at desc);
create index kick_audit_shares_expiry on public.kick_audit_shares(expires_at);
alter table public.kick_audit_shares enable row level security;

revoke all on public.kick_audit_shares from public, anon, authenticated;
grant select (id, owner_id, channel_login, created_at, expires_at), delete
  on public.kick_audit_shares to authenticated;
grant all on public.kick_audit_shares to service_role;

create policy "Owners can list their Kick audit shares"
  on public.kick_audit_shares for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can revoke their Kick audit shares"
  on public.kick_audit_shares for delete to authenticated
  using ((select auth.uid()) = owner_id);

comment on table public.kick_audit_shares is
  'Immutable public Kick snapshots. Raw bearer tokens are never stored. Public reads go through audit-share.';

commit;
