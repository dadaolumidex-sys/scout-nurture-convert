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
