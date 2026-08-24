import { classifyGithubStatus } from "@/lib/github-status";
import type { WorkflowRunSummary } from "@/types/github";

// Per-repository CI health, aware of multiple workflows rather than just the
// single most recent run. Built entirely from the WorkflowRunSummary[] the
// dashboard already fetches (github-dashboard.ts requests a bounded window
// of recent runs per repo — currently the 3 most recent). No new GitHub API
// calls; this is client-side aggregation of data already on hand.
//
// Because the fetch window is bounded, "failure count" and "recent runs"
// below only ever reflect that window, not full history — this is the
// "where available"/"where practical" limitation the multi-workflow view
// operates under.

type WorkflowHealth = {
  name: string;
  latestStatus: "success" | "failure" | "running" | "none";
  /** Runs observed for this workflow within the fetched window. */
  recentRuns: number;
  /** How many of those observed runs failed. */
  failureCount: number;
  latestRunUrl: string;
  latestRunAt: string;
};

export type RepoCiHealth = {
  repo: string;
  workflows: WorkflowHealth[];
  /**
   * "failing": at least one workflow's latest run failed.
   * "degraded": nothing is currently failing, but a failure was observed in
   *   the fetch window (flaky/recently recovered).
   * "healthy": every observed workflow is currently passing.
   * "unknown": no resolved (success/failure) runs observed at all.
   */
  overall: "healthy" | "degraded" | "failing" | "unknown";
};

export function computeRepoCiHealth(
  repo: string,
  runs: WorkflowRunSummary[],
): RepoCiHealth {
  const byWorkflow = new Map<string, WorkflowRunSummary[]>();
  for (const run of runs) {
    if (run.repo !== repo) continue;
    const list = byWorkflow.get(run.name) ?? [];
    list.push(run);
    byWorkflow.set(run.name, list);
  }

  const workflows: WorkflowHealth[] = [...byWorkflow.entries()]
    .map(([name, workflowRuns]) => {
      const sorted = [...workflowRuns].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      const latest = sorted[0];
      const failureCount = sorted.filter(
        (run) => classifyGithubStatus(run.conclusion ?? run.status).rollup === "failure",
      ).length;

      return {
        name,
        latestStatus: classifyGithubStatus(latest.conclusion ?? latest.status).rollup,
        recentRuns: sorted.length,
        failureCount,
        latestRunUrl: latest.url,
        latestRunAt: latest.createdAt,
      };
    })
    .sort((a, b) => Date.parse(b.latestRunAt) - Date.parse(a.latestRunAt));

  const overall = summarizeOverallHealth(workflows);

  return { repo, workflows, overall };
}

export function computeCiHealthByRepo(
  runs: WorkflowRunSummary[],
): Map<string, RepoCiHealth> {
  const repos = new Set(runs.map((run) => run.repo));
  const health = new Map<string, RepoCiHealth>();
  for (const repo of repos) {
    health.set(repo, computeRepoCiHealth(repo, runs));
  }
  return health;
}

function summarizeOverallHealth(
  workflows: WorkflowHealth[],
): RepoCiHealth["overall"] {
  if (workflows.length === 0) return "unknown";
  if (workflows.some((workflow) => workflow.latestStatus === "failure")) return "failing";
  if (workflows.some((workflow) => workflow.failureCount > 0)) return "degraded";
  if (workflows.every((workflow) => workflow.latestStatus === "success")) return "healthy";
  return "unknown";
}
