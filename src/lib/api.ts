import type { MergePullRequestRequest, MergePullRequestResponse, PullRequestDetailResponse } from "@/types/github"

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

export async function fetchPullRequestDetail(
  owner: string,
  repo: string,
  pullNumber: number,
  signal?: AbortSignal
): Promise<PullRequestDetailResponse> {
  const response = await fetch(`/api/pr-detail/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${pullNumber}`, { signal })

  const data = await response.json()

  if (!response.ok) {
    const errorData = data as { message?: string }
    throw new Error(errorData.message ?? `Failed to fetch PR details: ${response.status}`)
  }

  return data as PullRequestDetailResponse
}