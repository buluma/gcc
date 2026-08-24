import { describe, expect, it } from "vitest";

import {
  computeAttentionScore,
  matchesInfrastructureKeywords,
  matchesSecurityKeywords,
} from "./attention-score";

function baseInput() {
  return {
    ciFailing: false,
    reviewRequested: false,
    securitySensitive: false,
    infrastructureSensitive: false,
    staleOverdueDays: null,
    recentActivity: false,
  };
}

describe("computeAttentionScore", () => {
  it("scores a signal-free item at 0 with low severity and no reasons", () => {
    const result = computeAttentionScore(baseInput());
    expect(result).toEqual({ score: 0, severity: "low", reasons: [] });
  });

  it("matches the documented example: review + CI + security = high severity", () => {
    const result = computeAttentionScore({
      ...baseInput(),
      ciFailing: true,
      reviewRequested: true,
      securitySensitive: true,
    });

    expect(result.score).toBe(95);
    expect(result.severity).toBe("high");
    expect(result.reasons).toEqual([
      "CI failing",
      "Review requested",
      "Security-related change",
    ]);
  });

  it("caps the score at 100 even when every signal fires", () => {
    const result = computeAttentionScore({
      ciFailing: true,
      reviewRequested: true,
      securitySensitive: true,
      infrastructureSensitive: true,
      staleOverdueDays: 30,
      recentActivity: true,
    });

    expect(result.score).toBe(100);
    expect(result.severity).toBe("high");
  });

  it("bands severity at the documented thresholds", () => {
    // 30 points: below the 45 medium threshold.
    expect(computeAttentionScore({ ...baseInput(), reviewRequested: true }).severity).toBe("low");
    // 30 + 15 = 45 points: exactly at the medium threshold.
    expect(
      computeAttentionScore({ ...baseInput(), reviewRequested: true, infrastructureSensitive: true })
        .severity,
    ).toBe("medium");
    // 45 points alone: above the 45 medium threshold, still below 75 high.
    expect(computeAttentionScore({ ...baseInput(), ciFailing: true }).severity).toBe("medium");
    // 45 + 30 = 75 points: at the high threshold.
    expect(
      computeAttentionScore({ ...baseInput(), ciFailing: true, reviewRequested: true }).severity,
    ).toBe("high");
  });

  it("computes staleness points as base 10 plus one per overdue day, capped at 20", () => {
    expect(computeAttentionScore({ ...baseInput(), staleOverdueDays: 0 }).score).toBe(10);
    expect(computeAttentionScore({ ...baseInput(), staleOverdueDays: 5 }).score).toBe(15);
    expect(computeAttentionScore({ ...baseInput(), staleOverdueDays: 50 }).score).toBe(20);
  });

  it("includes a stale reason with the day count", () => {
    const result = computeAttentionScore({ ...baseInput(), staleOverdueDays: 4 });
    expect(result.reasons).toEqual(["Stale 5+ days"]);
  });

  it("adds a small recent-activity bump independent of other signals", () => {
    const withoutBump = computeAttentionScore({ ...baseInput(), reviewRequested: true });
    const withBump = computeAttentionScore({
      ...baseInput(),
      reviewRequested: true,
      recentActivity: true,
    });
    expect(withBump.score - withoutBump.score).toBe(5);
    expect(withBump.reasons).toContain("Recently updated");
  });
});

describe("matchesSecurityKeywords", () => {
  it("matches on title", () => {
    expect(
      matchesSecurityKeywords({ title: "Fix authentication bypass", labels: [] }),
    ).toBe(true);
  });

  it("matches on labels", () => {
    expect(
      matchesSecurityKeywords({ title: "Tidy up helper", labels: ["security"] }),
    ).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(
      matchesSecurityKeywords({ title: "Update changelog", labels: ["docs"] }),
    ).toBe(false);
  });
});

describe("matchesInfrastructureKeywords", () => {
  it("matches deployment/production language", () => {
    expect(
      matchesInfrastructureKeywords({ title: "Update production deploy pipeline", labels: [] }),
    ).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(
      matchesInfrastructureKeywords({ title: "Fix typo in README", labels: [] }),
    ).toBe(false);
  });
});
