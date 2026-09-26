// Optional local-only integration check. Install @electric-sql/pglite with
// --no-save --no-package-lock, then: node scripts/test-audit-share-rls.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const share = '33333333-3333-4333-8333-333333333333';
const hash = 'a'.repeat(64);
const report = {
  version: 'twitch-audit-v1', platform: 'twitch', source: 'Twitch Helix API', fetchedAt: '2026-09-26T00:00:00Z',
  profile: { id: '123', login: 'example', displayName: 'Example', description: 'Public fixture', profileImageUrl: null, broadcasterType: '', createdAt: null },
  followers: { status: 'available', data: 0, reason: null },
  stream: { status: 'unavailable', data: null, reason: 'Unavailable' },
  channel: { status: 'unavailable', data: null, reason: 'Unavailable' },
  videos: { status: 'available', data: [], reason: null },
};
let checks = 0;
async function asRole(role, actor, test) {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`begin; set local role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [actor ?? '']);
  try { await test(); checks++; } finally { await db.exec('rollback'); }
}

try {
  // Model the standard Supabase roles/auth.uid() without a remote database.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    insert into auth.users(id) values ('${owner}'), ('${other}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260926010000_twitch_audit_shares.sql', import.meta.url), 'utf8'));
  checks++;
  await db.query('insert into public.twitch_audit_shares(id, owner_id, token_hash, channel_login, report) values ($1,$2,$3,$4,$5)', [share, owner, hash, 'example', JSON.stringify(report)]);

  await asRole('anon', null, async () => {
    await assert.rejects(db.query('select id from public.twitch_audit_shares'), /permission denied/);
  });
  await asRole('anon', null, async () => {
    await assert.rejects(db.query('delete from public.twitch_audit_shares'), /permission denied/);
  });
  await asRole('authenticated', owner, async () => {
    const rows = await db.query('select id,channel_login from public.twitch_audit_shares');
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].id, share);
  });
  await asRole('authenticated', other, async () => {
    assert.equal((await db.query('select id from public.twitch_audit_shares')).rows.length, 0);
    assert.equal((await db.query('delete from public.twitch_audit_shares where id=$1 returning id', [share])).rows.length, 0);
  });
  for (const column of ['report', 'token_hash']) await asRole('authenticated', owner, async () => {
    await assert.rejects(db.query(`select ${column} from public.twitch_audit_shares`), /permission denied/);
  });
  await asRole('authenticated', owner, async () => {
    await assert.rejects(db.query('update public.twitch_audit_shares set expires_at=now()'), /permission denied/);
  });
  await asRole('authenticated', owner, async () => {
    await assert.rejects(db.query('insert into public.twitch_audit_shares(owner_id,token_hash,channel_login,report) values ($1,$2,$3,$4)', [owner, 'b'.repeat(64), 'example', JSON.stringify(report)]), /permission denied/);
  });
  await asRole('authenticated', owner, async () => {
    assert.equal((await db.query('delete from public.twitch_audit_shares where id=$1 returning id', [share])).rows.length, 1);
    assert.equal((await db.query('select id from public.twitch_audit_shares')).rows.length, 0);
  });
  await asRole('service_role', null, async () => {
    assert.equal((await db.query('select report from public.twitch_audit_shares where token_hash=$1 and expires_at>now()', [hash])).rows.length, 1);
    assert.equal((await db.query('select report from public.twitch_audit_shares where token_hash=$1 and expires_at>now()', ['b'.repeat(64)])).rows.length, 0);
    await db.query("update public.twitch_audit_shares set created_at=now()-interval '31 days', expires_at=now()-interval '1 day' where id=$1", [share]);
    assert.equal((await db.query('select report from public.twitch_audit_shares where token_hash=$1 and expires_at>now()', [hash])).rows.length, 0);
  });
  await asRole('service_role', null, async () => {
    await assert.rejects(db.query("update public.twitch_audit_shares set expires_at=created_at+interval '31 days'"), /audit_expiry/);
  });
  for (const badReport of [{ ...report, private_chat: 'secret' }, { ...report, profile: { ...report.profile, email: 'private' } }, { ...report, profile: {} }]) {
    await asRole('service_role', null, async () => {
      await assert.rejects(db.query('update public.twitch_audit_shares set report=$1', [JSON.stringify(badReport)]), /audit_public_contract/);
    });
  }
  console.log(`PASS: migration applied; ${checks} PostgreSQL access-control/constraint checks passed.`);
} finally { await db.close(); }
