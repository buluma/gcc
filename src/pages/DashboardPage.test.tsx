import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoDashboard } from "@/lib/demo-dashboard";
import DashboardPage from "./DashboardPage";

afterEach(cleanup);

describe("dashboard search", () => {
  it("filters PRs, issues, and commits by repository and restores them on clear", () => {
    const data = createDemoDashboard();
    render(<DashboardPage demoMode publicUsername={null} theme="light" onThemeToggle={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Search dashboard" });
    const repo = data.pullRequests[0].repo;
    fireEvent.change(search, { target: { value: `  ${repo.toUpperCase()}  ` } });
    for (const [region, items, title] of [
      ["Pull Requests", data.pullRequests, "title"],
      ["Issues", data.issues, "title"],
      ["Commits", data.recentCommits, "message"],
    ] as const) {
      const panel = within(screen.getByRole("region", { name: region }));
      for (const item of items) {
        const text = title === "title" ? (item as typeof data.issues[number]).title : (item as typeof data.recentCommits[number]).message;
        expect(Boolean(panel.queryByText(text))).toBe(item.repo === repo);
      }
    }
    fireEvent.change(search, { target: { value: "" } });
    expect(within(screen.getByRole("region", { name: "Pull Requests" })).getByText(data.pullRequests[0].title)).toBeTruthy();
  });

  it("matches titles, numbers, authors, and commit SHAs without a matching repository", () => {
    const data = createDemoDashboard();
    render(<DashboardPage demoMode publicUsername={null} theme="light" onThemeToggle={vi.fn()} />);
    const search = screen.getByRole("textbox", { name: "Search dashboard" });
    for (const [region, query, title] of [
      ["Pull Requests", data.pullRequests[0].title, data.pullRequests[0].title],
      ["Issues", `#${data.issues[0].number}`, data.issues[0].title],
      ["Commits", data.recentCommits[0].shortSha, data.recentCommits[0].message],
      ["Pull Requests", data.pullRequests[0].author!, data.pullRequests[0].title],
    ]) {
      fireEvent.change(search, { target: { value: query } });
      expect(within(screen.getByRole("region", { name: region })).getByText(title)).toBeTruthy();
    }
    fireEvent.change(search, { target: { value: "no-results-for-this-query" } });
    expect(within(screen.getByRole("region", { name: "Pull Requests" })).getByText("No recent pull requests")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Issues" })).getByText("No recent issues")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Commits" })).getByText("No recent commits")).toBeTruthy();
  });
});

it("keeps demo PR details fixture-backed and read-only", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<DashboardPage demoMode publicUsername={null} theme="light" onThemeToggle={vi.fn()} />);
    const title = createDemoDashboard().pullRequests[0].title;
    const panel = within(screen.getByRole("region", { name: "Pull Requests" }));
    expect(panel.queryByRole("button", { name: /Merge/ })).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: title }));
    await screen.findByRole("heading", { name: new RegExp(title) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Merge (Squash)" })).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it("links public PRs to GitHub without exposing OAuth-only actions", async () => {
  const payload = createDemoDashboard();
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { "x-gcc-auth": "public" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<DashboardPage demoMode={false} publicUsername={payload.viewer.login} theme="light" onThemeToggle={vi.fn()} />);
    await screen.findByRole("region", { name: "Pull Requests" });
    const panel = within(screen.getByRole("region", { name: "Pull Requests" }));
    expect(panel.getByRole("link", { name: payload.pullRequests[0].title }).getAttribute("href")).toBe(payload.pullRequests[0].url);
    expect(panel.queryByRole("button", { name: /Merge/ })).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/dashboard/"))).toBe(true);
  } finally { vi.unstubAllGlobals(); }
});
