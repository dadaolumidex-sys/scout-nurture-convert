import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import AnalyzerPage from "@/pages/AnalyzerPage";
import { callEdgeFunction } from "@/lib/edgeFunction";
import type { ChannelAudit } from "@/lib/channelAudit";

vi.mock("@/components/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/edgeFunction", () => ({ callEdgeFunction: vi.fn() }));
vi.mock("@/components/analyzer/AuditShareControls", () => ({ AuditShareControls: () => null }));

// Deliberately synthetic data, only used by this test suite.
const audit: ChannelAudit = {
  version: "twitch-audit-v1", platform: "twitch", source: "Twitch Helix API", fetchedAt: "2026-09-25T12:00:00Z",
  profile: { id: "123", login: "example", displayName: "Example", description: "Test bio", profileImageUrl: null, broadcasterType: "affiliate", createdAt: "2020-01-01T00:00:00Z" },
  followers: { status: "available", data: 0, reason: null },
  stream: { status: "available", data: { isLive: false, title: null, category: null, viewers: null, startedAt: null }, reason: null },
  channel: { status: "available", data: { title: "Test title", category: "Art", language: "en" }, reason: null },
  videos: { status: "available", data: [], reason: null },
};

function submit(value = "example") {
  fireEvent.change(screen.getByLabelText("Twitch channel"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Channel Audit page", () => {
  it("reveals all ten roadmap actions in one click", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue(audit);
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("Streamer channel growth roadmap")).toBeInTheDocument();
    expect(screen.queryByText("Campaign Growth Token", { exact: false })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all 10 steps" }));
    expect(screen.getAllByText("What needs to be done")).toHaveLength(10);
    expect(screen.getByText(/Campaign Growth Token may be included/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all steps" }));
    expect(screen.queryByText(/Campaign Growth Token may be included/)).not.toBeInTheDocument();
  });
  it("renders facts, source links and an honest empty archive state", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue(audit);
    render(<AnalyzerPage />);
    submit("https://www.twitch.tv/example");
    expect(await screen.findByText("Example")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Offline at retrieval")).toBeInTheDocument();
    expect(screen.getAllByText("Not live").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Twitch returned no archived broadcasts/)).toBeInTheDocument();
    expect(screen.getByText("What viewers see · What to fix")).toBeInTheDocument();
    expect(screen.getByText("Twitch Affiliate and Partner paths")).toBeInTheDocument();
    expect(screen.getByText("Path to Affiliate")).toBeInTheDocument();
    expect(screen.getByText("Path to Partner")).toBeInTheDocument();
    expect(screen.getByText("25 followers")).toBeInTheDocument();
    expect(screen.getByText("4 hours")).toBeInTheDocument();
    expect(screen.getByText("4 days")).toBeInTheDocument();
    expect(screen.getByText("3 average viewers on 4 days")).toBeInTheDocument();
    expect(screen.getAllByText("6 streams on 6 unique days")).toHaveLength(2);
    expect(screen.getByText(/Missing private metrics are not zero/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Achievements/ })).toHaveLength(2);
    expect(screen.getByText("Public opportunity score")).toBeInTheDocument();
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.queryByText(/42\/100|100\/100/)).not.toBeInTheDocument();
    expect(screen.getByText("Verified setup checks (2/2)")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Source:/ })).toHaveLength(8);
    expect(callEdgeFunction).toHaveBeenCalledWith("analyze-twitch", { username: "example", includeAi: true }, 65_000);
  });

  it("puts actual follower, live-viewer, and VOD-view snapshots up front without calling them averages", async () => {
    const report: ChannelAudit = {
      ...audit,
      followers: { status: "available", data: 70, reason: null },
      stream: { status: "available", data: { isLive: true, title: "Animo time!", category: "Animo", viewers: 1, startedAt: audit.fetchedAt }, reason: null },
      videos: { status: "available", data: [3, 6, 11].map((views, index) => ({ id: String(index + 1), title: "Playing Animo with viewers tonight", createdAt: audit.fetchedAt, duration: "1h", views })), reason: null },
    };
    vi.mocked(callEdgeFunction).mockResolvedValue(report);
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("Example")).toBeInTheDocument();
    expect(screen.getByText("Views on returned recent VODs")).toBeInTheDocument();
    expect(screen.getByText("3–11")).toBeInTheDocument();
    expect(screen.getByText(/These public snapshots are not average viewers/)).toBeInTheDocument();
  });

  it("shows AI fixes alongside verified Twitch facts without claiming measured viewer loss", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({ ...audit, ai: { status: "available", reason: null, findings: [{
      evidenceId: "bio", evidence: "Channel bio: Test bio", title: "Explain your channel promise",
      possibleImpact: "New visitors may not know why to follow.", fix: "Add a clear content promise.",
      test: "Compare follows in Creator Dashboard after changing the bio.",
    }] } });
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("AI-assisted channel review")).toBeInTheDocument();
    expect(screen.getAllByText("Explain your channel promise")).toHaveLength(2);
    expect(screen.getByText("Channel bio: Test bio")).toBeInTheDocument();
    expect(screen.getByText(/hypothesis, not a measured cause/)).toBeInTheDocument();
  });

  it("does not present a complete setup checklist as channel health when VOD replay counts are small", async () => {
    const report: ChannelAudit = {
      ...audit,
      fetchedAt: "2026-09-28T12:00:00Z",
      profile: { ...audit.profile, description: "Gaming and community play every week. Join for Fortnite and Call of Duty challenges, highlights, and friendly chat sessions together." },
      followers: { status: "available", data: 167, reason: null },
      channel: { status: "available", data: { title: "Drop follow guyz and join me for Fortnite and COD", category: "Fortnite", language: "en" }, reason: null },
      videos: { status: "available", data: [
        { id: "1", title: "Drop follow guyz and join me for Fortnite and COD", createdAt: "2026-09-23T10:00:00Z", duration: "1h", views: 11 },
        { id: "2", title: "Drop follow guyz and join me for Fortnite and COD", createdAt: "2026-09-22T10:00:00Z", duration: "1h", views: 8 },
      ], reason: null },
    };
    vi.mocked(callEdgeFunction).mockResolvedValue(report);
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("Recent broadcasts need a replay-reach review")).toBeInTheDocument();
    expect(screen.getByText("Priority: needs work")).toHaveClass("text-rose-500");
    expect(screen.getByText("26/100")).toHaveClass("text-rose-500");
    fireEvent.click(screen.getByText("How this score is calculated"));
    expect(screen.getByText("Public follower milestone")).toBeInTheDocument();
    expect(screen.getByText("20/20")).toBeInTheDocument();
    expect(screen.getByText("Lead with the stream, not a follow request")).toBeInTheDocument();
    expect(screen.queryByText("100/100")).not.toBeInTheDocument();
    expect(screen.getByText(/not a Twitch health score/)).toBeInTheDocument();
  });

  it("offers an urgent expert review when every sampled replay has low views without inventing a backend error", async () => {
    const report: ChannelAudit = {
      ...audit,
      fetchedAt: "2026-09-28T12:00:00Z",
      followers: { status: "available", data: 70, reason: null },
      channel: { status: "available", data: { title: "Playing Animo with viewers tonight", category: "Animo", language: "en" }, reason: null },
      videos: { status: "available", data: Array.from({ length: 10 }, (_, index) => ({
        id: String(index + 1), title: "Playing Animo with viewers tonight",
        createdAt: new Date(Date.parse("2026-09-23T10:00:00Z") - index * 86_400_000).toISOString(),
        duration: "1h", views: index + 3,
      })), reason: null },
    };
    vi.mocked(callEdgeFunction).mockResolvedValue(report);
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("Critical review priority: repeated low replay activity")).toBeInTheDocument();
    expect(screen.getByText("45/100")).toHaveClass("text-rose-500");
    expect(screen.getByText("Critical issue to investigate")).toBeInTheDocument();
    expect(screen.getByText(/70 followers are already present/)).toBeInTheDocument();
    expect(screen.getByText("Get an expert review before the next broadcasts")).toBeInTheDocument();
    expect(screen.getByText(/Public VOD counts do not reveal a hidden Twitch backend error/)).toBeInTheDocument();
    expect(screen.queryByText(/backend error detected|bot followers confirmed/i)).not.toBeInTheDocument();
  });

  it("rejects non-Twitch input without invoking the backend", async () => {
    render(<AnalyzerPage />);
    submit("https://twitch.tv.evil.test/example");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a Twitch username");
    expect(callEdgeFunction).not.toHaveBeenCalled();
  });

  it("clears old results when input changes and after a failed retry", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValueOnce(audit).mockRejectedValueOnce(new Error("Twitch rate limit reached. Please wait and try again."));
    render(<AnalyzerPage />);
    submit();
    await screen.findByText("Example");
    fireEvent.change(screen.getByLabelText("Twitch channel"), { target: { value: "someone" } });
    expect(screen.queryByText("Example")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run audit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rate limit");
    expect(screen.queryByText("Example")).not.toBeInTheDocument();
  });

  it("keeps denied followers and unknown live status unavailable", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({ ...audit, followers: { status: "unavailable", data: null, reason: "Twitch did not authorize this data." }, stream: { status: "unavailable", data: null, reason: "Twitch took too long to respond." } });
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByText("Live status unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Partial report:/)).toBeInTheDocument();
    expect(screen.queryByText("Offline at retrieval")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("blocks duplicate submissions while loading and recovers after an error", async () => {
    let rejectRequest: (error: Error) => void;
    vi.mocked(callEdgeFunction).mockReturnValue(new Promise((_, reject) => { rejectRequest = reject; }));
    render(<AnalyzerPage />);
    submit();
    const form = screen.getByLabelText("Twitch channel").closest("form")!;
    fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Auditing..." })).toBeDisabled();
    expect(callEdgeFunction).toHaveBeenCalledTimes(1);
    rejectRequest!(new Error("Try again"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run audit" })).toBeEnabled());
  });

  it("never displays estimates from a legacy deployment", async () => {
    vi.mocked(callEdgeFunction).mockResolvedValue({ username: "example", followersEstimate: "~5000", avgViewers: "~123" });
    render(<AnalyzerPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("backend update");
    expect(screen.queryByText("~5000")).not.toBeInTheDocument();
    expect(screen.queryByText("~123")).not.toBeInTheDocument();
  });
});
