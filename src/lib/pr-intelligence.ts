import {
  computeAttentionScore,
  matchesInfrastructureKeywords,
  matchesSecurityKeywords,
  type AttentionScoreResult,
} from "@/lib/attention-score";
import {
  computeChangeProfile,
  type ChangeProfile,
} from "@/lib/change-intelligence";
import { classifyGithubStatus } from "@/lib/github-status";
import type { PullRequestDetailResponse } from "@/types/github";

// Composes the deterministic attention score and change profile for a
// single pull request's detail view (the "Intelligence" tab). Unlike the
// dashboard-list version in src/lib/attention.ts, this has the real diff
// (files/additions/deletions) and the real review-request list, so the
// security/infrastructure signals come from actual changed files rather
// than title/label keyword matching.

const STALE_OPEN_PR_MS = 5 * 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY_MS = 6 * 60 * 60 * 1000;

export type PrIntelligence = {
  attention: AttentionScoreResult;
  changeProfile: ChangeProfile;
  reviewRequestedForViewer: boolean;
  recommendation: string;
};

export function computePrIntelligence(
  detail: PullRequestDetailResponse,
  viewerLogin: string,
  now = Date.now(),
): PrIntelligence {
  const changeProfile = computeChangeProfile({
    files: detail.files,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFiles: detail.changedFiles,
    filesTruncated: detail.filesTruncated,
  });

  const ciFailing = isFailingCheckState(detail.statusCheckRollup);
  const reviewRequestedForViewer =
    detail.reviewRequestedLogins.includes(viewerLogin) ||
    detail.reviewRequestedTeams.some((team) => team.viewerIsMember);

  const ageMs = now - Date.parse(detail.updatedAt);
  const staleOverdueDays =
    !detail.isDraft && detail.state === "open" && ageMs > STALE_OPEN_PR_MS
      ? Math.floor((ageMs - STALE_OPEN_PR_MS) / (24 * 60 * 60 * 1000))
      : null;

  const attention = computeAttentionScore({
    ciFailing,
    reviewRequested: reviewRequestedForViewer,
    securitySensitive:
      changeProfile.areas.includes("security") ||
      matchesSecurityKeywords({ title: detail.title, labels: detail.labels }),
    infrastructureSensitive:
      changeProfile.areas.includes("infrastructure") ||
      matchesInfrastructureKeywords({ title: detail.title, labels: detail.labels }),
    staleOverdueDays,
    recentActivity: ageMs <= RECENT_ACTIVITY_MS,
  });

  const recommendation = computeRecommendation(detail, changeProfile, ciFailing);

  return { attention, changeProfile, reviewRequestedForViewer, recommendation };
}

function isFailingCheckState(rollup: string | null): boolean {
  return rollup !== null && classifyGithubStatus(rollup).rollup === "failure";
}

/**
 * A short, deterministic next step. Priority order, first match wins — no
 * AI, just the same signals already shown on the tab read in a fixed order.
 */
function computeRecommendation(
  detail: PullRequestDetailResponse,
  changeProfile: ChangeProfile,
  ciFailing: boolean,
): string {
  if (detail.state !== "open") {
    return `No action needed — this pull request is already ${detail.state}.`;
  }
  if (detail.isDraft) {
    return "Still a draft — no action needed until it's marked ready for review.";
  }
  if (ciFailing) {
    return "Fix the failing checks before requesting or continuing review.";
  }
  if (detail.mergeable === "CONFLICTING" || detail.mergeStateStatus === "DIRTY") {
    return "Resolve merge conflicts before this can be reviewed or merged.";
  }
  if (changeProfile.risk === "high") {
    return "High structural risk — make sure it gets a thorough review before merging.";
  }
  if (detail.reviewDecision === "CHANGES_REQUESTED") {
    return "Address the requested changes.";
  }
  if (detail.reviewDecision === null || detail.reviewDecision === "REVIEW_REQUIRED") {
    return "Awaiting review — no action until a reviewer responds.";
  }
  if (detail.reviewDecision === "APPROVED" && detail.mergeStateStatus === "CLEAN") {
    return "Approved and clean — ready to merge.";
  }
  return "No immediate action required.";
}
