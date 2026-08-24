import type { PullRequestDetailResponse } from "@/lib/api";

// Client-side engineering summary for a pull request: a quick "should I
// worry about this before merging" read, derived from data the PR detail
// endpoint already returns. No extra requests.

export type RiskLevel = "low" | "medium" | "high";

type RiskFactor = {
  label: string;
  detail: string;
};

export type EngineeringSummary = {
  level: RiskLevel;
  headline: string;
  sizeLabel: string;
  factors: RiskFactor[];
};

const SIZE_THRESHOLDS = { small: 50, medium: 300, large: 1000 };
const STALE_OPEN_PR_MS = 5 * 24 * 60 * 60 * 1000;

export function computeEngineeringSummary(
  pr: PullRequestDetailResponse,
  now = Date.now(),
): EngineeringSummary {
  const changedLines = pr.additions + pr.deletions;
  const sizeLabel = sizeLabelFor(changedLines);
  const factors: RiskFactor[] = [];
  let score = 0;

  if (changedLines > SIZE_THRESHOLDS.large) {
    score += 2;
    factors.push({
      label: "Large diff",
      detail: `${changedLines} lines across ${pr.changedFiles} files`,
    });
  } else if (changedLines > SIZE_THRESHOLDS.medium) {
    score += 1;
    factors.push({
      label: "Sizable diff",
      detail: `${changedLines} lines across ${pr.changedFiles} files`,
    });
  }

  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") {
    score += 2;
    factors.push({
      label: "Merge conflicts",
      detail: "This branch conflicts with its base branch.",
    });
  } else if (pr.mergeStateStatus === "BLOCKED") {
    score += 1;
    factors.push({
      label: "Merge blocked",
      detail: "Branch protection rules are blocking merge.",
    });
  }

  const checkState = pr.statusCheckRollup?.toLowerCase() ?? null;
  if (checkState === "failure" || checkState === "error") {
    score += 2;
    factors.push({
      label: "Checks failing",
      detail: "One or more required checks are failing.",
    });
  } else if (!checkState) {
    factors.push({
      label: "No checks reported",
      detail: "No CI status is attached to this pull request.",
    });
  }

  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    score += 1;
    factors.push({
      label: "Changes requested",
      detail: "A reviewer asked for changes.",
    });
  } else if (pr.reviewDecision === null || pr.reviewDecision === "REVIEW_REQUIRED") {
    factors.push({
      label: "Awaiting review",
      detail: "No approving review yet.",
    });
  }

  if (!pr.isDraft && pr.state === "open") {
    const ageMs = now - Date.parse(pr.createdAt);
    if (ageMs > STALE_OPEN_PR_MS) {
      score += 1;
      factors.push({
        label: "Open a while",
        detail: `Opened ${Math.floor(ageMs / 86_400_000)} days ago and still unmerged.`,
      });
    }
  }

  const level: RiskLevel = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  return {
    level,
    sizeLabel,
    factors,
    headline: headlineFor(level, sizeLabel, pr),
  };
}

function sizeLabelFor(changedLines: number): string {
  if (changedLines <= SIZE_THRESHOLDS.small) return "Small";
  if (changedLines <= SIZE_THRESHOLDS.medium) return "Medium";
  if (changedLines <= SIZE_THRESHOLDS.large) return "Large";
  return "Very large";
}

function headlineFor(
  level: RiskLevel,
  sizeLabel: string,
  pr: PullRequestDetailResponse,
): string {
  if (level === "high")
    return `${sizeLabel} change with multiple open risks before this should merge.`;
  if (level === "medium")
    return `${sizeLabel} change with a few things worth checking before merge.`;
  if (pr.mergeStateStatus === "CLEAN" && pr.reviewDecision === "APPROVED")
    return `${sizeLabel} change, approved, and clean to merge.`;
  return `${sizeLabel} change with no major risk factors detected.`;
}
