import { useId, useState } from "react";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CircleDotIcon,
  ClockIcon,
  GitPullRequestIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative, shortRepoName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttentionItem, AttentionKind, AttentionSeverity } from "@/lib/attention";

const KIND_ICON: Record<AttentionKind, typeof GitPullRequestIcon> = {
  "failing-ci": XCircleIcon,
  "review-requested": GitPullRequestIcon,
  "stale-pr": ClockIcon,
  "stale-issue": CircleDotIcon,
};

const SEVERITY_ICON_CLASS: Record<AttentionSeverity, string> = {
  high: "text-status-error",
  medium: "text-status-warning",
  low: "text-muted-foreground",
};

const SEVERITY_BADGE_VARIANT: Record<AttentionSeverity, "destructive" | "outline"> = {
  high: "destructive",
  medium: "outline",
  low: "outline",
};

const COLLAPSED_LIMIT = 4;

export function NeedsAttentionCard({
  items,
  viewerLogin,
  onOpenPRDetail,
}: {
  items: AttentionItem[];
  viewerLogin: string;
  onOpenPRDetail: (owner: string, repo: string, number: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const displayed = expanded ? items : items.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = items.length - displayed.length;
  const highCount = items.filter((item) => item.severity === "high").length;

  return (
    <Card
      id="attention"
      role="region"
      aria-label="Needs attention"
      className="min-h-0 shrink-0 gap-0 rounded-lg py-0 shadow-sm shadow-foreground/[0.02]"
      size="sm"
    >
      <CardHeader
        className={cn(
          "flex p-0 [.border-b]:pb-0",
          !collapsed && "border-b",
        )}
      >
        <button
          type="button"
          aria-label="Needs Attention"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={() => setCollapsed((value) => !value)}
          className="flex min-h-9 w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-left outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        >
          <CardTitle className="flex items-center gap-2 text-[13px] font-semibold leading-none">
            <AlertTriangleIcon
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            Needs Attention
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {items.length}
            </span>
            {highCount > 0 ? (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {highCount} critical
              </Badge>
            ) : null}
          </CardTitle>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 text-muted-foreground", collapsed && "-rotate-90")}
          />
        </button>
      </CardHeader>
      <CardContent id={contentId} hidden={collapsed} className="flex hidden:hidden min-h-0 max-h-56 flex-col gap-0.5 overflow-y-auto px-2 py-1.5 text-xs [scrollbar-gutter:stable]">
        {items.length === 0 ? (
          <div className="rounded-md bg-muted/30 px-2 py-3 text-muted-foreground">
            Nothing needs attention right now.
          </div>
        ) : (
          <>
            {displayed.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const isPr = item.number !== undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (isPr) {
                      const [owner, repo] = item.repo.split("/");
                      onOpenPRDetail(owner, repo, item.number!);
                    } else {
                      window.open(item.url, "_blank", "noopener,noreferrer");
                    }
                  }}
                  title={item.reasons.join(", ")}
                  className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0",
                      SEVERITY_ICON_CLASS[item.severity],
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-4">
                      {item.title}
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                      {shortRepoName(item.repo, viewerLogin)} · {item.detail} ·{" "}
                      {formatRelative(item.updatedAt)}
                    </span>
                    {item.reasons.length > 0 ? (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {item.reasons.map((reason) => (
                          <span
                            key={reason}
                            className="rounded-sm bg-muted px-1 py-px text-[10px] leading-4 text-muted-foreground"
                          >
                            {reason}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <Badge
                    variant={SEVERITY_BADGE_VARIANT[item.severity]}
                    className="h-4 shrink-0 self-start px-1.5 font-mono text-[10px] tabular-nums"
                    title={`Attention score ${item.score}/100`}
                  >
                    {item.score}
                  </Badge>
                </button>
              );
            })}
            {hiddenCount > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                className="w-fit self-start px-1.5 text-xs text-muted-foreground"
                onClick={() => setExpanded(true)}
              >
                Show {hiddenCount} more
              </Button>
            ) : expanded && items.length > COLLAPSED_LIMIT ? (
              <Button
                variant="ghost"
                size="xs"
                className="w-fit self-start px-1.5 text-xs text-muted-foreground"
                onClick={() => setExpanded(false)}
              >
                Show fewer
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
