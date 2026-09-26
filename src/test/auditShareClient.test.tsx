import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditShareControls } from "@/components/analyzer/AuditShareControls";
import SharedAuditPage from "@/pages/SharedAuditPage";
import { useAuth } from "@/hooks/useAuth";
import { createAuditShare, listAuditShares, revokeAuditShare } from "@/lib/auditShare";
import { readAuditShare } from "@/lib/readAuditShare";
import { auditFixture } from "./fixtures/channelAudit";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auditShare", () => ({ createAuditShare: vi.fn(), listAuditShares: vi.fn(), revokeAuditShare: vi.fn() }));
vi.mock("@/lib/readAuditShare", () => ({ readAuditShare: vi.fn() }));
const id = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(64);
const expiresAt = "2026-10-25T12:00:00Z";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { id: "owner" }, loading: false } as ReturnType<typeof useAuth>);
  vi.mocked(listAuditShares).mockResolvedValue([]);
});
afterEach(cleanup);

describe("audit sharing controls", () => {
  it("requires sign-in before creating a link", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><AuditShareControls audit={auditFixture} onShared={vi.fn()} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create share link" })).not.toBeInTheDocument();
    expect(listAuditShares).not.toHaveBeenCalled();
  });

  it("creates a link from the login only, updates to the saved snapshot, and revokes it", async () => {
    const onShared = vi.fn();
    const freshReport = { ...auditFixture, fetchedAt: "2026-09-26T01:00:00Z" };
    vi.mocked(createAuditShare).mockResolvedValue({ id, url: `https://app.test/audit-report#${token}`, expiresAt, report: freshReport });
    vi.mocked(revokeAuditShare).mockResolvedValue();
    render(<MemoryRouter><AuditShareControls audit={auditFixture} onShared={onShared} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create share link" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Create share link" }));
    expect(await screen.findByLabelText("Report link")).toHaveValue(`https://app.test/audit-report#${token}`);
    expect(createAuditShare).toHaveBeenCalledWith("example");
    expect(onShared).toHaveBeenCalledWith(freshReport);
    fireEvent.click(screen.getByText(/Manage your active links/));
    fireEvent.click(screen.getByRole("button", { name: /Revoke link for example/ }));
    await screen.findByText("Link revoked.");
    expect(revokeAuditShare).toHaveBeenCalledWith(id);
    expect(screen.queryByLabelText("Report link")).not.toBeInTheDocument();
  });

  it("does not announce sharing or show a URL on backend failure", async () => {
    vi.mocked(createAuditShare).mockRejectedValue(new Error("Sharing is not configured."));
    render(<MemoryRouter><AuditShareControls audit={auditFixture} onShared={vi.fn()} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Create share link" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Create share link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not configured");
    expect(screen.queryByLabelText("Report link")).not.toBeInTheDocument();
  });
});

describe("standalone public report", () => {
  it("shows saved facts without a workspace or auth request", async () => {
    vi.mocked(readAuditShare).mockResolvedValue({ report: auditFixture, expiresAt });
    render(<MemoryRouter initialEntries={[`/audit-report#${token}`]}><SharedAuditPage /></MemoryRouter>);
    expect(await screen.findByText("Example")).toBeInTheDocument();
    expect(screen.getByText(/saved snapshot, not a live dashboard/)).toBeInTheDocument();
    expect(screen.queryByText("Conversation Inbox")).not.toBeInTheDocument();
    expect(useAuth).not.toHaveBeenCalled();
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow, noarchive");
  });

  it("shows an unavailable state without report contents for expired/revoked links", async () => {
    vi.mocked(readAuditShare).mockRejectedValue(new Error("Report unavailable or link expired."));
    render(<MemoryRouter initialEntries={[`/audit-report#${token}`]}><SharedAuditPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("link expired");
    expect(screen.queryByText("Example")).not.toBeInTheDocument();
  });
});
