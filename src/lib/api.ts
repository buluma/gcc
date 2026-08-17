export type MergeMethod = "merge" | "squash" | "rebase"

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

export async function mergePullRequest(request: MergePullRequestRequest): Promise<MergePullRequestResponse> {
  const response = await fetch("/api/merge-pr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  const data = await response.json() as MergePullRequestResponse

  if (!response.ok) {
    throw new Error(data.message ?? `Merge failed with status ${response.status}`)
  }

  return data
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
  isMergeable: boolean
  draft: boolean
  mergeableState: string | null
}

export async function fetchPullRequestDetail(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PullRequestDetailResponse> {
  const response = await fetch(`/api/pr-detail/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${pullNumber}`)

  const data = await response.json()

  if (!response.ok) {
    const errorData = data as { message?: string }
    throw new Error(errorData.message ?? `Failed to fetch PR details: ${response.status}`)
  }

  return data as PullRequestDetailResponse
}