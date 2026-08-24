import { describe, expect, it } from "vitest";

import {
  computeActivityStream,
  computeCiHealth,
  computeNeedsAttention,
  computeRepoHealthByName,
} from "./attention";
import type { CommitSummary, IssueSummary, RepoSummary, WorkflowRunSummary } from "@/types/github";

const NOW = Date.parse("2026-08-24T12:00:00Z");

function makeRun(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: 1,
    repo: "me/app",
    name: "CI",
    event: "push",
    status: "completed",
    conclusion: "success",
    branch: "main",
    createdAt: "2026-08-24T10:00:00Z",
    updatedAt: "2026-08-24T10:05:00Z",
    runStartedAt: "2026-08-24T10:00:00Z",
    durationSeconds: 300,
    url: "https://github.com/me/app/actions/runs/1",
    ...overrides,
  };
}

function makePr(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: 1,
    number: 1,
    repo: "me/app",
    title: "Add feature",
    state: "open",
    url: "https://github.com/me/app/pull/1",
    updatedAt: "2026-08-24T10:00:00Z",
    createdAt: "2026-08-20T10:00:00Z",
    author: "me",
    labels: [],
    isPullRequest: true,
    isDraft: false,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    ...makePr({ isPullRequest: false, ...overrides }),
  };
}

function makeRepo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    id: 1,
    name: "app",
    fullName: "me/app",
    owner: "me",
    description: null,
    url: "https://github.com/me/app",
    language: "TypeScript",
    visibility: "public",
    isPrivate: false,
    isFork: false,
    isArchived: false,
    stars: 0,
    forks: 0,
    sizeKb: 0,
    defaultBranch: "main",
    pushedAt: "2026-08-24T10:00:00Z",
    updatedAt: "2026-08-24T10:00:00Z",
    openIssues: 0,
    openPullRequests: 0,
    checkState: null,
    latestCommit: null,
    latestPullRequest: null,
    latestRun: null,
    ...overrides,
  };
}

describe("computeNeedsAttention", () => {
  it("flags the latest failing run per repo as critical", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [],
        issues: [],
        ciRuns: [
          makeRun({ id: 1, createdAt: "2026-08-24T09:00:00Z", conclusion: "failure" }),
          makeRun({ id: 2, createdAt: "2026-08-24T10:00:00Z", conclusion: "success" }),
        ],
        viewerLogin: "me",
      },
      NOW,
    );

    expect(items).toHaveLength(0);
  });

  it("uses the most recent run's status, not any failing run", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [],
        issues: [],
        ciRuns: [
          makeRun({ id: 1, createdAt: "2026-08-24T09:00:00Z", conclusion: "success" }),
          makeRun({ id: 2, createdAt: "2026-08-24T10:00:00Z", conclusion: "failure" }),
        ],
        viewerLogin: "me",
      },
      NOW,
    );

    expect(items).toEqual([
      expect.objectContaining({ kind: "failing-ci", severity: "critical", repo: "me/app" }),
    ]);
  });

  it("flags open PRs from someone else as review-requested regardless of age", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [makePr({ author: "someone-else", updatedAt: "2026-08-24T11:59:00Z" })],
        issues: [],
        ciRuns: [],
        viewerLogin: "me",
      },
      NOW,
    );

    expect(items).toEqual([
      expect.objectContaining({ kind: "review-requested", detail: "Opened by someone-else" }),
    ]);
  });

  it("flags the viewer's own PRs as stale only after 3 days of inactivity", () => {
    const fresh = computeNeedsAttention(
      {
        pullRequests: [makePr({ author: "me", updatedAt: "2026-08-23T12:00:00Z" })],
        issues: [],
        ciRuns: [],
        viewerLogin: "me",
      },
      NOW,
    );
    expect(fresh).toEqual([]);

    const stale = computeNeedsAttention(
      {
        pullRequests: [makePr({ author: "me", updatedAt: "2026-08-20T12:00:00Z" })],
        issues: [],
        ciRuns: [],
        viewerLogin: "me",
      },
      NOW,
    );
    expect(stale).toEqual([
      expect.objectContaining({ kind: "stale-pr", severity: "warning" }),
    ]);
  });

  it("ignores draft PRs entirely", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [makePr({ author: "someone-else", isDraft: true })],
        issues: [],
        ciRuns: [],
        viewerLogin: "me",
      },
      NOW,
    );
    expect(items).toEqual([]);
  });

  it("flags open issues quiet for more than 14 days, but not pull requests in the issue list", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [],
        issues: [
          makeIssue({ id: 2, updatedAt: "2026-08-01T12:00:00Z" }),
          makeIssue({ id: 3, isPullRequest: true, updatedAt: "2026-08-01T12:00:00Z" }),
        ],
        ciRuns: [],
        viewerLogin: "me",
      },
      NOW,
    );
    expect(items).toEqual([
      expect.objectContaining({ kind: "stale-issue", id: "stale-issue:2" }),
    ]);
  });

  it("sorts critical before warning before info, then most recent first", () => {
    const items = computeNeedsAttention(
      {
        pullRequests: [
          makePr({ id: 10, author: "me", updatedAt: "2026-08-19T00:00:00Z" }),
          makePr({ id: 11, author: "someone-else", updatedAt: "2026-08-23T00:00:00Z" }),
        ],
        issues: [makeIssue({ id: 20, updatedAt: "2026-08-01T00:00:00Z" })],
        ciRuns: [makeRun({ conclusion: "failure" })],
        viewerLogin: "me",
      },
      NOW,
    );

    expect(items.map((item) => item.kind)).toEqual([
      "failing-ci",
      "review-requested",
      "stale-pr",
      "stale-issue",
    ]);
  });
});

describe("computeCiHealth", () => {
  it("counts one status per repo from the latest run only", () => {
    const health = computeCiHealth([
      makeRun({ id: 1, repo: "me/a", createdAt: "2026-08-24T09:00:00Z", conclusion: "failure" }),
      makeRun({ id: 2, repo: "me/a", createdAt: "2026-08-24T10:00:00Z", conclusion: "success" }),
      makeRun({ id: 3, repo: "me/b", createdAt: "2026-08-24T10:00:00Z", conclusion: "failure" }),
      makeRun({ id: 4, repo: "me/c", createdAt: "2026-08-24T10:00:00Z", status: "in_progress", conclusion: null }),
    ]);

    expect(health).toEqual({
      total: 3,
      passing: 1,
      failing: 1,
      running: 1,
      unknown: 0,
      passRate: 50,
    });
  });

  it("reports a null pass rate when nothing has resolved", () => {
    const health = computeCiHealth([
      makeRun({ status: "in_progress", conclusion: null }),
    ]);
    expect(health.passRate).toBeNull();
  });
});

describe("computeRepoHealthByName", () => {
  it("marks repos with failing latest runs as critical even without attention items", () => {
    const health = computeRepoHealthByName(
      [makeRepo({ fullName: "me/app", latestRun: makeRun({ conclusion: "failure" }) })],
      [],
    );
    expect(health.get("me/app")).toBe("critical");
  });

  it("promotes a healthy repo to attention when it has a warning-severity attention item", () => {
    const health = computeRepoHealthByName(
      [makeRepo({ fullName: "me/app" })],
      [
        {
          id: "x",
          kind: "stale-pr",
          severity: "warning",
          repo: "me/app",
          title: "t",
          url: "u",
          updatedAt: "2026-08-01T00:00:00Z",
          detail: "d",
        },
      ],
    );
    expect(health.get("me/app")).toBe("attention");
  });

  it("does not downgrade a critical repo to attention", () => {
    const health = computeRepoHealthByName(
      [makeRepo({ fullName: "me/app", latestRun: makeRun({ conclusion: "failure" }) })],
      [
        {
          id: "x",
          kind: "stale-pr",
          severity: "warning",
          repo: "me/app",
          title: "t",
          url: "u",
          updatedAt: "2026-08-01T00:00:00Z",
          detail: "d",
        },
      ],
    );
    expect(health.get("me/app")).toBe("critical");
  });
});

describe("computeActivityStream", () => {
  it("merges commits, pull requests, issues, and CI runs into one chronological feed", () => {
    const commits: CommitSummary[] = [
      {
        repo: "me/app",
        sha: "abc1234",
        shortSha: "abc1234",
        message: "Fix bug",
        author: "me",
        date: "2026-08-24T11:00:00Z",
        url: "https://github.com/me/app/commit/abc1234",
      },
    ];

    const events = computeActivityStream({
      commits,
      pullRequests: [makePr({ updatedAt: "2026-08-24T12:00:00Z" })],
      issues: [makeIssue({ id: 2, updatedAt: "2026-08-24T09:00:00Z" })],
      ciRuns: [makeRun({ updatedAt: "2026-08-24T10:30:00Z" })],
    });

    expect(events.map((event) => event.kind)).toEqual([
      "pull_request",
      "commit",
      "ci_run",
      "issue",
    ]);
  });

  it("caps results at the given limit", () => {
    const commits: CommitSummary[] = Array.from({ length: 5 }, (_, index) => ({
      repo: "me/app",
      sha: `sha${index}`,
      shortSha: `sha${index}`,
      message: `Commit ${index}`,
      author: "me",
      date: new Date(NOW - index * 60_000).toISOString(),
      url: "https://github.com/me/app/commit/x",
    }));

    const events = computeActivityStream(
      { commits, pullRequests: [], issues: [], ciRuns: [] },
      2,
    );
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe("commit:me/app:sha0");
  });
});
