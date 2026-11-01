export type ContextMessage = { role: "user" | "assistant"; content: string; images?: string[] };
export type MemoryFact = { content: string; source?: string };

const STOP_WORDS = new Set(["about", "after", "again", "also", "and", "are", "been", "before", "can", "did", "does", "for", "from", "have", "how", "into", "just", "like", "more", "our", "please", "that", "their", "them", "there", "these", "this", "those", "want", "were", "what", "when", "where", "which", "with", "would", "your"]);

function terms(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9_]{3,}/g) || []).filter((word) => !STOP_WORDS.has(word)));
}

function overlap(query: Set<string>, text: string): number {
  const found = terms(text);
  let score = 0;
  for (const word of query) if (found.has(word)) score++;
  return score;
}

function needsPreviousConversation(value: string): boolean {
  return /\b(it|this|that|these|those|above|earlier|previous|before|continue|same|screenshot|image|chat|conversation|reply to|respond to|follow.?up|what do you mean)\b/i.test(value);
}

function isStandaloneGreeting(value: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)[!. ,?]*$/i.test(value.trim());
}

/** Keep the live exchange, plus a few relevant older turns from this same chat. */
export function selectChatContext<T extends ContextMessage>(messages: T[], recentCount = 4, olderCount = 4): T[] {
  if (messages.length <= recentCount) return messages;
  const latest = [...messages].reverse().find((message) => message.role === "user");
  const latestText = latest?.content || "";
  if (latest && isStandaloneGreeting(latestText)) return [latest];
  const query = terms(latestText);
  const split = messages.length - recentCount;
  const recallRequest = /\b(remember|earlier|previous|before|first|originally|last time|told you)\b/i.test(latestText);
  const needsHistory = needsPreviousConversation(latestText) || messages.slice(0, -1).some((message) => overlap(query, message.content) >= 2);
  if (!needsHistory && latest) return [latest];
  const ranked = messages.slice(0, split).map((message, index) => ({
    index,
    score: overlap(query, message.content) + (recallRequest && index === 0 ? 1 : 0),
  })).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, olderCount)
    .sort((a, b) => a.index - b.index);
  const recent = messages.slice(split).filter((message, index, items) =>
    message === latest || overlap(query, message.content) > 0 || (needsPreviousConversation(latestText) && index === items.length - 2),
  );
  return [...ranked.map((item) => messages[item.index]), ...recent];
}

/** Manual facts stay available; relevant old facts outrank unrelated recent ones. */
export function selectMemoryFacts<T extends MemoryFact>(facts: T[], queryText: string, limit = 30): T[] {
  const query = terms(queryText);
  return facts.map((fact, index) => ({
    fact,
    index,
    score: overlap(query, fact.content) * 10
      + (fact.source === "manual" ? 5 : 0)
      + (/^user (prefers|wants|uses|is building|runs|works with|always)/i.test(fact.content) ? 4 : 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.fact);
}

/** Only the current user task can request the saved streamer-sales playbooks. */
export function shouldUseWorkspaceContext(latestUserText: string, conversationText = ""): boolean {
  const businessTerms = /\b(client|prospect|streamer|discord|twitch|kick|outreach|pitch|convert|conversion|objection|audit|nifimas|brozeen)\b/i;
  if (businessTerms.test(latestUserText)) return true;
  const asksForReply = /\b(reply|respond|response|message|dm|follow.?up|approach|handle|close)\b/i.test(latestUserText);
  if (!asksForReply) return false;
  return businessTerms.test(conversationText)
    || /\b(same way|like we|our method|our approach|use our|this person|that person)\b/i.test(latestUserText);
}

/** Do not turn a one-off prospect update into an account-owner memory fact. */
export function isDurableMemoryFact(content: string): boolean {
  const value = content.trim().toLowerCase();
  return !(/\b(today|tomorrow|tonight|this morning|this afternoon|this evening|next week|right now)\b/.test(value)
    || /\b(prospect|client)\s+[^.]+\b(mentioned|said|replied|asked|plans?)\b/.test(value)
    || /\buser plans to (send|message|reach out|follow up|have .+ drop in)\b/.test(value)
    || /\b(discord|twitch|kick)\b[^.]{0,100}\b(mentioned|said|replied|asked)\b/.test(value));
}
