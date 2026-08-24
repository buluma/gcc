import { describe, expect, it } from "vitest";

import { computePrIntelligence } from "./pr-intelligence";
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
    author: "someone-else",
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
    changedFiles: 1,
    commits: 1,
    body: null,
    isMergeable: true,
    draft: false,
    mergeableState: "clean",
    files: [{ path: "src/components/Button.tsx", additions: 10, deletions: 5 }],
    filesTruncated: false,
    reviewRequestedLogins: [],
    reviewRequestedTeams: [],
    ...overrides,
  };
}

describe("computePrIntelligence", () => {
  it("recommends merging a clean, approved, low-risk PR", () => {
    const result = computePrIntelligence(makePr(), "me", NOW);
    expect(result.recommendation).toBe("Approved and clean — ready to merge.");
    expect(result.changeProfile.risk).toBe("low");
    expect(result.reviewRequestedForViewer).toBe(false);
  });

  it("flags reviewRequestedForViewer when the viewer is a direct requested reviewer", () => {
    const result = computePrIntelligence(
      makePr({ reviewRequestedLogins: ["me"] }),
      "me",
      NOW,
    );
    expect(result.reviewRequestedForViewer).toBe(true);
    expect(result.attention.reasons).toContain("Review requested");
  });

  it("flags reviewRequestedForViewer when a team (not the viewer directly) was requested", () => {
    const result = computePrIntelligence(
      makePr({ reviewRequestedTeams: ["platform"] }),
      "me",
      NOW,
    );
    expect(result.reviewRequestedForViewer).toBe(true);
  });

  it("recommends fixing checks first when CI is failing, even over merge conflicts", () => {
    const result = computePrIntelligence(
      makePr({ statusCheckRollup: "failure", mergeable: "CONFLICTING" }),
      "me",
      NOW,
    );
    expect(result.recommendation).toBe("Fix the failing checks before requesting or continuing review.");
    expect(result.attention.reasons).toContain("CI failing");
  });

  it("recommends resolving conflicts when checks pass but the branch is dirty", () => {
    const result = computePrIntelligence(
      makePr({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }),
      "me",
      NOW,
    );
    expect(result.recommendation).toBe("Resolve merge conflicts before this can be reviewed or merged.");
  });

  it("derives security sensitivity from the real file list, not keywords", () => {
    const result = computePrIntelligence(
      makePr({
        title: "Tidy up helper",
        files: [{ path: "server/auth/session.ts", additions: 3, deletions: 1 }],
      }),
      "me",
      NOW,
    );
    expect(result.changeProfile.risk).toBe("high");
    expect(result.attention.reasons).toContain("Security-related change");
  });

  it("recommends a draft PR needs no action", () => {
    const result = computePrIntelligence(makePr({ isDraft: true }), "me", NOW);
    expect(result.recommendation).toBe(
      "Still a draft — no action needed until it's marked ready for review.",
    );
  });

  it("recommends no action for a closed PR", () => {
    const result = computePrIntelligence(makePr({ state: "closed" }), "me", NOW);
    expect(result.recommendation).toBe("No action needed — this pull request is already closed.");
  });

  it("flags staleness for an old open PR", () => {
    const result = computePrIntelligence(
      makePr({ createdAt: "2026-08-01T00:00:00Z" }),
      "me",
      NOW,
    );
    expect(result.attention.reasons.some((r) => r.startsWith("Stale"))).toBe(true);
  });
});
