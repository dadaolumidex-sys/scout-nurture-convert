# Twitch Channel Audit

The `/analyzer` route now hosts Channel Audit. Desktop navigation, the command palette,
and the dashboard say **Channel Audit**; the compact mobile tab says **Audit**.
Inbox, AI Chat, Search, their backend functions, and their data models are unchanged.
Running an audit does not create or update contacts.

## Shareable reports

After a signed-in user runs an audit, **Create share link** requests a fresh Twitch
snapshot from `audit-share`. The audit view updates to that saved snapshot. The
server accepts only the channel login; it never accepts a browser-supplied report,
owner ID, Inbox content, AI conversation, credentials, or follower identities.

Links use `/audit-report#<64-character-token>`. Each token contains 32 cryptographically
random bytes (256 bits). Only its SHA-256 hash is stored. The raw token is returned
once to the creator and is not recoverable from the database. It is in the URL
fragment so the web host does not receive it in page requests. Public viewing sends
it to `audit-share` in a POST body, without the visitor's session token or referrer.
The page sets no-index/no-referrer metadata and does not render the workspace or
preload its pages. Public response headers disable caching and indexing.

Anyone who has the link can view the snapshot. Links expire after 30 days. The
creator can list and revoke their active links after running an audit, including
links created during earlier sessions. Revocation cannot remove already saved
copies. Localhost links only work on the creator's computer; real sharing requires
using the hosted frontend after release.

The `twitch_audit_shares` table contains the public snapshot plus access-control
metadata (creator UUID, random row UUID, token hash, timestamps, and channel login).
Creator IDs and token hashes are never returned by the public reader. The server
projects an explicit allowlist of public fields and replaces private connection
failure details with a generic unavailable message before saving or serving a report.

RLS and SQL grants provide these boundaries:

- Anonymous visitors have no direct table access. The public Edge Function reads
  exactly one row using the matching token hash and an unexpired timestamp.
- Authenticated users can list only metadata for their own links and delete their
  own links. They cannot select stored hashes/reports or insert/update rows.
- Creation verifies the caller using Supabase Auth, retrieves facts from Twitch,
  and persists using the server-only service role. List/revoke requests use the
  caller's JWT so RLS, rather than the service role, enforces ownership.
- Reports are immutable through the client API. Deleted accounts cascade to their
  shares. Expiry blocks public access but does not delete retained rows; an
  administrator can periodically delete rows whose `expires_at <= now()`.

The dedicated migration only creates the new audit-sharing table, grants, and
policies; it does not change any Inbox, AI Chat, or Search table or policy.

## Release state (2026-09-26)

The local code is complete, but the hosted frontend has not been pushed. The live
Vercel app at `scout-nurture-convert.vercel.app` uses Supabase project
`bosqscioydkwmqilfwgg`, as verified in its public `client-CePW1mR3.js` bundle.
The older Lovable URL listed in the README uses `uqbhrwpcmfbtxkvtuxeo`; local
tracked `.env` also points there. Keep the Vercel project's existing production
environment configuration when releasing. Do not run a database push: several
unrelated local migrations are absent from `bosqscioydkwmqilfwgg` history.

On `bosqscioydkwmqilfwgg`, the exact isolated
`20260926010000_twitch_audit_shares.sql` migration was applied successfully in the
authenticated SQL editor after a preflight confirmed the table was absent. That
manual application did not update Supabase's migration history. Only
`analyze-twitch` and `audit-share` were deployed. The new `audit-share` function has
legacy JWT verification disabled, matching `supabase/config.toml`.

Live verification on 2026-09-26: `audit-share` starts successfully and an
unauthenticated POST with a syntactically valid unknown token returns the expected
HTTP 404. The real `twitchdev` audit returned HTTP 200 with profile, follower,
stream, channel, and archive sections. During diagnosis, safe logs were added for
upstream host/path/status and an allowlisted OAuth error category; credential
values, request parameters, and response bodies are never logged. Surrounding
whitespace is trimmed from the Twitch credential environment values.

The local frontend release is pending Vercel deployment and signed-out share,
owner revoke, and post-revocation checks. The live Vercel JavaScript bundle
identified `bosqscioydkwmqilfwgg`; preserve its existing production environment.
The tracked local `.env` still points at the older `uqbhrwpcmfbtxkvtuxeo` project
and must not be copied into Vercel settings.

Hosted Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Supply equivalents only in the
private local function environment when testing locally. Never use `VITE_`
variables for a service-role key or Twitch secrets. `audit-share` deliberately has
platform JWT verification disabled to allow public token reads; create/list/revoke
independently verify the bearer token via Supabase Auth, and anonymous auth
accounts cannot create shares.

No new external service or signing secret is needed. Missing migration/function/
credentials produce an error rather than a fake or local-only persisted report.

## Sharing access-control integration check

The SQL test uses an isolated, in-memory PostgreSQL instance, not the live project:

```sh
npm install --no-save --no-package-lock @electric-sql/pglite
node scripts/test-audit-share-rls.mjs
```

It applies the actual migration and exercises anonymous denial, owner/non-owner
listing/deletion, blocked client inserts/updates, hidden report/hash columns,
expiry, token matching, and payload constraints. This temporary test dependency
is not part of the application bundle or package manifest.

## Data contract

The `analyze-twitch` Edge Function returns `twitch-audit-v1`, using only the documented
[Twitch Helix API](https://dev.twitch.tv/docs/api/reference/):

| Section | Endpoint | What is displayed |
| --- | --- | --- |
| Profile | Get Users | Login, display name, bio, avatar, broadcaster status, creation time |
| Followers | Get Channel Followers | Exact `total`, if returned; zero is preserved |
| Live snapshot | Get Streams | Confirmed live/offline state, concurrent viewers, title, category, start time |
| Channel settings | Get Channel Information | Channel title, category, broadcast language |
| Recent broadcasts | Get Videos | Up to 10 archives, sorted newest first, with title, date, duration, and VOD view count |

Each section links to its Twitch API documentation. The report displays its retrieval
timestamp. Only a successful empty Get Streams response means offline. A failed or
malformed response means unavailable. Missing values never become zero. Individual
endpoint failures yield a partial report; a failed profile lookup yields an error.

VOD views are not concurrent viewers. The audit does not infer average live viewers,
streaming frequency, historical growth, engagement, growth stage, or promotion
potential. There are no AI calls, fabricated fallback metrics, or public GraphQL
fallbacks. No follower identities are returned to the browser.

The frontend validates the response version, shape, numeric counts, and requested
channel. An old deployed analyzer response is rejected rather than displayed.

## Server configuration

Set one of these credential pairs in the **server environment only**:

- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` for a registered Twitch application.
  The function obtains and caches a client-credentials app access token.
- The existing `LOVABLE_API_KEY` and `TWITCH_API_KEY` pair for the Twitch connector
  gateway. This route is used when the direct credential pair is absent.

Do not use `VITE_` variables for Twitch secrets. Follower access may be unavailable
depending on Twitch authorization; the UI reports the actual endpoint outcome.
Credentials and upstream error bodies are never included in reports.

## Local verification

```sh
npm install --no-package-lock
npm test
npm run build
npx tsc --noEmit -p tsconfig.app.json
```

The existing `package-lock.json` is out of sync with `package.json`, so `npm ci`
currently fails. The command above installs the declared dependencies locally
without changing that unrelated lockfile.

For a local live-data check, use the Supabase CLI and Docker to start the local stack
(`supabase start`), and serve `analyze-twitch` with a private local env file containing
the server credential pair (`supabase functions serve analyze-twitch --env-file <private-env-file>`).
Point `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the local
Supabase values, then start Vite with `npm run dev`. Open `/analyzer` and enter a real
Twitch channel. Never commit the private env file.

Without a working matching backend, the hosted analyzer cannot serve the new page.
The frontend remains local pending the release checks above.

The tests use explicitly synthetic responses and cover exact counts, zero/offline
semantics, denied and missing data, malformed responses, invalid URLs, legacy payloads,
not-found channels, rate limits, token reuse, duplicate submissions, and stale results.

## Verification for this change

- All 71 application tests pass, including 67 new audit/sharing tests.
- The actual sharing migration applies in isolated PostgreSQL; all 15 database
  access-control and constraint checks pass.
- The production build passes; the existing CSS import-order warning remains.
- ESLint passes for the changed audit implementation and tests.
- The local page and a temporary, explicitly labeled report fixture were checked in
  the browser at desktop and 390px mobile width, with no horizontal overflow.
- The full TypeScript check reports a pre-existing error at `src/hooks/useAuth.ts:36`:
  its effect cleanup returns the boolean result of `Set.delete`. That shared hook is
  unchanged in this audit-only work.
- Live Twitch retrieval succeeded against `bosqscioydkwmqilfwgg`; an unknown
  unauthenticated share token returned the expected 404.
