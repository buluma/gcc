import { describe, expect, it } from "vitest";

import { classifyFileArea, computeChangeProfile } from "./change-intelligence";

function file(path: string, additions = 5, deletions = 2) {
  return { path, additions, deletions };
}

describe("classifyFileArea", () => {
  it("classifies dependency manifests", () => {
    expect(classifyFileArea("package.json")).toBe("dependencies");
    expect(classifyFileArea("frontend/pnpm-lock.yaml")).toBe("dependencies");
  });

  it("classifies CI/workflow files", () => {
    expect(classifyFileArea(".github/workflows/ci.yml")).toBe("ci");
  });

  it("classifies infrastructure/config files", () => {
    expect(classifyFileArea("Dockerfile")).toBe("infrastructure");
    expect(classifyFileArea("infra/main.tf")).toBe("infrastructure");
    expect(classifyFileArea("wrangler.jsonc")).toBe("infrastructure");
  });

  it("classifies security-sensitive files", () => {
    expect(classifyFileArea("server/auth/session.ts")).toBe("security");
    expect(classifyFileArea("secrets/prod.pem")).toBe("security");
  });

  it("classifies test files", () => {
    expect(classifyFileArea("src/lib/format.test.ts")).toBe("tests");
    expect(classifyFileArea("__tests__/App.test.tsx")).toBe("tests");
  });

  it("classifies documentation", () => {
    expect(classifyFileArea("README.md")).toBe("documentation");
    expect(classifyFileArea("docs/ARCHITECTURE.md")).toBe("documentation");
  });

  it("falls back to source for anything else", () => {
    expect(classifyFileArea("src/components/Button.tsx")).toBe("source");
  });

  it("prioritizes security over other overlapping patterns", () => {
    expect(classifyFileArea(".github/workflows/security-scan-secret-rotation.yml")).toBe(
      "security",
    );
  });
});

describe("computeChangeProfile", () => {
  it("rates a docs-only change as low risk regardless of size", () => {
    const profile = computeChangeProfile({
      files: [file("README.md", 400, 400), file("docs/guide.md", 200, 0)],
      additions: 600,
      deletions: 400,
      changedFiles: 2,
    });

    expect(profile.risk).toBe("low");
    expect(profile.areas).toEqual(["documentation"]);
  });

  it("rates a security-sensitive change as high risk even if small", () => {
    const profile = computeChangeProfile({
      files: [file("server/auth/session.ts", 3, 1)],
      additions: 3,
      deletions: 1,
      changedFiles: 1,
    });

    expect(profile.risk).toBe("high");
    expect(profile.areas).toEqual(["security"]);
    expect(profile.signals[0]).toContain("Security-sensitive files changed");
  });

  it("rates combined infrastructure + CI changes as high risk", () => {
    const profile = computeChangeProfile({
      files: [file("Dockerfile"), file(".github/workflows/deploy.yml")],
      additions: 10,
      deletions: 2,
      changedFiles: 2,
    });

    expect(profile.risk).toBe("high");
    expect(profile.areas).toEqual(["ci", "infrastructure"]);
  });

  it("rates a lone dependency bump as medium risk", () => {
    const profile = computeChangeProfile({
      files: [file("package.json", 1, 1), file("package-lock.json", 20, 20)],
      additions: 21,
      deletions: 21,
      changedFiles: 2,
    });

    expect(profile.risk).toBe("medium");
    expect(profile.areas).toEqual(["dependencies"]);
  });

  it("rates a large plain source change as medium risk from size alone", () => {
    const files = Array.from({ length: 25 }, (_, i) => file(`src/module-${i}.ts`));
    const profile = computeChangeProfile({
      files,
      additions: 1000,
      deletions: 500,
      changedFiles: 25,
    });

    expect(profile.risk).toBe("medium");
    expect(profile.blastRadius).toBeGreaterThanOrEqual(20);
  });

  it("rates a small plain source change as low risk", () => {
    const profile = computeChangeProfile({
      files: [file("src/components/Button.tsx", 5, 2)],
      additions: 5,
      deletions: 2,
      changedFiles: 1,
    });

    expect(profile.risk).toBe("low");
    expect(profile.areas).toEqual([]);
  });

  it("computes blastRadius as file count plus lines-changed/100", () => {
    const profile = computeChangeProfile({
      files: [file("a.ts"), file("b.ts")],
      additions: 150,
      deletions: 50,
      changedFiles: 2,
    });

    // 2 files + round(200 / 100) = 2 + 2 = 4
    expect(profile.blastRadius).toBe(4);
  });

  it("notes when the file list was truncated", () => {
    const profile = computeChangeProfile({
      files: [file("a.ts")],
      additions: 10,
      deletions: 5,
      changedFiles: 500,
      filesTruncated: true,
    });

    expect(profile.signals.some((s) => s.includes("truncated"))).toBe(true);
  });

  it("handles an empty file list without throwing", () => {
    const profile = computeChangeProfile({
      files: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
    });

    expect(profile.risk).toBe("low");
    expect(profile.areas).toEqual([]);
    expect(profile.signals.length).toBeGreaterThan(0);
  });
});
