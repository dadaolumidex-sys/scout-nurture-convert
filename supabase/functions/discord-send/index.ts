import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { openDmChannel, sendMessage, getSelf } from "../_shared/discord.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Sign in required" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Sign in required" }, 401);

    const body = await req.json().catch(() => ({}));
    const contactId = typeof body?.contactId === "string" ? body.contactId : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const messageId = typeof body?.messageId === "string" ? body.messageId : null;

    if (!contactId) return json({ error: "contactId is required" }, 400);
    if (!content) return json({ error: "Message content is empty" }, 400);
    if (content.length > 1900) return json({ error: "Message too long for Discord (max 1900 characters)" }, 400);

    const { data: contact, error: cErr } = await admin
      .from("streamer_contacts")
      .select("id, user_id, username, display_name, discord_channel_id, discord_user_id, discord_persona")
      .eq("id", contactId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (cErr) return json({ error: cErr.message }, 500);
    if (!contact) return json({ error: "Contact not found" }, 404);

    // ping the token early so failures are clear
    await getSelf();

    let channelId = contact.discord_channel_id as string | null;
    if (!channelId && contact.discord_user_id) {
      channelId = await openDmChannel(contact.discord_user_id);
      await admin.from("streamer_contacts").update({ discord_channel_id: channelId }).eq("id", contact.id);
    }
    if (!channelId) return json({ error: "No Discord channel linked to this contact yet." }, 400);

    const sent = await sendMessage(channelId, content);

    if (messageId) {
      await admin.from("contact_messages")
        .update({ discord_message_id: sent?.id ?? null, source: "discord", selected: true })
        .eq("id", messageId)
        .eq("user_id", user.id);
    } else {
      await admin.from("contact_messages").insert({
        contact_id: contact.id,
        user_id: user.id,
        role: "assistant",
        content,
        persona: contact.discord_persona || "friend",
        discord_message_id: sent?.id ?? null,
        source: "discord",
        selected: true,
      });
    }

    await admin.from("streamer_contacts").update({
      last_message: content.slice(0, 100),
      discord_last_message_id: sent?.id ?? null,
      status: "in_conversation",
    }).eq("id", contact.id);

    return json({ ok: true, discordMessageId: sent?.id ?? null, channelId });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
