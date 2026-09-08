import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchMessages, openDmChannel, getSelf } from "../_shared/discord.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* cron sends minimal body */ }

    // Without a bot token there is nothing to sync — bail out before touching
    // the database so scheduled runs cost no disk I/O.
    if (!Deno.env.get("DISCORD_BOT_TOKEN")) {
      return json({ synced: 0, contacts: 0, imported: 0, skipped: "discord not configured" });
    }

    let query = supabase
      .from("streamer_contacts")
      .select("id, user_id, username, display_name, discord_channel_id, discord_user_id, discord_last_message_id, discord_persona")
      .eq("discord_sync_enabled", true);


    if (body?.contactId) query = query.eq("id", body.contactId);

    const { data: contacts, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!contacts?.length) return json({ synced: 0, contacts: 0, imported: 0 });

    let self: any = null;
    try { self = await getSelf(); } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }

    let imported = 0;
    const results: any[] = [];

    for (const c of contacts) {
      try {
        let channelId = c.discord_channel_id as string | null;
        if (!channelId && c.discord_user_id) {
          channelId = await openDmChannel(c.discord_user_id);
          await supabase.from("streamer_contacts").update({ discord_channel_id: channelId }).eq("id", c.id);
        }
        if (!channelId) { results.push({ id: c.id, skipped: "no channel" }); continue; }

        const msgs = await fetchMessages(channelId, c.discord_last_message_id);
        let lastId = c.discord_last_message_id as string | null;
        const rows: any[] = [];

        for (const m of msgs) {
          lastId = m.id;
          if (!m.content && !(m.attachments?.length)) continue;
          const fromBot = m.author?.id === self?.id;
          const attachmentUrl = m.attachments?.[0]?.url ?? null;
          rows.push({
            contact_id: c.id,
            user_id: c.user_id,
            role: fromBot ? "assistant" : "user",
            content: m.content || "[attachment]",
            persona: c.discord_persona || "friend",
            image_url: attachmentUrl && /\.(png|jpe?g|gif|webp)/i.test(attachmentUrl) ? attachmentUrl : null,
            discord_message_id: m.id,
            source: "discord",
            selected: false,
          });
        }

        if (rows.length) {
          const { error: insErr } = await supabase
            .from("contact_messages")
            .upsert(rows, { onConflict: "contact_id,discord_message_id", ignoreDuplicates: true });
          if (insErr) throw new Error(insErr.message);
          imported += rows.length;

          const incoming = rows.filter((r) => r.role === "user");
          if (incoming.length) {
            await supabase.from("app_notifications").insert({
              user_id: c.user_id,
              kind: "info",
              title: `New Discord reply from ${c.display_name || c.username}`,
              body: incoming[incoming.length - 1].content.slice(0, 160),
            });
          }
        }

        await supabase.from("streamer_contacts").update({
          discord_last_message_id: lastId,
          discord_last_synced_at: new Date().toISOString(),
          ...(rows.length ? { last_message: rows[rows.length - 1].content.slice(0, 100), status: "in_conversation" } : {}),
        }).eq("id", c.id);

        results.push({ id: c.id, imported: rows.length });
      } catch (e) {
        console.error("sync failed for", c.id, e);
        results.push({ id: c.id, error: (e as Error).message });
      }
    }

    return json({ contacts: contacts.length, imported, results });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
