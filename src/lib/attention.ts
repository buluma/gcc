import { classifyGithubStatus } from "@/lib/github-status";
import type { CommitSummary, IssueSummary, RepoSummary, WorkflowRunSummary } from "@/types/github";

// "Needs Attention" surfaces the small set of engineering-relevant events that
// warrant a look before anything else on the dashboard: broken CI, PRs
// waiting on the viewer's review, PRs the viewer opened that have stalled,
// and issues that have gone quiet. It is derived entirely from data the
// dashboard already fetches; no extra API calls.

export type AttentionSeverity = "critical" | "warning" | "info";
export type AttentionKind =
  | "failing-ci"
  | "review-requested"
  | "stale-pr"
  | "stale-issue";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  repo: string;
  title: string;
  url: string;
  updatedAt: string;
  detail: string;
  /** Present for pull-request-derived items so the UI can open the PR dialog directly. */
  number?: number;
};

const STALE_OWN_PR_MS = 3 * 24 * 60 * 60 * 1000;
const STALE_ISSUE_MS = 14 * 24 * 60 * 60 * 1000;
const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function computeNeedsAttention(
  {
    pullRequests,
    issues,
    ciRuns,
    viewerLogin,
  }: {
    pullRequests: IssueSummary[];
    issues: IssueSummary[];
    ciRuns: WorkflowRunSummary[];
    viewerLogin: string;
  },
  now = Date.now(),
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const run of latestRunPerRepo(ciRuns).values()) {
    if (classifyGithubStatus(run.conclusion ?? run.status).rollup !== "failure")
      continue;
    items.push({
      id: `failing-ci:${run.repo}`,
      kind: "failing-ci",
      severity: "critical",
      repo: run.repo,
      title: run.name,
      url: run.url,
      updatedAt: run.updatedAt,
      detail: "Latest workflow run failed",
    });
  }

  for (const pr of pullRequests) {
    if (pr.state !== "open" || pr.isDraft) continue;
    const ageMs = now - Date.parse(pr.updatedAt);

    if (pr.author === viewerLogin) {
      if (ageMs <= STALE_OWN_PR_MS) continue;
      items.push({
        id: `stale-pr:${pr.id}`,
        kind: "stale-pr",
        severity: "warning",
        repo: pr.repo,
        title: pr.title,
        url: pr.url,
        updatedAt: pr.updatedAt,
        detail: `No activity for ${daysSince(ageMs)}+ days`,
        number: pr.number,
      });
    } else {
      items.push({
        id: `review-requested:${pr.id}`,
        kind: "review-requested",
        severity: "warning",
        repo: pr.repo,
        title: pr.title,
        url: pr.url,
        updatedAt: pr.updatedAt,
        detail: pr.author ? `Opened by ${pr.author}` : "Awaiting your input",
        number: pr.number,
      });
    }
  }

  for (const issue of issues) {
    if (issue.state !== "open" || issue.isPullRequest) continue;
    const ageMs = now - Date.parse(issue.updatedAt);
    if (ageMs <= STALE_ISSUE_MS) continue;
    items.push({
      id: `stale-issue:${issue.id}`,
      kind: "stale-issue",
      severity: "info",
      repo: issue.repo,
      title: issue.title,
      url: issue.url,
      updatedAt: issue.updatedAt,
      detail: `No activity for ${daysSince(ageMs)}+ days`,
    });
  }

  return items.sort((a, b) => {
    const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return rank !== 0 ? rank : Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export type CiHealth = {
  total: number;
  passing: number;
  failing: number;
  running: number;
  unknown: number;
  /** Percentage of resolved (passing + failing) runs that passed, or null if none resolved. */
  passRate: number | null;
};

export function computeCiHealth(ciRuns: WorkflowRunSummary[]): CiHealth {
  let passing = 0;
  let failing = 0;
  let running = 0;
  let unknown = 0;

  for (const run of latestRunPerRepo(ciRuns).values()) {
    const rollup = classifyGithubStatus(run.conclusion ?? run.status).rollup;
    if (rollup === "success") passing += 1;
    else if (rollup === "failure") failing += 1;
    else if (rollup === "running") running += 1;
    else unknown += 1;
  }

  const evaluated = passing + failing;
  return {
    total: passing + failing + running + unknown,
    passing,
    failing,
    running,
    unknown,
    passRate: evaluated > 0 ? (passing / evaluated) * 100 : null,
  };
}

export type RepoHealthTier = "healthy" | "attention" | "critical";

export function computeRepoHealthByName(
  repos: RepoSummary[],
  attentionItems: AttentionItem[],
): Map<string, RepoHealthTier> {
  const health = new Map<string, RepoHealthTier>();

  for (const repo of repos) {
    const rollup = classifyGithubStatus(
      repo.latestRun?.conclusion ?? repo.latestRun?.status ?? repo.checkState,
    ).rollup;
    health.set(repo.fullName, rollup === "failure" ? "critical" : "healthy");
  }

  for (const item of attentionItems) {
    const current = health.get(item.repo);
    if (current === "critical") continue;
    if (item.severity === "critical") health.set(item.repo, "critical");
    else if (item.severity === "warning") health.set(item.repo, "attention");
  }

  return health;
}

export type ActivityEventKind = "commit" | "pull_request" | "issue" | "ci_run";

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  repo: string;
  title: string;
  url: string;
  timestamp: string;
  author: string | null;
  meta: string;
};

export function computeActivityStream(
  {
    commits,
    pullRequests,
    issues,
    ciRuns,
  }: {
    commits: CommitSummary[];
    pullRequests: IssueSummary[];
    issues: IssueSummary[];
    ciRuns: WorkflowRunSummary[];
  },
  limit = 40,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const commit of commits) {
    events.push({
      id: `commit:${commit.repo}:${commit.sha}`,
      kind: "commit",
      repo: commit.repo,
      title: commit.message,
      url: commit.url,
      timestamp: commit.date,
      author: commit.author,
      meta: commit.shortSha,
    });
  }

  for (const pr of pullRequests) {
    events.push({
      id: `pull_request:${pr.id}`,
      kind: "pull_request",
      repo: pr.repo,
      title: pr.title,
      url: pr.url,
      timestamp: pr.updatedAt,
      author: pr.author,
      meta: `#${pr.number} · ${pr.isDraft ? "draft" : pr.state}`,
    });
  }

  for (const issue of issues) {
    events.push({
      id: `issue:${issue.id}`,
      kind: "issue",
      repo: issue.repo,
      title: issue.title,
      url: issue.url,
      timestamp: issue.updatedAt,
      author: issue.author,
      meta: `#${issue.number} · ${issue.state}`,
    });
  }

  for (const run of ciRuns) {
    events.push({
      id: `ci_run:${run.id}`,
      kind: "ci_run",
      repo: run.repo,
      title: run.name,
      url: run.url,
      timestamp: run.updatedAt,
      author: null,
      meta: classifyGithubStatus(run.conclusion ?? run.status).label,
    });
  }

  return events
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

function latestRunPerRepo(
  runs: WorkflowRunSummary[],
): Map<string, WorkflowRunSummary> {
  const latest = new Map<string, WorkflowRunSummary>();
  for (const run of runs) {
    const existing = latest.get(run.repo);
    if (!existing || Date.parse(run.createdAt) > Date.parse(existing.createdAt)) {
      latest.set(run.repo, run);
    }
  }
  return latest;
}

function daysSince(ms: number): number {
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
