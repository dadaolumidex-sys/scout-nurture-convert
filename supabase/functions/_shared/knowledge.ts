// Shared helper: turns stored knowledge entries into system-prompt context,
// with a dedicated OBJECTION HANDLING PLAYBOOK so the AI can match incoming
// objections to the user's saved responses. Used by both `chat` (AI assistant)
// and `chat-suggestions` (inbox reply helper).

export type Insight = { category?: string; insight?: string };
export type KnowledgeEntry = {
  title?: string;
  content?: string;
  category?: string;
  persona?: string;
  insights?: Insight[] | unknown;
};

// Built-in starter playbook — always available even before the user uploads anything.
export const DEFAULT_OBJECTIONS: string[] = [
  `Objection: "Is this a bot?" / "Are you automated?" → Response: Break pattern instantly with something no bot would say — reference one specific detail from their last stream (game, a clip, their schedule), keep it lowercase and casual, and joke about it lightly. e.g. "lol nah, real person. saw your last <game> run, that clutch was nasty."`,
  `Objection: "I don't have budget right now." → Response: Never push price. Agree, remove pressure, stay in their world: acknowledge budget is tight for most streamers, offer the free/low-lift option first (audit, tips, a small test run), and ask when a better time would be. Keep the door open instead of closing.`,
  `Objection: "Send me proof or past work." → Response: Confident, no defensiveness. Offer concrete evidence — before/after viewer numbers, a channel you helped, screenshots — and offer a small paid or free test so they judge results themselves. e.g. "yeah fair, here's what a channel your size did after 2 weeks..." then ask if they want the same setup.`,
  `Objection: "How much does it cost?" / "What are your packages?" → Response: This is a buying signal. Answer straight, no waffle, anchor value first in one short line, then give the number and a next step. Never dodge the price question.`,
  `Objection: "I'll think about it." → Response: Don't chase. Make it easy: name the one thing they're probably unsure about, answer it in a sentence, and set a soft follow-up time.`,
  `Objection: "I already work with someone." → Response: Respect it, stay friendly, ask what's working for them, and position yourself as the backup/extra channel for when they want more reach.`,
];

export const DEFAULT_OBJECTION_BLOCK = `\n\n## BUILT-IN STARTER OBJECTION PLAYBOOK (always available baseline)\n${DEFAULT_OBJECTIONS.map((o) => `- ${o}`).join("\n")}`;

// Hard voice rules — every generated outreach/reply message must obey these.
export const HUMAN_VOICE_RULES = `\n\n## HOW YOU MUST WRITE (non-negotiable)
- You are a real human typing on Discord. Never sound like an AI, assistant, agency, or salesperson.
- 1-3 short sentences. Hard max ~45 words. If it feels like a paragraph, cut it.
- Casual lowercase typing. Contractions. Natural gamer/Discord slang ("yo", "ngl", "fr", "bro", "lowkey", "clean", "nasty", "w"). Don't overdo slang — 1-2 per message.
- Zero corporate/marketing words. Banned: "leverage", "synergy", "utilize", "reach out", "circle back", "I hope this message finds you", "as an AI", "solutions", "elevate", "unlock", "furthermore", "additionally", "I'd love to discuss", "kindly".
- No bullet points, no headings, no markdown, no emoji spam (0-1 emoji max, only if it fits).
- No exclamation-mark stacking, no hype-bot energy. Real enthusiasm only about something specific they did.
- Always reference something concrete about THEM (their game, a moment, their viewer count, their schedule) when the conversation gives you it.
- End in a way that's easy to reply to — a short question or an open line, not a pitch wall.`;

const isObjectionCategory = (c?: string) =>
  typeof c === "string" && c.toLowerCase().includes("objection");



export function buildKnowledgeContext(entries: KnowledgeEntry[]): {
  knowledgeContext: string;
  objectionContext: string;
} {
  const objectionLines: string[] = [];
  const knowledgeBlocks: string[] = [];

  for (const e of entries || []) {
    const insights: Insight[] = Array.isArray(e.insights) ? (e.insights as Insight[]) : [];
    const entryIsObjection = isObjectionCategory(e.category);

    // Pull objection/response pairs from insights (or from an objection-typed entry).
    const objectionInsights = insights.filter(
      (i) => isObjectionCategory(i.category) || entryIsObjection,
    );
    for (const i of objectionInsights) {
      if (i.insight && i.insight.trim()) objectionLines.push(`- ${i.insight.trim()}`);
    }
    // If an objection entry has raw content but no parsed insights, include the content.
    if (entryIsObjection && objectionInsights.length === 0 && e.content?.trim()) {
      objectionLines.push(`- ${e.title ? `[${e.title}] ` : ""}${e.content.trim().slice(0, 600)}`);
    }

    // Non-objection knowledge goes in the general knowledge block.
    if (!entryIsObjection && e.content?.trim()) {
      const nonObjInsights = insights
        .filter((i) => !isObjectionCategory(i.category) && i.insight)
        .map((i) => `• [${i.category || "Insight"}] ${i.insight}`)
        .join("\n");
      knowledgeBlocks.push(
        `### ${e.title || "Reference"} [${e.category || "General"}]\n${e.content.trim().slice(0, 1500)}${
          nonObjInsights ? `\nKey points:\n${nonObjInsights}` : ""
        }`,
      );
    }
  }

  const knowledgeContext = knowledgeBlocks.length
    ? `\n\n## KNOWLEDGE BASE (reference material — use these strategies, scripts and facts when relevant to the conversation):\n${knowledgeBlocks.join("\n\n")}`
    : "";

  const objectionContext = objectionLines.length
    ? `\n\n## OBJECTION HANDLING PLAYBOOK (the user's own proven responses)\nWhen the person you're replying to raises a hesitation, doubt, or push-back, FIRST scan this list for the closest matching objection and base your reply on the paired response. Adapt the wording naturally to the conversation — don't paste it verbatim. The goal is to overcome the objection and move toward converting the buyer.\n\n${[...new Set(objectionLines)].slice(0, 40).join("\n")}`
    : "";

  return { knowledgeContext, objectionContext };
}

// Guard: reference material must never override the model's own accurate knowledge.
export const KNOWLEDGE_GUARDRAIL = `\n\nIMPORTANT: The KNOWLEDGE BASE and OBJECTION HANDLING PLAYBOOK above are extra reference material provided by the user. Use them to sound like the user and to overcome objections, but they do NOT replace your own general knowledge. If they conflict with well-established facts, or don't apply to the current message, rely on your own accurate knowledge and judgment.`;
