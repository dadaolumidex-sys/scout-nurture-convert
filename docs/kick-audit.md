# Kick Channel Audit setup

The Kick option uses Kick's official Developer Public API. It does not use the
old unofficial channel endpoint or estimate followers and average viewers.

1. In [Kick Developer](https://dev.kick.com/), create an app from the Developer
   section of your Kick account settings. Keep the Client Secret private.
2. In the Supabase project used by this website, add Edge Function secrets named
   `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` with the app's values. Do not put
   either value in a `VITE_` variable or the browser.
3. Apply `supabase/migrations/20260928010000_kick_audit_shares.sql` to the same
   project before deploying the updated `audit-share` function.
4. Deploy both `analyze-kick` and the updated `audit-share` Edge Functions, then
   deploy the website. Verify a real Kick channel and create/open a share link.

Kick's app access token can read public channel information without asking each
streamer to authorize the app. The audit shows description, title, category,
live status, and current viewer count when returned. Its public endpoints do
not provide the follower total, average live viewers, replay counts, or the
creator's private analytics. Those remain unavailable, not zero. AI findings
must cite returned facts and are presented as testable suggestions, not detected
hidden errors or guaranteed growth.

Source: [Kick OAuth app-token flow](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/generating-tokens-oauth2-flow.md)
and [Kick Developer Public API](https://api.kick.com/swagger/doc.json).
