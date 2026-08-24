import { describe, expect, it } from "vitest";

import { computeEngineeringSummary } from "./pr-risk";
import type { PullRequestDetailResponse } from "@/lib/api";

const NOW = Date.parse("2026-08-24T12:00:00Z");

function makePr(overrides: Partial<PullRequestDetailResponse> = {}): PullRequestDetailResponse {
  return {
    id: 1,
    number: 1,
    repo: "me/app",
    title: "Add feature",
    state: "open",
    url: "https://github.com/me/app/pull/1",
    updatedAt: "2026-08-24T10:00:00Z",
    createdAt: "2026-08-23T10:00:00Z",
    author: "me",
    labels: [],
    isPullRequest: true,
    isDraft: false,
    baseRef: "main",
    headRef: "feature",
    baseRepo: null,
    headRepo: null,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    statusCheckRollup: "success",
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commits: 1,
    body: null,
    isMergeable: true,
    draft: false,
    mergeableState: "clean",
    ...overrides,
  };
}

describe("computeEngineeringSummary", () => {
  it("rates a small, clean, approved PR as low risk with no factors", () => {
    const summary = computeEngineeringSummary(makePr(), NOW);
    expect(summary.level).toBe("low");
    expect(summary.sizeLabel).toBe("Small");
    expect(summary.factors).toEqual([]);
    expect(summary.headline).toContain("clean to merge");
  });

  it("rates a very large diff with conflicts and failing checks as high risk", () => {
    const summary = computeEngineeringSummary(
      makePr({
        additions: 900,
        deletions: 900,
        changedFiles: 40,
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
        statusCheckRollup: "failure",
        reviewDecision: "CHANGES_REQUESTED",
      }),
      NOW,
    );
    expect(summary.level).toBe("high");
    expect(summary.sizeLabel).toBe("Very large");
    expect(summary.factors.map((f) => f.label)).toEqual(
      expect.arrayContaining(["Large diff", "Merge conflicts", "Checks failing", "Changes requested"]),
    );
  });

  it("flags missing CI status and pending review without failing", () => {
    const summary = computeEngineeringSummary(
      makePr({ statusCheckRollup: null, reviewDecision: null }),
      NOW,
    );
    expect(summary.factors.map((f) => f.label)).toEqual([
      "No checks reported",
      "Awaiting review",
    ]);
  });

  it("flags stale open PRs older than 5 days", () => {
    const summary = computeEngineeringSummary(
      makePr({ createdAt: "2026-08-01T00:00:00Z" }),
      NOW,
    );
    expect(summary.factors.some((f) => f.label === "Open a while")).toBe(true);
  });

  it("does not flag staleness for drafts or closed PRs", () => {
    const draft = computeEngineeringSummary(
      makePr({ createdAt: "2026-08-01T00:00:00Z", isDraft: true }),
      NOW,
    );
    expect(draft.factors.some((f) => f.label === "Open a while")).toBe(false);

    const closed = computeEngineeringSummary(
      makePr({ createdAt: "2026-08-01T00:00:00Z", state: "closed" }),
      NOW,
    );
    expect(closed.factors.some((f) => f.label === "Open a while")).toBe(false);
  });

  it("rates a very large diff on its own as medium risk (score 2, below the high threshold)", () => {
    const summary = computeEngineeringSummary(
      makePr({ additions: 600, deletions: 600 }),
      NOW,
    );
    expect(summary.sizeLabel).toBe("Very large");
    expect(summary.level).toBe("medium");
  });
});
