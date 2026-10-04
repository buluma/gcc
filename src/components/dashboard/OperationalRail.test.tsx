import type { ComponentProps } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { BillingSummary, DashboardWarning } from "@/types/github"
import { OperationalRail } from "./OperationalRail"

describe("OperationalRail", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders three warnings with no overflow disclosure", () => {
    renderOperationalRail(makeWarnings(3))

    expect(screen.getByText("Warning message 1")).toBeTruthy()
    expect(screen.getByText("Warning message 2")).toBeTruthy()
    expect(screen.getByText("Warning message 3")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /show \d+ more warnings?/i })).toBeNull()
  })

  it("renders the first three warnings plus an overflow disclosure", () => {
    renderOperationalRail(makeWarnings(5))

    expect(screen.getByText("Warning message 1")).toBeTruthy()
    expect(screen.getByText("Warning message 2")).toBeTruthy()
    expect(screen.getByText("Warning message 3")).toBeTruthy()
    expect(screen.queryByText("Warning message 4")).toBeNull()
    expect(screen.queryByText("Warning message 5")).toBeNull()
    expect(screen.getByRole("button", { name: "Show 2 more warnings" })).toBeTruthy()
  })

  it("expands to reveal all hidden warnings", () => {
    renderOperationalRail(makeWarnings(5))

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more warnings" }))

    expect(screen.getByText("Warning message 1")).toBeTruthy()
    expect(screen.getByText("Warning message 2")).toBeTruthy()
    expect(screen.getByText("Warning message 3")).toBeTruthy()
    expect(screen.getByText("Warning message 4")).toBeTruthy()
    expect(screen.getByText("Warning message 5")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Show fewer warnings" })).toBeTruthy()
  })

  it("updates the visible warning list and overflow count when dismissing", () => {
    renderOperationalRail(makeWarnings(5))

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Area 1 warning" }))

    expect(screen.queryByText("Warning message 1")).toBeNull()
    expect(screen.getByText("Warning message 2")).toBeTruthy()
    expect(screen.getByText("Warning message 3")).toBeTruthy()
    expect(screen.getByText("Warning message 4")).toBeTruthy()
    expect(screen.queryByText("Warning message 5")).toBeNull()
    expect(screen.getByRole("button", { name: "Show 1 more warning" })).toBeTruthy()
  })

  it("hides the warning panel when every warning is dismissed", () => {
    renderOperationalRail(makeWarnings(1))

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Area 1 warning" }))

    expect(screen.queryByText("Partial data")).toBeNull()
  })
})

function renderOperationalRail(warnings: DashboardWarning[], overrides: Partial<ComponentProps<typeof OperationalRail>> = {}) {
  return render(
    <OperationalRail
      detailLevel="full"
      scannedCount={24}
      totalCount={87}
      billing={billing}
      isUpdating={false}
      runs={[]}
      warnings={warnings}
      viewerLogin="buluma"
      dismissedRunIds={new Set()}
      onDismissRun={() => {}}
      onRestoreRuns={() => {}}
      activity={[]}
      {...overrides}
    />
  )
}

function makeWarnings(count: number): DashboardWarning[] {
  return Array.from({ length: count }, (_, index) => ({
    area: `Area ${index + 1}`,
    message: `Warning message ${index + 1}`,
  }))
}

const billing: BillingSummary = {
  available: true,
  year: 2026,
  month: 6,
  grossAmount: 0,
  discountAmount: 0,
  netAmount: 0,
  unitTotals: [],
  skus: [],
  repositories: [],
}


describe("operational rail loading", () => {
  afterEach(cleanup);
  it("keeps known workflow failures visible while updating", () => {
    renderOperationalRail([], { isUpdating: true, runs: [{ id: 1, repo: "buluma/gcc", name: "Known failure", event: "push", status: "completed", conclusion: "failure", branch: "master", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), runStartedAt: null, durationSeconds: null, url: "https://example.com/run" }] });
    expect(screen.getByText("Known failure")).toBeTruthy();
    expect(screen.getByText("Workflow details updating")).toBeTruthy();
    expect(screen.queryByText("Pulling workflow runs in the background.")).toBeNull();
  });
  it.each([["quick", "billing loading"], ["full", "billing blocked"]] as const)("labels %s unavailable billing accurately", (detailLevel, label) => {
    renderOperationalRail([], { detailLevel, billing: { ...billing, available: false, message: "Unavailable" } });
    expect(screen.getByText(label)).toBeTruthy();
  });
  it.each([[24, 87, "24 of 87 repositories scanned"], [12, 12, "All 12 repositories scanned"]] as const)("reports coverage %s of %s", (scannedCount, totalCount, text) => {
    renderOperationalRail([], { scannedCount, totalCount });
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("does not imply complete coverage from a quick response", () => {
    renderOperationalRail([], { detailLevel: "quick" });
    expect(screen.getByText("Workflow coverage loading")).toBeTruthy();
    expect(screen.queryByText("24 of 87 repositories scanned")).toBeNull();
  });
});
