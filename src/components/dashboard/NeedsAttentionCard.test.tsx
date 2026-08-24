import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttentionItem } from "@/lib/attention";
import { NeedsAttentionCard } from "./NeedsAttentionCard";

describe("NeedsAttentionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows an empty state when nothing needs attention", () => {
    render(
      <NeedsAttentionCard items={[]} viewerLogin="me" onOpenPRDetail={vi.fn()} />,
    );
    expect(
      screen.getByText("Nothing needs attention right now."),
    ).toBeTruthy();
  });

  it("shows the critical badge and item count", () => {
    render(
      <NeedsAttentionCard
        items={makeItems(1)}
        viewerLogin="me"
        onOpenPRDetail={vi.fn()}
      />,
    );
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("1 critical")).toBeTruthy();
  });

  it("collapses beyond four items with an expand control", () => {
    render(
      <NeedsAttentionCard
        items={makeItems(6)}
        viewerLogin="me"
        onOpenPRDetail={vi.fn()}
      />,
    );
    expect(screen.getByText("Item 0")).toBeTruthy();
    expect(screen.getByText("Item 3")).toBeTruthy();
    expect(screen.queryByText("Item 4")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Item 4")).toBeTruthy();
    expect(screen.getByText("Item 5")).toBeTruthy();
  });

  it("opens the PR dialog for items carrying a pull request number", () => {
    const onOpenPRDetail = vi.fn();
    render(
      <NeedsAttentionCard
        items={[
          {
            id: "review-requested:1",
            kind: "review-requested",
            severity: "warning",
            repo: "me/app",
            title: "Add feature",
            url: "https://github.com/me/app/pull/7",
            updatedAt: "2026-08-24T10:00:00Z",
            detail: "Opened by someone-else",
            number: 7,
          },
        ]}
        viewerLogin="me"
        onOpenPRDetail={onOpenPRDetail}
      />,
    );

    fireEvent.click(screen.getByText("Add feature"));
    expect(onOpenPRDetail).toHaveBeenCalledWith("me", "app", 7);
  });
});

function makeItems(count: number): AttentionItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `failing-ci:repo-${index}`,
    kind: "failing-ci" as const,
    severity: "critical" as const,
    repo: `me/repo-${index}`,
    title: `Item ${index}`,
    url: `https://github.com/me/repo-${index}`,
    updatedAt: "2026-08-24T10:00:00Z",
    detail: "Latest workflow run failed",
  }));
}
