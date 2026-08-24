// Deterministic 0-100 "how much does this need eyes on it" score.
//
// This is a fixed point rubric over explicit boolean/numeric signals — no
// AI, no semantic code understanding. Every point is traceable to a named
// reason so the score is always explainable to the person looking at it.
//
// Point table (each signal applies independently; total capped at 100):
//   CI failing on the item's repo/PR ............... +45  "CI failing"
//   Review actually requested from the viewer ....... +30  "Review requested"
//   Security-sensitive change or label/keyword ...... +20  "Security-related change"
//   Production/infrastructure impact detected ....... +15  "Production/infrastructure impact"
//   Stale beyond its own threshold: +10, plus +1 per
//     day overdue, capped at +20 from staleness alone . "Stale Nd+"
//   Recent activity (last 6h) ........................ +5   "Recently updated"
//
// Severity bands: high >= 75, medium >= 45, low otherwise.

export type AttentionScoreSeverity = "low" | "medium" | "high";

export type AttentionScoreResult = {
  score: number;
  severity: AttentionScoreSeverity;
  reasons: string[];
};

export type AttentionScoreInput = {
  ciFailing: boolean;
  reviewRequested: boolean;
  securitySensitive: boolean;
  infrastructureSensitive: boolean;
  /** Whole days past the item's own staleness threshold, or null if not stale. */
  staleOverdueDays: number | null;
  recentActivity: boolean;
};

const CI_FAILING_POINTS = 45;
const REVIEW_REQUESTED_POINTS = 30;
const SECURITY_POINTS = 20;
const INFRASTRUCTURE_POINTS = 15;
const STALE_BASE_POINTS = 10;
const STALE_MAX_POINTS = 20;
const RECENT_ACTIVITY_POINTS = 5;

const SEVERITY_HIGH_THRESHOLD = 75;
const SEVERITY_MEDIUM_THRESHOLD = 45;

export function computeAttentionScore(
  input: AttentionScoreInput,
): AttentionScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (input.ciFailing) {
    score += CI_FAILING_POINTS;
    reasons.push("CI failing");
  }

  if (input.reviewRequested) {
    score += REVIEW_REQUESTED_POINTS;
    reasons.push("Review requested");
  }

  if (input.securitySensitive) {
    score += SECURITY_POINTS;
    reasons.push("Security-related change");
  }

  if (input.infrastructureSensitive) {
    score += INFRASTRUCTURE_POINTS;
    reasons.push("Production/infrastructure impact");
  }

  if (input.staleOverdueDays !== null) {
    const staleBonus = Math.min(
      STALE_MAX_POINTS,
      STALE_BASE_POINTS + Math.max(0, input.staleOverdueDays),
    );
    score += staleBonus;
    const days = input.staleOverdueDays + 1;
    reasons.push(`Stale ${days}+ day${days === 1 ? "" : "s"}`);
  }

  if (input.recentActivity) {
    score += RECENT_ACTIVITY_POINTS;
    reasons.push("Recently updated");
  }

  score = Math.min(100, score);

  const severity: AttentionScoreSeverity =
    score >= SEVERITY_HIGH_THRESHOLD
      ? "high"
      : score >= SEVERITY_MEDIUM_THRESHOLD
        ? "medium"
        : "low";

  return { score, severity, reasons };
}

// Deterministic keyword heuristics used where we don't have a real file diff
// to inspect (e.g. the dashboard's PR/issue list, which only carries title +
// up to 3 labels). This is pattern matching over text, not code analysis —
// see src/lib/change-intelligence.ts for the file-path-based version used
// where an actual diff is available (the PR detail view).
const SECURITY_KEYWORDS =
  /\b(security|vulnerab(?:le|ility)|cve|exploit|auth(?:entication|orization)?|secret|credential|encrypt|xss|csrf|injection|rbac)\b/i;
const INFRASTRUCTURE_KEYWORDS =
  /\b(infra(?:structure)?|deploy(?:ment)?|production|prod|terraform|kubernetes|k8s|docker|helm|pipeline|release|outage|incident)\b/i;

export function matchesSecurityKeywords(text: {
  title: string;
  labels: string[];
}): boolean {
  return matchesKeywords(text, SECURITY_KEYWORDS);
}

export function matchesInfrastructureKeywords(text: {
  title: string;
  labels: string[];
}): boolean {
  return matchesKeywords(text, INFRASTRUCTURE_KEYWORDS);
}

function matchesKeywords(
  text: { title: string; labels: string[] },
  pattern: RegExp,
): boolean {
  return (
    pattern.test(text.title) || text.labels.some((label) => pattern.test(label))
  );
}
