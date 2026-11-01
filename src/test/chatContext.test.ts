import { describe, expect, it } from "vitest";
import { isDurableMemoryFact, selectChatContext, selectMemoryFacts, shouldUseWorkspaceContext } from "../../supabase/functions/_shared/chatContext";

describe("chat context", () => {
  it("recalls a relevant older turn without resending the whole conversation", () => {
    const messages = [
      { role: "user" as const, content: "My project is called StreamScout" },
      ...Array.from({ length: 8 }, (_, index) => ({ role: "assistant" as const, content: `Unrelated response ${index}` })),
      { role: "user" as const, content: "What was my StreamScout project called?" },
    ];
    const selected = selectChatContext(messages, 4, 2);
    expect(selected[0].content).toBe("My project is called StreamScout");
    expect(selected.at(-1)?.content).toBe("What was my StreamScout project called?");
    expect(selected.length).toBeLessThan(messages.length);
  });

  it("keeps manual and relevant older memories ahead of unrelated recent facts", () => {
    const facts = [
      { content: "Uses a blue theme", source: "auto" },
      { content: "Building StreamScout for streamers", source: "auto" },
      { content: "Prefers short direct replies", source: "manual" },
    ];
    expect(selectMemoryFacts(facts, "Tell me about StreamScout", 2).map((fact) => fact.content))
      .toEqual(["Building StreamScout for streamers", "Prefers short direct replies"]);
  });

  it("does not load sales playbooks for an unrelated latest question", () => {
    expect(shouldUseWorkspaceContext("hello")).toBe(false);
    expect(shouldUseWorkspaceContext("Write a reply to my friend")).toBe(false);
    expect(shouldUseWorkspaceContext("Help with this Twitch audit")).toBe(true);
  });

  it("loads the outreach method for an indirect reply request with streamer context", () => {
    expect(shouldUseWorkspaceContext(
      "Reply to this person the same way we normally do",
      "They are a Twitch streamer asking how to grow their channel",
    )).toBe(true);
    expect(shouldUseWorkspaceContext("Write a reply to my friend", "We were talking about dinner")).toBe(false);
  });

  it("does not carry an old screenshot task into a new greeting", () => {
    const messages = [
      { role: "user" as const, content: "Analyze this screenshot and draft a reply" },
      { role: "assistant" as const, content: "Here is a reply for that streamer." },
      { role: "user" as const, content: "hi" },
    ];
    expect(selectChatContext(messages, 2).map((message) => message.content)).toEqual(["hi"]);
  });

  it("keeps durable goals out of one-off prospect memory", () => {
    expect(isDurableMemoryFact("User is building a streamer growth service")).toBe(true);
    expect(isDurableMemoryFact("Client John replied on Discord today")).toBe(false);
  });

  it("keeps a durable user preference available alongside relevant facts", () => {
    const facts = [
      { content: "User prefers warm, direct replies", source: "auto" },
      { content: "Uses a blue theme", source: "auto" },
      { content: "Building StreamScout for streamers", source: "auto" },
    ];
    expect(selectMemoryFacts(facts, "Help with StreamScout", 2).map((fact) => fact.content))
      .toEqual(["Building StreamScout for streamers", "User prefers warm, direct replies"]);
  });
});
