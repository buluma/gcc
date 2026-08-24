import { describe, expect, it } from "vitest";

import { computeCiHealthByRepo, computeRepoCiHealth } from "./ci-health";
import type { WorkflowRunSummary } from "@/types/github";

function run(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: 1,
    repo: "me/app",
    name: "CI",
    event: "push",
    status: "completed",
    conclusion: "success",
    branch: "main",
    createdAt: "2026-08-24T10:00:00Z",
    updatedAt: "2026-08-24T10:05:00Z",
    runStartedAt: "2026-08-24T10:00:00Z",
    durationSeconds: 300,
    url: "https://github.com/me/app/actions/runs/1",
    ...overrides,
  };
}

describe("computeRepoCiHealth", () => {
  it("groups runs by workflow name and reports each workflow's latest status", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ id: 1, name: "CI", createdAt: "2026-08-24T10:00:00Z", conclusion: "success" }),
      run({ id: 2, name: "Deploy", createdAt: "2026-08-24T09:00:00Z", conclusion: "failure" }),
    ]);

    expect(health.workflows).toHaveLength(2);
    const ci = health.workflows.find((w) => w.name === "CI");
    const deploy = health.workflows.find((w) => w.name === "Deploy");
    expect(ci?.latestStatus).toBe("success");
    expect(deploy?.latestStatus).toBe("failure");
  });

  it("ignores runs belonging to a different repo", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ repo: "me/other", conclusion: "failure" }),
    ]);
    expect(health.workflows).toHaveLength(0);
    expect(health.overall).toBe("unknown");
  });

  it("uses the most recent run per workflow, not any run", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ id: 1, name: "CI", createdAt: "2026-08-24T09:00:00Z", conclusion: "failure" }),
      run({ id: 2, name: "CI", createdAt: "2026-08-24T10:00:00Z", conclusion: "success" }),
    ]);

    expect(health.workflows[0].latestStatus).toBe("success");
    expect(health.workflows[0].recentRuns).toBe(2);
    expect(health.workflows[0].failureCount).toBe(1);
  });

  it("marks overall health as failing when any workflow's latest run failed", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ id: 1, name: "CI", conclusion: "success" }),
      run({ id: 2, name: "Deploy", conclusion: "failure" }),
    ]);
    expect(health.overall).toBe("failing");
  });

  it("marks overall health as degraded when currently passing but a failure was observed", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ id: 1, name: "CI", createdAt: "2026-08-24T09:00:00Z", conclusion: "failure" }),
      run({ id: 2, name: "CI", createdAt: "2026-08-24T10:00:00Z", conclusion: "success" }),
    ]);
    expect(health.overall).toBe("degraded");
  });

  it("marks overall health as healthy when every workflow is currently passing with no observed failures", () => {
    const health = computeRepoCiHealth("me/app", [
      run({ id: 1, name: "CI", conclusion: "success" }),
      run({ id: 2, name: "Deploy", conclusion: "success" }),
    ]);
    expect(health.overall).toBe("healthy");
  });

  it("marks overall health as unknown when there are no runs at all", () => {
    const health = computeRepoCiHealth("me/app", []);
    expect(health.overall).toBe("unknown");
  });
});

describe("computeCiHealthByRepo", () => {
  it("computes health for every distinct repo present in the run list", () => {
    const healthByRepo = computeCiHealthByRepo([
      run({ repo: "me/a", conclusion: "success" }),
      run({ repo: "me/b", conclusion: "failure" }),
    ]);

    expect(healthByRepo.get("me/a")?.overall).toBe("healthy");
    expect(healthByRepo.get("me/b")?.overall).toBe("failing");
  });
});
