"use client"

/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react"
import {
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  LoaderIcon,
  FileTextIcon,
  ExternalLinkIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchPullRequestDetail } from "@/lib/api"
import { formatRelative, shortRepoName } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { PullRequestDetailResponse } from "@/lib/api"

interface PRDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  owner: string
  repo: string
  pullNumber: number
  viewerLogin: string
}

export function PRDetailsDialog({
  open,
  onOpenChange,
  owner,
  repo,
  pullNumber,
  viewerLogin,
}: PRDetailsDialogProps) {
  const [detail, setDetail] = useState<PullRequestDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!open) return

    cancelledRef.current = false
    setLoading(true)
    setError(null)
    setDetail(null)

    const loadDetail = async () => {
      try {
        const data = await fetchPullRequestDetail(owner, repo, pullNumber)
        if (!cancelledRef.current) setDetail(data)
      } catch (err) {
        if (!cancelledRef.current) setError(err instanceof Error ? err.message : "Failed to load PR details")
      } finally {
        if (!cancelledRef.current) setLoading(false)
      }
    }

    loadDetail()

    return () => {
      cancelledRef.current = true
    }
  }, [open, owner, repo, pullNumber])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDetail(null)
      setError(null)
      setLoading(false)
    }
  }, [open])

  if (!open) return null

  const repoFullName = `${owner}/${repo}`
  const shortName = shortRepoName(repoFullName, viewerLogin)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh]" style={{ maxWidth: "70vw" }}>
        <DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2">
              <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
              <DialogTitle className="text-lg">Loading PR details...</DialogTitle>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircleIcon className="size-5" />
              <DialogTitle className="text-lg">Failed to load PR details</DialogTitle>
            </div>
          ) : (
            <>
              <DialogTitle className="flex items-center gap-2">
                <GitPullRequestIcon className="size-5 text-muted-foreground" />
                <span className="truncate">#{detail?.number} {detail?.title}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-sm">
                <span className="font-mono">{shortName}</span>
                <span className="text-muted-foreground">·</span>
                <span>{detail?.state === "open" ? "Open" : detail?.state === "closed" ? "Closed" : "Merged"}</span>
                {detail?.isDraft && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Badge variant="secondary" className="gap-1">
                      <GitMergeIcon className="size-3" />
                      Draft
                    </Badge>
                  </>
                )}
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {detail && !loading && !error && (
          <>
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="checks">Checks</TabsTrigger>
                <TabsTrigger value="files">Files ({detail.changedFiles})</TabsTrigger>
                <TabsTrigger value="commits">Commits ({detail.commits})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Base Branch</p>
                    <p className="font-mono text-sm flex items-center gap-1">
                      <GitBranchIcon className="size-3.5" />
                      {detail.baseRef}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Head Branch</p>
                    <p className="font-mono text-sm flex items-center gap-1">
                      <GitBranchIcon className="size-3.5" />
                      {detail.headRef}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Author</p>
                    <p className="font-medium text-sm">{detail.author ?? "Unknown"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</p>
                    <p className="text-sm text-muted-foreground">{formatRelative(detail.createdAt)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Updated</p>
                    <p className="text-sm text-muted-foreground">{formatRelative(detail.updatedAt)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Merge State</p>
                    <p className="flex items-center gap-2">
                      <MergeStatusBadge status={detail.mergeable} state={detail.mergeStateStatus} />
                      <span className="text-sm text-muted-foreground capitalize">
                        {detail.mergeStateStatus?.toLowerCase().replace(/_/g, " ") ?? "Unknown"}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Review Status</p>
                    <p className="flex items-center gap-2">
                      <ReviewDecisionBadge decision={detail.reviewDecision} />
                      <span className="text-sm text-muted-foreground capitalize">
                        {detail.reviewDecision?.toLowerCase().replace(/_/g, " ") ?? "Pending"}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Checks</p>
                    <p className="flex items-center gap-2">
                      <CheckStatusBadge rollup={detail.statusCheckRollup} />
                      <span className="text-sm text-muted-foreground capitalize">
                        {detail.statusCheckRollup?.toLowerCase() ?? "Unknown"}
                      </span>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Changes</p>
                    <p className="flex items-center gap-2 text-sm font-mono">
                      <span className="text-status-success">+{detail.additions}</span>
                      <span className="text-status-error">-{detail.deletions}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{detail.changedFiles} files</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{detail.commits} commits</span>
                    </p>
                  </div>
                </div>

                {detail.baseRepo && detail.baseRepo.fullName !== repoFullName && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Base Repository</p>
                    <p className="font-mono text-sm">{detail.baseRepo.fullName}</p>
                  </div>
                )}

                {detail.headRepo && detail.headRepo.fullName !== repoFullName && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Head Repository</p>
                    <p className="font-mono text-sm">{detail.headRepo.fullName}</p>
                  </div>
                )}

                {detail.body && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</p>
                    <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">{detail.body}</div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="checks" className="mt-4 space-y-4">
                <div className="rounded-md border p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckStatusBadge rollup={detail.statusCheckRollup} size="lg" />
                    <div>
                      <p className="font-medium capitalize">{detail.statusCheckRollup?.toLowerCase() ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground">Overall check status for the pull request</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Detailed check runs and workflow status would be displayed here.
                    This requires additional API calls to fetch individual check runs.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="files" className="mt-4">
                <div className="rounded-md border p-4 text-center text-muted-foreground">
                  <FileTextIcon className="size-12 mx-auto mb-2 opacity-50" />
                  <p>File list and diffs require additional API calls.</p>
                  <p className="text-sm mt-1">Would show changed files with additions/deletions per file.</p>
                </div>
              </TabsContent>

              <TabsContent value="commits" className="mt-4">
                <div className="rounded-md border p-4 text-center text-muted-foreground">
                  <GitCommitHorizontalIcon className="size-12 mx-auto mb-2 opacity-50" />
                  <p>Commit list requires additional API calls.</p>
                  <p className="text-sm mt-1">Would show {detail.commits} commits in this PR.</p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogFooter>
          {detail && !loading && !error && (
            <>
              <Button variant="outline" asChild>
                <a href={detail.url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="mr-2 size-4" />
                  View on GitHub
                </a>
              </Button>
              {detail.isMergeable && detail.state === "open" && !detail.isDraft && (
                <Button
                  onClick={async () => {
                    if (!window.confirm(`Merge #${detail.number} (${shortName}) via squash?`)) return
                    try {
                      const { mergePullRequest } = await import("@/lib/api")
                      await mergePullRequest({ owner, repo, pullNumber: detail.number, mergeMethod: "squash" })
                      window.location.reload()
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "Merge failed")
                    }
                  }}
                >
                  <GitMergeIcon className="mr-2 size-4" />
                  Merge (Squash)
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MergeStatusBadge({
  status,
  state,
  size = "sm",
}: {
  status: PullRequestDetailResponse["mergeable"]
  state: PullRequestDetailResponse["mergeStateStatus"]
  size?: "sm" | "lg"
}) {
  const isLg = size === "lg"

  if (status === "MERGEABLE" && state === "CLEAN") {
    return (
      <CheckCircleIcon
        className={cn("text-status-success", isLg ? "size-5" : "size-4")}
        aria-hidden="true"
      />
    )
  }
  if (status === "CONFLICTING" || state === "DIRTY" || state === "BLOCKED") {
    return (
      <XCircleIcon
        className={cn("text-status-error", isLg ? "size-5" : "size-4")}
        aria-hidden="true"
      />
    )
  }
  return (
    <AlertCircleIcon
      className={cn("text-status-warning", isLg ? "size-5" : "size-4")}
      aria-hidden="true"
    />
  )
}

function ReviewDecisionBadge({
  decision,
}: {
  decision: PullRequestDetailResponse["reviewDecision"]
}) {
  if (decision === "APPROVED") {
    return <CheckCircleIcon className="size-4 text-status-success" aria-hidden="true" />
  }
  if (decision === "CHANGES_REQUESTED") {
    return <XCircleIcon className="size-4 text-status-error" aria-hidden="true" />
  }
  if (decision === "REVIEW_REQUIRED") {
    return <AlertCircleIcon className="size-4 text-status-warning" aria-hidden="true" />
  }
  return <AlertCircleIcon className="size-4 text-muted-foreground" aria-hidden="true" />
}

function CheckStatusBadge({
  rollup,
  size = "sm",
}: {
  rollup: string | null
  size?: "sm" | "lg"
}) {
  const isLg = size === "lg"

  if (!rollup) {
    return <AlertCircleIcon className={cn("text-muted-foreground", isLg ? "size-5" : "size-4")} aria-hidden="true" />
  }

  const state = rollup.toLowerCase()
  if (state === "success" || state === "completed") {
    return <CheckCircleIcon className={cn("text-status-success", isLg ? "size-5" : "size-4")} aria-hidden="true" />
  }
  if (state === "failure" || state === "error" || state === "failed") {
    return <XCircleIcon className={cn("text-status-error", isLg ? "size-5" : "size-4")} aria-hidden="true" />
  }
  if (state === "pending" || state === "in_progress" || state === "running" || state === "queued" || state === "requested") {
    return <LoaderIcon className={cn("text-status-info animate-spin", isLg ? "size-5" : "size-4")} aria-hidden="true" />
  }
  return <AlertCircleIcon className={cn("text-muted-foreground", isLg ? "size-5" : "size-4")} aria-hidden="true" />
}