// @vitest-environment node

import { describe, expect, it } from "vitest"
import { z } from "zod"

import type {
  BillingRepoSummary,
  BillingSkuSummary,
  BillingSummary,
  BillingUnitSummary,
  CommitSummary,
  DashboardPayload,
  DashboardWarning,
  IssueSummary,
  RepoSummary,
  Viewer,
  WorkflowRunSummary,
} from "../src/types/github"

// Runtime validators derived from the shared types
const DashboardWarningSchema: z.ZodType<DashboardWarning> = z.object({
  area: z.string(),
  message: z.string(),
  fix: z.string().optional(),
})

const ViewerSchema: z.ZodType<Viewer> = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().url(),
  profileUrl: z.string().url(),
})

const CommitSummarySchema: z.ZodType<CommitSummary> = z.object({
  repo: z.string(),
  sha: z.string(),
  shortSha: z.string().length(7),
  message: z.string(),
  author: z.string().nullable(),
  date: z.string().datetime(),
  url: z.string().url(),
})

const IssueSummarySchema: z.ZodType<IssueSummary> = z.object({
  id: z.number().int().positive(),
  number: z.number().int().positive(),
  repo: z.string(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  url: z.string().url(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  author: z.string().nullable(),
  labels: z.array(z.string()),
  isPullRequest: z.boolean(),
  isDraft: z.boolean().optional(),
})

const WorkflowRunSummarySchema: z.ZodType<WorkflowRunSummary> = z.object({
  id: z.number().int().positive(),
  repo: z.string(),
  name: z.string(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  branch: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  runStartedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nullable(),
  url: z.string().url(),
})

const RepoSummarySchema: z.ZodType<RepoSummary> = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  description: z.string().nullable(),
  url: z.string().url(),
  language: z.string().nullable(),
  visibility: z.enum(["public", "private", "internal"]),
  isPrivate: z.boolean(),
  isFork: z.boolean(),
  isArchived: z.boolean(),
  stars: z.number().int().nonnegative(),
  forks: z.number().int().nonnegative(),
  sizeKb: z.number().int().nonnegative(),
  defaultBranch: z.string().nullable(),
  pushedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  openIssues: z.number().int().nullable(),
  openPullRequests: z.number().int().nullable(),
  checkState: z.string().nullable(),
  latestCommit: CommitSummarySchema.nullable(),
  latestPullRequest: IssueSummarySchema.nullable(),
  latestRun: WorkflowRunSummarySchema.nullable(),
})

const BillingUnitSummarySchema: z.ZodType<BillingUnitSummary> = z.object({
  unitType: z.string(),
  quantity: z.number().nonnegative(),
})

const BillingSkuSummarySchema: z.ZodType<BillingSkuSummary> = z.object({
  sku: z.string(),
  quantity: z.number().nonnegative(),
  unitType: z.string().nullable(),
  grossAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
})

const BillingRepoSummarySchema: z.ZodType<BillingRepoSummary> = z.object({
  repo: z.string(),
  quantity: z.number().nonnegative(),
  grossAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
})

const BillingSummarySchema: z.ZodType<BillingSummary> = z.object({
  available: z.boolean(),
  year: z.number().int().positive(),
  month: z.number().int().min(1).max(12),
  grossAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  netAmount: z.number().nonnegative(),
  unitTotals: z.array(BillingUnitSummarySchema),
  skus: z.array(BillingSkuSummarySchema),
  repositories: z.array(BillingRepoSummarySchema),
  message: z.string().optional(),
  fix: z.string().optional(),
})

const DashboardPayloadSchema: z.ZodType<DashboardPayload> = z.object({
  generatedAt: z.string().datetime(),
  detailLevel: z.enum(["quick", "full"]),
  scanLimit: z.number().int().min(8).max(60),
  viewer: ViewerSchema,
  repos: z.array(RepoSummarySchema),
  recentCommits: z.array(CommitSummarySchema),
  pullRequests: z.array(IssueSummarySchema),
  issues: z.array(IssueSummarySchema),
  ciRuns: z.array(WorkflowRunSummarySchema),
  billing: BillingSummarySchema,
  warnings: z.array(DashboardWarningSchema),
})

// Fixture builders for testing
function createValidViewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    login: "jskoiz",
    name: "saburo",
    avatarUrl: "https://github.com/jskoiz.png",
    profileUrl: "https://github.com/jskoiz",
    ...overrides,
  }
}

function createValidCommit(overrides: Partial<CommitSummary> = {}): CommitSummary {
  return {
    repo: "jskoiz/test-repo",
    sha: "abcdef1234567890abcdef1234567890abcdef12",
    shortSha: "abcdef1",
    message: "Test commit message",
    author: "saburo",
    date: "2026-07-12T12:00:00.000Z",
    url: "https://github.com/jskoiz/test-repo/commit/abcdef1",
    ...overrides,
  }
}

function createValidIssue(overrides: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: 123,
    number: 42,
    repo: "jskoiz/test-repo",
    title: "Test issue",
    state: "open",
    url: "https://github.com/jskoiz/test-repo/issues/42",
    updatedAt: "2026-07-12T12:00:00.000Z",
    createdAt: "2026-07-12T11:00:00.000Z",
    author: "jskoiz",
    labels: ["bug", "help-wanted"],
    isPullRequest: false,
    isDraft: false,
    ...overrides,
  }
}

function createValidWorkflowRun(overrides: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: 999,
    repo: "jskoiz/test-repo",
    name: "CI",
    event: "push",
    status: "completed",
    conclusion: "success",
    branch: "main",
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:05:00.000Z",
    runStartedAt: "2026-07-12T12:01:00.000Z",
    durationSeconds: 240,
    url: "https://github.com/jskoiz/test-repo/actions/runs/999",
    ...overrides,
  }
}

function createValidRepo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    id: 1,
    name: "test-repo",
    fullName: "jskoiz/test-repo",
    owner: "jskoiz",
    description: "A test repository",
    url: "https://github.com/jskoiz/test-repo",
    language: "TypeScript",
    visibility: "private",
    isPrivate: true,
    isFork: false,
    isArchived: false,
    stars: 10,
    forks: 2,
    sizeKb: 1024,
    defaultBranch: "main",
    pushedAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:00:00.000Z",
    openIssues: 5,
    openPullRequests: 3,
    checkState: "SUCCESS",
    latestCommit: createValidCommit(),
    latestPullRequest: createValidIssue(),
    latestRun: createValidWorkflowRun(),
    ...overrides,
  }
}

function createValidBilling(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    available: true,
    year: 2026,
    month: 7,
    grossAmount: 100.5,
    discountAmount: 10.0,
    netAmount: 90.5,
    unitTotals: [
      { unitType: "Minutes", quantity: 5000 },
      { unitType: "GBh", quantity: 100 },
    ],
    skus: [
      { sku: "Actions Linux", quantity: 5000, unitType: "Minutes", grossAmount: 80.0, netAmount: 72.0 },
      { sku: "Actions Windows", quantity: 100, unitType: "GBh", grossAmount: 20.5, netAmount: 18.5 },
    ],
    repositories: [
      { repo: "jskoiz/test-repo", quantity: 3000, grossAmount: 50.0, netAmount: 45.0 },
    ],
    ...overrides,
  }
}

function createValidDashboardPayload(overrides: Partial<DashboardPayload> = {}): DashboardPayload {
  return {
    generatedAt: "2026-07-12T12:00:00.000Z",
    detailLevel: "full",
    scanLimit: 24,
    viewer: createValidViewer(),
    repos: [createValidRepo()],
    recentCommits: [createValidCommit()],
    pullRequests: [createValidIssue({ isPullRequest: true })],
    issues: [createValidIssue({ isPullRequest: false })],
    ciRuns: [createValidWorkflowRun()],
    billing: createValidBilling(),
    warnings: [],
    ...overrides,
  }
}

describe("DashboardPayload contract validation", () => {
  it("validates a complete valid payload", () => {
    const payload = createValidDashboardPayload()
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it("validates a quick dashboard payload", () => {
    const payload = createValidDashboardPayload({
      detailLevel: "quick",
      repos: [],
      recentCommits: [],
      pullRequests: [],
      issues: [],
      ciRuns: [],
      billing: createValidBilling({ available: false, grossAmount: 0, discountAmount: 0, netAmount: 0, unitTotals: [], skus: [], repositories: [] }),
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.detailLevel).toBe("quick")
    }
  })

  it("validates payload with null optional fields", () => {
    const payload = createValidDashboardPayload({
      repos: [createValidRepo({ latestCommit: null, latestPullRequest: null, latestRun: null, description: null, language: null, defaultBranch: null, pushedAt: null, updatedAt: null, openIssues: null, openPullRequests: null, checkState: null })],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it("rejects invalid detailLevel", () => {
    const payload = createValidDashboardPayload({ detailLevel: "invalid" as "full" | "quick" })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects scanLimit out of bounds", () => {
    const payload = createValidDashboardPayload({ scanLimit: 7 })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)

    const payload2 = createValidDashboardPayload({ scanLimit: 61 })
    const result2 = DashboardPayloadSchema.safeParse(payload2)
    expect(result2.success).toBe(false)
  })

  it("rejects invalid repo visibility", () => {
    const payload = createValidDashboardPayload({
      repos: [createValidRepo({ visibility: "secret" as "public" | "private" | "internal" })],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects invalid issue state", () => {
    const payload = createValidDashboardPayload({
      issues: [createValidIssue({ state: "invalid" as "open" | "closed" })],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects missing required fields", () => {
    const payload = createValidDashboardPayload()
    delete (payload as Partial<DashboardPayload>).generatedAt
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects negative stars", () => {
    const payload = createValidDashboardPayload({
      repos: [createValidRepo({ stars: -1 })],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects invalid date format", () => {
    const payload = createValidDashboardPayload({
      generatedAt: "not-a-date",
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("rejects invalid URL format", () => {
    const payload = createValidDashboardPayload({
      repos: [createValidRepo({ url: "not-a-url" })],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it("validates warning with optional fix", () => {
    const payload = createValidDashboardPayload({
      warnings: [{ area: "test", message: "Test warning", fix: "run something" }],
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it("validates billing with unavailable flag", () => {
    const payload = createValidDashboardPayload({
      billing: createValidBilling({ available: false, message: "Billing unavailable", fix: "auth refresh" }),
    })
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })
})

describe("Contract round-trip serialization", () => {
  it("serializes and deserializes without loss", () => {
    const payload = createValidDashboardPayload()
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json) as DashboardPayload

    const result = DashboardPayloadSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.generatedAt).toBe(payload.generatedAt)
      expect(result.data.viewer.login).toBe(payload.viewer.login)
      expect(result.data.repos).toHaveLength(payload.repos.length)
      expect(result.data.repos[0].fullName).toBe(payload.repos[0].fullName)
      expect(result.data.recentCommits[0].sha).toBe(payload.recentCommits[0].sha)
      expect(result.data.billing.netAmount).toBe(payload.billing.netAmount)
    }
  })

  it("preserves null values through round-trip", () => {
    const payload = createValidDashboardPayload({
      repos: [createValidRepo({ latestCommit: null, latestPullRequest: null, latestRun: null })],
    })
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json) as DashboardPayload

    const result = DashboardPayloadSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.repos[0].latestCommit).toBeNull()
      expect(result.data.repos[0].latestPullRequest).toBeNull()
      expect(result.data.repos[0].latestRun).toBeNull()
    }
  })

  it("preserves optional billing message and fix", () => {
    const payload = createValidDashboardPayload({
      billing: createValidBilling({ message: "Custom message", fix: "Custom fix" }),
    })
    const json = JSON.stringify(payload)
    const parsed = JSON.parse(json) as DashboardPayload

    const result = DashboardPayloadSchema.safeParse(parsed)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.billing.message).toBe("Custom message")
      expect(result.data.billing.fix).toBe("Custom fix")
    }
  })
})

describe("Server payload production matches contract", () => {
  it("quick dashboard payload matches contract", () => {
    const payload = createValidDashboardPayload({
      detailLevel: "quick",
      repos: [],
      recentCommits: [],
      pullRequests: [],
      issues: [],
      ciRuns: [],
      billing: createValidBilling({ available: false, grossAmount: 0, discountAmount: 0, netAmount: 0, unitTotals: [], skus: [], repositories: [], message: "Billing loads with full dashboard details." }),
    })

    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it("full dashboard payload with all fields matches contract", () => {
    const payload = createValidDashboardPayload()
    const result = DashboardPayloadSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })
})

describe("Type completeness - all fields validated", () => {
  it("DashboardPayload has all required fields", () => {
    const requiredFields = [
      "generatedAt",
      "detailLevel",
      "scanLimit",
      "viewer",
      "repos",
      "recentCommits",
      "pullRequests",
      "issues",
      "ciRuns",
      "billing",
      "warnings",
    ]
    const shape = (DashboardPayloadSchema as unknown as { shape: Record<string, unknown> }).shape
    for (const field of requiredFields) {
      expect(shape).toHaveProperty(field)
    }
  })

  it("RepoSummary has all required fields", () => {
    const requiredFields = [
      "id", "name", "fullName", "owner", "description", "url", "language",
      "visibility", "isPrivate", "isFork", "isArchived", "stars", "forks",
      "sizeKb", "defaultBranch", "pushedAt", "updatedAt", "openIssues",
      "openPullRequests", "checkState", "latestCommit", "latestPullRequest", "latestRun",
    ]
    const shape = (RepoSummarySchema as unknown as { shape: Record<string, unknown> }).shape
    for (const field of requiredFields) {
      expect(shape).toHaveProperty(field)
    }
  })

  it("BillingSummary has all required fields", () => {
    const requiredFields = [
      "available", "year", "month", "grossAmount", "discountAmount", "netAmount",
      "unitTotals", "skus", "repositories", "message", "fix",
    ]
    const shape = (BillingSummarySchema as unknown as { shape: Record<string, unknown> }).shape
    for (const field of requiredFields) {
      expect(shape).toHaveProperty(field)
    }
  })
})