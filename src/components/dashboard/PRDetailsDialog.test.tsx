import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createDemoDashboard, createDemoPullRequestDetail } from "@/lib/demo-dashboard";
import { fetchPullRequestDetail } from "@/lib/api";
import type { PullRequestDetailResponse } from "@/types/github";
import { PRDetailsDialog } from "./PRDetailsDialog";

vi.mock("@/lib/api", () => ({ fetchPullRequestDetail: vi.fn(), mergePullRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const props = { open: true, onOpenChange: vi.fn(), owner: "me", repo: "app", viewerLogin: "me", canMerge: true };
const fixture = createDemoPullRequestDetail(createDemoDashboard().pullRequests[0]);

it("ignores late responses after opening a different PR and aborts the old request", async () => {
  let resolveOld!: (value: PullRequestDetailResponse) => void;
  let resolveNew!: (value: PullRequestDetailResponse) => void;
  vi.mocked(fetchPullRequestDetail)
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveNew = resolve; }));
  const view = render(<PRDetailsDialog {...props} pullNumber={1} />);
  const oldSignal = vi.mocked(fetchPullRequestDetail).mock.calls[0][3];
  view.rerender(<PRDetailsDialog {...props} pullNumber={2} />);
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { resolveNew({ ...fixture, number: 2, title: "Current PR" }); });
  expect(screen.getByRole("heading", { name: /Current PR/ })).toBeTruthy();
  await act(async () => { resolveOld({ ...fixture, number: 1, title: "Old PR" }); });
  expect(screen.getByRole("heading", { name: /Current PR/ })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /Old PR/ })).toBeNull();
});

it("shows actionable fetch errors and can retry", async () => {
  vi.mocked(fetchPullRequestDetail).mockRejectedValueOnce(new Error("Sign in with GitHub to view PR details."))
    .mockResolvedValueOnce(fixture);
  render(<PRDetailsDialog {...props} pullNumber={1} />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Sign in with GitHub to view PR details.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: new RegExp(fixture.title) })).toBeTruthy();
});

it("renders fixture details without fetching or offering merge", async () => {
  render(<PRDetailsDialog {...props} canMerge={false} pullNumber={fixture.number} demoDetail={fixture} />);
  await screen.findByRole("heading", { name: new RegExp(fixture.title) });
  expect(fetchPullRequestDetail).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Merge (Squash)" })).toBeNull();
});
