// Built-in starter objection playbook (mirrors the server-side defaults).
export const DEFAULT_OBJECTION_PAIRS: { objection: string; response: string }[] = [
  {
    objection: `"Is this a bot?" / "Are you automated?"`,
    response: `Break the pattern with something no bot would say — name one specific thing from their last stream (game, a clip, their schedule), stay lowercase and casual, joke about it lightly. e.g. "lol nah real person, saw your last run — that clutch was nasty."`,
  },
  {
    objection: `"I don't have budget right now."`,
    response: `Never push price. Agree, drop the pressure, offer the free/low-lift option first (audit, a couple of tips, a small test run), then ask when a better time would be. Keep the door open.`,
  },
  {
    objection: `"Send me proof or past work."`,
    response: `Confident, zero defensiveness. Show real evidence — before/after viewer numbers, a channel you helped, screenshots — and offer a small test run so they judge results themselves.`,
  },
  {
    objection: `"How much does it cost?" / "What are your packages?"`,
    response: `Buying signal. Anchor value in one short line, then give the number straight and the next step. Never dodge the price question.`,
  },
  {
    objection: `"I'll think about it."`,
    response: `Don't chase. Name the one thing they're probably unsure about, answer it in a sentence, and set a soft follow-up time.`,
  },
  {
    objection: `"I already work with someone."`,
    response: `Respect it, stay friendly, ask what's working for them, and position yourself as the extra reach for when they want more.`,
  },
];
