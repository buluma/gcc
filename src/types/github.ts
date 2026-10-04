export const GITHUB_LOGIN_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export type DashboardWarning = {
  area: string;
  message: string;
  fix?: string;
};

export type Viewer = {
  login: string;
  name: string | null;
  avatarUrl: string;
  profileUrl: string;
};

export type RepoSummary = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  url: string;
  language: string | null;
  visibility: "public" | "private" | "internal";
  isPrivate: boolean;
  isFork: boolean;
  isArchived: boolean;
  stars: number;
  forks: number;
  sizeKb: number;
  defaultBranch: string | null;
  pushedAt: string | null;
  updatedAt: string | null;
  openIssues: number | null;
  openPullRequests: number | null;
  checkState: string | null;
  latestCommit: CommitSummary | null;
  latestRun: WorkflowRunSummary | null;
};

export type CommitSummary = {
  repo: string;
  sha: string;
  shortSha: string;
  message: string;
  author: string | null;
  date: string;
  url: string;
};

export type IssueSummary = {
  id: number;
  number: number;
  repo: string;
  title: string;
  state: string;
  url: string;
  updatedAt: string;
  createdAt: string;
  author: string | null;
  labels: string[];
  isPullRequest: boolean;
  isDraft?: boolean;
  /**
   * True only when GitHub's `review-requested:@me` search qualifier confirms
   * the current viewer (directly or via a team they belong to) has a pending
   * review request on this pull request. Undefined for issues and for pull
   * requests fetched in a context with no authenticated viewer (public mode).
   */
  reviewRequested?: boolean;
};

export type WorkflowRunSummary = {
  id: number;
  repo: string;
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
  runStartedAt: string | null;
  durationSeconds: number | null;
  url: string;
};

export type BillingSkuSummary = {
  sku: string;
  quantity: number;
  unitType: string | null;
  grossAmount: number;
  netAmount: number;
};

export type BillingUnitSummary = {
  unitType: string;
  quantity: number;
};

export type BillingRepoSummary = {
  repo: string;
  quantity: number;
  grossAmount: number;
  netAmount: number;
};

export type BillingSummary = {
  available: boolean;
  year: number;
  month: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  unitTotals: BillingUnitSummary[];
  skus: BillingSkuSummary[];
  repositories: BillingRepoSummary[];
  message?: string;
  fix?: string;
};

export type DashboardPayload = {
  generatedAt: string;
  detailLevel: "quick" | "full";
  scanLimit: number;
  viewer: Viewer;
  repos: RepoSummary[];
  recentCommits: CommitSummary[];
  pullRequests: IssueSummary[];
  issues: IssueSummary[];
  ciRuns: WorkflowRunSummary[];
  billing: BillingSummary;
  warnings: DashboardWarning[];
};

type MergeMethod = "merge" | "squash" | "rebase"

export interface MergePullRequestRequest {
  owner: string
  repo: string
  pullNumber: number
  mergeMethod?: MergeMethod
}

export interface MergePullRequestResponse {
  success: boolean
  merged: boolean
  message: string
  sha?: string
}

export interface PullRequestDetailResponse {
  id: number
  number: number
  repo: string
  title: string
  state: string
  url: string
  updatedAt: string
  createdAt: string
  author: string | null
  labels: string[]
  isPullRequest: boolean
  isDraft: boolean
  baseRef: string
  headRef: string
  baseRepo: { name: string; fullName: string; owner: string } | null
  headRepo: { name: string; fullName: string; owner: string } | null
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null
  mergeStateStatus: "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "DRAFT" | "HAS_HOOKS" | "UNKNOWN" | null
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  statusCheckRollup: string | null
  additions: number
  deletions: number
  changedFiles: number
  commits: number
  body: string | null
  files: Array<{ path: string; additions: number; deletions: number }>
  filesTruncated: boolean
  reviewRequestedLogins: string[]
  reviewRequestedTeams: Array<{ name: string; viewerIsMember: boolean }>
  reviewRequestsTruncated: boolean
}

export type RuntimeCapabilities = {
  privateDashboard: "local" | "oauth" | null;
};
