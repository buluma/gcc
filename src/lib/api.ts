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