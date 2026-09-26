-- Public audit snapshots are written only by the audited server-side share flow.
begin;

create table public.twitch_audit_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  channel_login text not null check (channel_login ~ '^[a-z0-9_]{1,25}$'),
  report jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint audit_expiry check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint audit_public_contract check (coalesce((
    jsonb_typeof(report) = 'object'
    and report->>'version' = 'twitch-audit-v1'
    and report->>'platform' = 'twitch'
    and report->>'source' = 'Twitch Helix API'
    and report->'profile'->>'login' = channel_login
    and report ?& array['version','platform','source','fetchedAt','profile','followers','stream','channel','videos']
    and report - array['version','platform','source','fetchedAt','profile','followers','stream','channel','videos'] = '{}'::jsonb
    and jsonb_typeof(report->'profile') = 'object'
    and (report->'profile') - array['id','login','displayName','description','profileImageUrl','broadcasterType','createdAt'] = '{}'::jsonb
    and octet_length(report::text) <= 65536
  ), false))
);

create index twitch_audit_shares_owner_created on public.twitch_audit_shares(owner_id, created_at desc);
create index twitch_audit_shares_expiry on public.twitch_audit_shares(expires_at);
alter table public.twitch_audit_shares enable row level security;

-- No public SELECT policy and no browser INSERT/UPDATE privilege. Knowledge of a
-- row UUID or owner UUID does not authorize access to a report or share token.
revoke all on public.twitch_audit_shares from public, anon, authenticated;
grant select (id, owner_id, channel_login, created_at, expires_at), delete
  on public.twitch_audit_shares to authenticated;
grant all on public.twitch_audit_shares to service_role;

create policy "Owners can list their audit shares"
  on public.twitch_audit_shares for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can revoke their audit shares"
  on public.twitch_audit_shares for delete to authenticated
  using ((select auth.uid()) = owner_id);

comment on table public.twitch_audit_shares is
  'Immutable public Twitch snapshots. Raw 256-bit bearer tokens are never stored. Public reads go through audit-share with a matching SHA-256 token hash and unexpired timestamp.';

commit;
