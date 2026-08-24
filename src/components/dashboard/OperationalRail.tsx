import { useState } from "react"
import {
  AlertTriangleIcon,
  CircleDollarSignIcon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  CircleDotIcon,
  PlayIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatBillingQuantity, formatDuration, formatMoney, formatMonth, formatNumber, formatRelative, shortRepoName } from "@/lib/format"
import { isGithubStatusFailure } from "@/lib/github-status"
import { computeCiHealth, type ActivityEvent, type ActivityEventKind } from "@/lib/attention"
import { cn } from "@/lib/utils"
import type { BillingSummary, DashboardWarning, WorkflowRunSummary } from "@/types/github"
import { StatusBadge } from "./StatusBadge"

export function OperationalRail({
  billing,
  isUpdating,
  runs,
  warnings,
  viewerLogin,
  dismissedRunIds,
  onDismissRun,
  onRestoreRuns,
  activity,
}: {
  billing: BillingSummary
  isUpdating: boolean
  runs: WorkflowRunSummary[]
  warnings: DashboardWarning[]
  viewerLogin: string
  dismissedRunIds: Set<number>
  onDismissRun: (id: number) => void
  onRestoreRuns: () => void
  activity: ActivityEvent[]
}) {
  const failingRuns = runs.filter((run) => isGithubStatusFailure(run.conclusion ?? run.status))
  const ciHealth = computeCiHealth(runs)

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
      <WarningPanel warnings={warnings} />
      <CiCard
        runs={failingRuns}
        health={ciHealth}
        isUpdating={isUpdating}
        viewerLogin={viewerLogin}
        dismissedRunIds={dismissedRunIds}
        onDismissRun={onDismissRun}
        onRestoreRuns={onRestoreRuns}
      />
      <BillingCard billing={billing} />
      <ActivityStreamCard events={activity} isUpdating={isUpdating} viewerLogin={viewerLogin} />
    </aside>
  )
}


function WarningPanel({ warnings }: { warnings: DashboardWarning[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [expanded, setExpanded] = useState(false)
  const visible = warnings.filter((warning) => !dismissed.has(warningKey(warning)))
  const displayed = expanded ? visible : visible.slice(0, 3)
  const overflowCount = Math.max(0, visible.length - 3)
  const hiddenCount = Math.max(0, visible.length - displayed.length)

  if (visible.length === 0) return null

  return (
    <Alert>
      <AlertTriangleIcon aria-hidden="true" />
      <AlertTitle>Partial data</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          {displayed.map((warning) => (
            <div key={warningKey(warning)} className="group relative pr-6">
              <span className="font-medium">{warning.area}: </span>
              <span>{warning.message}</span>
              {warning.fix ? <code className="mt-1 block rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">{warning.fix}</code> : null}
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-0 right-0 text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed((current) => new Set(current).add(warningKey(warning)))}
              >
                <XIcon className="size-3" aria-hidden="true" />
                <span className="sr-only">Dismiss {warning.area} warning</span>
              </Button>
            </div>
          ))}
          {overflowCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              className="w-fit self-start px-1.5 text-xs text-muted-foreground"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded
                ? "Show fewer warnings"
                : `Show ${hiddenCount} more ${hiddenCount === 1 ? "warning" : "warnings"}`}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  )
}

function warningKey(warning: DashboardWarning) {
  return `${warning.area}:${warning.message}`
}

function billingUnitLabel(unitType: string | null): string {
  if (unitType === "Minutes") return "Runner minutes"
  if (unitType === "GigabyteHours") return "Storage GB-hours"
  return unitType ?? "Units"
}

function BillingCard({ billing }: { billing: BillingSummary }) {
  const coveredPercent = billing.grossAmount > 0
    ? Math.min(100, (billing.discountAmount / billing.grossAmount) * 100)
    : 0

  return (
    <Card id="costs" className="min-h-0 shrink-0 gap-0 rounded-lg py-0 shadow-sm shadow-foreground/[0.02] lg:max-h-[34vh]" size="sm">
      <CardHeader className="min-h-9 border-b px-3 py-1.5 [.border-b]:pb-1.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[13px] font-semibold leading-none">GitHub Actions Billing</CardTitle>
            <CardDescription className="text-xs">{formatMonth(billing.year, billing.month)}</CardDescription>
          </div>
          <CircleDollarSignIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-2.5 overflow-y-auto px-2 py-2 [scrollbar-gutter:stable]">
        {billing.available ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-xl leading-none tabular-nums">{formatMoney(billing.netAmount)}</span>
                <span className="text-xs text-muted-foreground">billed</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{formatMoney(billing.grossAmount)}</span> gross
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Progress value={coveredPercent} />
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>Covered by plan</span>
                <span className="font-mono tabular-nums">{formatMoney(billing.discountAmount)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 border-t pt-2 text-xs">
              {billing.unitTotals.map((unit) => (
                <div key={unit.unitType} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{billingUnitLabel(unit.unitType)}</span>
                  <span className="font-mono whitespace-nowrap tabular-nums">{formatNumber(unit.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 border-t pt-2 text-xs">
              {billing.skus.slice(0, 3).map((sku) => (
                <div key={sku.sku} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">{sku.sku}</span>
                  <span className="font-mono whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">{formatBillingQuantity(sku.quantity, sku.unitType)}</span>
                  <span className="font-mono whitespace-nowrap tabular-nums">{formatMoney(sku.grossAmount)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Badge variant="outline" className="w-fit text-muted-foreground">billing blocked</Badge>
            <p className="text-sm text-muted-foreground">{billing.message ?? "GitHub billing usage is unavailable."}</p>
            {billing.fix ? <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{billing.fix}</code> : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CiCard({
  runs,
  health,
  isUpdating,
  viewerLogin,
  dismissedRunIds,
  onDismissRun,
  onRestoreRuns,
}: {
  runs: WorkflowRunSummary[]
  health: ReturnType<typeof computeCiHealth>
  isUpdating: boolean
  viewerLogin: string
  dismissedRunIds: Set<number>
  onDismissRun: (id: number) => void
  onRestoreRuns: () => void
}) {
  const visibleRuns = runs.filter((run) => !dismissedRunIds.has(run.id))
  const hiddenCount = runs.length - visibleRuns.length

  return (
    <Card id="ci" className="min-h-0 shrink-0 gap-0 rounded-lg py-0 shadow-sm shadow-foreground/[0.02] lg:max-h-[34vh]" size="sm">
      <CardHeader className="min-h-9 border-b px-3 py-1.5 [.border-b]:pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-[13px] font-semibold leading-none">Workflow Failures</CardTitle>
            <CardDescription className="text-xs">
              {isUpdating
                ? "Workflow details updating"
                : visibleRuns.length
                  ? `${visibleRuns.length} recent non-green runs`
                  : hiddenCount
                    ? "All failures dismissed"
                    : "No failing runs in scanned repos"}
            </CardDescription>
          </div>
          {hiddenCount > 0 && !isUpdating ? (
            <Button variant="ghost" size="xs" className="shrink-0 text-muted-foreground" onClick={onRestoreRuns}>
              Show {hiddenCount} hidden
            </Button>
          ) : null}
        </div>
        {!isUpdating && health.total > 0 ? <CiHealthStrip health={health} /> : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2 py-2 [scrollbar-gutter:stable]">
        {isUpdating ? (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-2 text-sm text-muted-foreground">
            <ShieldAlertIcon className="size-4" aria-hidden="true" />
            Pulling workflow runs in the background.
          </div>
        ) : visibleRuns.length ? (
          visibleRuns.slice(0, 4).map((run) => (
            <div key={run.id} className="group relative">
              <a href={run.url} target="_blank" rel="noreferrer" className="flex flex-col gap-0.5 rounded-md px-1.5 py-1 pr-7 outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{run.name}</span>
                  {isGithubStatusFailure(run.conclusion ?? run.status) ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-destructive" role="img" aria-label="failing" />
                  ) : (
                    <StatusBadge state={run.conclusion ?? run.status} />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{shortRepoName(run.repo, viewerLogin)} · {formatDuration(run.durationSeconds)}</span>
                  <span className="inline-flex items-center gap-1">
                    {formatRelative(run.createdAt)}
                    <ExternalLinkIcon className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  </span>
                </div>
              </a>
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                onClick={() => onDismissRun(run.id)}
              >
                <XIcon className="size-3" aria-hidden="true" />
                <span className="sr-only">Dismiss {run.name} failure</span>
              </Button>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-2 text-sm text-muted-foreground">
            <ShieldAlertIcon className="size-4" aria-hidden="true" />
            {hiddenCount ? "Dismissed failures are hidden." : "Latest scanned workflows are green or unavailable."}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CiHealthStrip({ health }: { health: ReturnType<typeof computeCiHealth> }) {
  return (
    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-status-success" aria-hidden="true" />
        {health.passing} passing
      </span>
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
        {health.failing} failing
      </span>
      {health.running > 0 ? (
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-status-info" aria-hidden="true" />
          {health.running} running
        </span>
      ) : null}
      {health.passRate != null ? (
        <span className="ml-auto font-mono tabular-nums">{Math.round(health.passRate)}%</span>
      ) : null}
    </div>
  )
}

const ACTIVITY_KIND_ICON: Record<ActivityEventKind, typeof GitCommitHorizontalIcon> = {
  commit: GitCommitHorizontalIcon,
  pull_request: GitPullRequestIcon,
  issue: CircleDotIcon,
  ci_run: PlayIcon,
}

function ActivityStreamCard({
  events,
  isUpdating,
  viewerLogin,
}: {
  events: ActivityEvent[]
  isUpdating: boolean
  viewerLogin: string
}) {
  return (
    <Card id="activity" role="region" aria-label="Activity" className="min-h-0 shrink-0 gap-0 rounded-lg py-0 shadow-sm shadow-foreground/[0.02] lg:max-h-[34vh]" size="sm">
      <CardHeader className="min-h-9 border-b px-3 py-1.5 [.border-b]:pb-1.5">
        <CardTitle className="text-[13px] font-semibold leading-none">Activity</CardTitle>
        <CardDescription className="text-xs">
          {isUpdating ? "Activity updating" : "Commits, pull requests, issues, and CI, most recent first"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-1.5 text-xs [scrollbar-gutter:stable]">
        {isUpdating && events.length === 0 ? (
          <div className="rounded-md bg-muted/30 px-2 py-3 text-muted-foreground">Updating details...</div>
        ) : events.length === 0 ? (
          <div className="rounded-md bg-muted/30 px-2 py-3 text-muted-foreground">No recent activity.</div>
        ) : (
          events.map((event) => {
            const Icon = ACTIVITY_KIND_ICON[event.kind]
            return (
              <a
                key={event.id}
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "grid grid-cols-[auto_1fr] items-start gap-2 rounded-md px-1.5 py-1.5 outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                )}
              >
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-medium leading-4">{event.title}</span>
                  <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                    {shortRepoName(event.repo, viewerLogin)} · {event.meta} · {formatRelative(event.timestamp)}
                  </span>
                </span>
              </a>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
