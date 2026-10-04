// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureGithubDashboardForTests,
  getGithubDashboard,
  getPublicGithubDashboard,
  setGithubExecutorForTests,
} from "./github-dashboard";
import { PaginationLimitError } from "./github-client";

type GhCall = {
  args: string[];
  endpoint: string;
};

type GithubExecutorOptions = {
  repos?: unknown[];
  reposError?: unknown;
  graphqlError?: unknown;
  graphqlPageSize?: number;
  latestCommit?: unknown;
  latestCommitFailures?: unknown[];
  workflowRunsByRepo?: Record<string, unknown[]>;
  workflowRunFailuresByRepo?: Record<string, unknown>;
  reviewRequestedIds?: number[];
  pullRequestSearchItems?: unknown[];
};

function createGithubExecutor({
  repos = [],
  reposError,
  graphqlError,
  graphqlPageSize,
  latestCommit = createRawCommit("Latest commit"),
  latestCommitFailures = [],
  workflowRunsByRepo = {},
  workflowRunFailuresByRepo = {},
  reviewRequestedIds,
  pullRequestSearchItems,
}: GithubExecutorOptions = {}) {
  const calls: GhCall[] = [];
  let graphqlPage = 0;
  let latestCommitAttempt = 0;
  const executor = vi.fn(async (args: string[], endpoint: string) => {
    calls.push({ args, endpoint });
    await Promise.resolve();

    if (endpoint === "user") {
      return JSON.stringify({
        login: "buluma",
        name: "saburo",
        avatar_url: "https://example.com/avatar.png",
        html_url: "https://github.com/buluma",
      });
    }

    if (endpoint.startsWith("/user/repos?")) {
      if (reposError) throw reposError;
      return args.includes("--slurp")
        ? JSON.stringify([repos])
        : JSON.stringify(repos);
    }

    if (endpoint === "graphql") {
      if (graphqlError) throw graphqlError;
      const pageIndex = graphqlPage;
      graphqlPage += 1;
      const pageRepos =
        typeof graphqlPageSize === "number"
          ? repos.slice(
              pageIndex * graphqlPageSize,
              (pageIndex + 1) * graphqlPageSize,
            )
          : repos;
      const hasNextPage =
        typeof graphqlPageSize === "number"
          ? (pageIndex + 1) * graphqlPageSize < repos.length
          : false;

      return JSON.stringify({
        data: {
          user: {
            repositories: {
              nodes: pageRepos.map((repo) => ({
                nameWithOwner: repoNameWithOwner(repo),
                pullRequests: { totalCount: 0 },
                issues: { totalCount: 0 },
                defaultBranchRef: {
                  target: {
                    statusCheckRollup: { state: "SUCCESS" },
                  },
                },
              })),
              pageInfo: {
                hasNextPage,
                endCursor: hasNextPage ? `cursor-${pageIndex + 1}` : null,
              },
            },
          },
        },
      });
    }

    if (endpoint.endsWith("/commits?per_page=1")) {
      const failure = latestCommitFailures[latestCommitAttempt];
      latestCommitAttempt += 1;
      if (failure !== undefined) throw failure;
      return JSON.stringify(latestCommit ? [latestCommit] : []);
    }

    const workflowRunsEndpoint = endpoint.match(
      /^\/repos\/([^/]+)\/([^/]+)\/actions\/runs\?per_page=3$/,
    );
    if (workflowRunsEndpoint) {
      const fullName = `${decodeURIComponent(workflowRunsEndpoint[1])}/${decodeURIComponent(workflowRunsEndpoint[2])}`;
      if (fullName in workflowRunFailuresByRepo) {
        throw workflowRunFailuresByRepo[fullName];
      }
      return JSON.stringify({
        workflow_runs: workflowRunsByRepo[fullName] ?? [],
      });
    }

    if (endpoint.startsWith("/search/issues?")) {
      if (endpoint.includes("review-requested%3A%40me")) {
        return JSON.stringify({
          items: (reviewRequestedIds ?? []).map((id) => ({ id })),
        });
      }
      if (endpoint.includes("is%3Apr") && pullRequestSearchItems) {
        return JSON.stringify({ items: pullRequestSearchItems });
      }
      return JSON.stringify({ items: [] });
    }

    if (endpoint.includes("/settings/billing/usage")) {
      return JSON.stringify({ usageItems: [] });
    }

    throw new Error(`Unhandled endpoint ${endpoint}`);
  });

  return { calls, executor };
}

function createRawRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "active-repo",
    full_name: "buluma/active-repo",
    owner: { login: "buluma" },
    description: null,
    html_url: "https://github.com/buluma/active-repo",
    language: "TypeScript",
    visibility: "private",
    private: true,
    fork: false,
    archived: false,
    stargazers_count: 1,
    forks_count: 0,
    size: 128,
    default_branch: "main",
    pushed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    open_issues_count: 0,
    ...overrides,
  };
}

function createRawRepos(
  count: number,
  overrides: Record<string, unknown> = {},
) {
  return Array.from({ length: count }, (_, index) => {
    const repoNumber = index + 1;
    return createRawRepo({
      id: repoNumber,
      name: `repo-${repoNumber}`,
      full_name: `buluma/repo-${repoNumber}`,
      html_url: `https://github.com/buluma/repo-${repoNumber}`,
      pushed_at: "2000-01-01T00:00:00Z",
      updated_at: "2000-01-01T00:00:00Z",
      ...overrides,
    });
  });
}

function createRawCommit(message: string) {
  return {
    sha: "abcdef1234567890",
    html_url: "https://github.com/buluma/active-repo/commit/abcdef1",
    commit: {
      message,
      author: {
        name: "saburo",
        date: "2026-06-10T12:00:00Z",
      },
    },
  };
}

function createRawSearchIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    number: 1,
    title: "Search result pull request",
    state: "open",
    html_url: "https://github.com/buluma/active-repo/pull/1",
    repository_url: "https://api.github.com/repos/buluma/active-repo",
    updated_at: "2026-06-10T13:00:00Z",
    created_at: "2026-06-10T11:00:00Z",
    user: { login: "someone-else" },
    pull_request: {},
    ...overrides,
  };
}

function createRawWorkflowRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 900,
    name: "CI",
    event: "push",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    created_at: "2026-06-10T14:00:00Z",
    updated_at: "2026-06-10T14:05:00Z",
    run_started_at: "2026-06-10T14:01:00Z",
    html_url: "https://github.com/buluma/active-repo/actions/runs/900",
    ...overrides,
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function createAuthenticatedDashboardFetch() {
  return vi.fn(
    async (...[input, init]: [string | URL | Request, RequestInit?]) => {
      await Promise.resolve();
      const url = input.toString();
      const headers = init?.headers as Record<string, string> | undefined;
      const token =
        headers?.Authorization?.replace(/^Bearer /, "") ?? "missing-token";

      if (url.endsWith("/user")) {
        return jsonResponse({
          login: "buluma",
          name: "saburo",
          avatar_url: "https://example.com/avatar.png",
          html_url: "https://github.com/buluma",
        });
      }
      if (url.includes("/user/repos?")) {
        const suffix = token === "token-a" ? "a" : "b";
        return jsonResponse([
          createRawRepo({
            id: suffix === "a" ? 1 : 2,
            name: `repo-${suffix}`,
            full_name: `buluma/repo-${suffix}`,
            html_url: `https://github.com/buluma/repo-${suffix}`,
          }),
        ]);
      }
      throw new Error(`Unhandled fetch ${url}`);
    },
  );
}

function repoNameWithOwner(repo: unknown) {
  return typeof repo === "object" && repo !== null && "full_name" in repo
    ? String(repo.full_name)
    : "buluma/active-repo";
}

const ORIGINAL_GITHUB_ENV = {
  GITHUB_PUBLIC_TOKEN: process.env.GITHUB_PUBLIC_TOKEN,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GH_TOKEN: process.env.GH_TOKEN,
};

afterEach(() => {
  configureGithubDashboardForTests(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  restoreEnv("GITHUB_PUBLIC_TOKEN", ORIGINAL_GITHUB_ENV.GITHUB_PUBLIC_TOKEN);
  restoreEnv("GITHUB_TOKEN", ORIGINAL_GITHUB_ENV.GITHUB_TOKEN);
  restoreEnv("GH_TOKEN", ORIGINAL_GITHUB_ENV.GH_TOKEN);
});

function restoreEnv(
  name: keyof typeof ORIGINAL_GITHUB_ENV,
  value: string | undefined,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("getGithubDashboard review-requested detection", () => {
  it("marks only pull requests returned by the review-requested:@me search as reviewRequested", async () => {
    const { executor } = createGithubExecutor({
      pullRequestSearchItems: [
        createRawSearchIssue({ id: 1, number: 1 }),
        createRawSearchIssue({ id: 2, number: 2 }),
      ],
      reviewRequestedIds: [2],
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(
      payload.pullRequests.find((pr) => pr.id === 1)?.reviewRequested,
    ).toBe(false);
    expect(
      payload.pullRequests.find((pr) => pr.id === 2)?.reviewRequested,
    ).toBe(true);
  });

  it("leaves reviewRequested unset for public profile dashboards (no authenticated viewer)", async () => {
    process.env.GITHUB_PUBLIC_TOKEN = "";
    const fetchMock = vi.fn(
      async (...[input]: [string | URL | Request, RequestInit?]) => {
        const url = input.toString();
        if (url.endsWith("/users/buluma")) {
          return jsonResponse({
            login: "buluma",
            name: "saburo",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/buluma",
          });
        }
        if (url.includes("/users/buluma/repos?")) {
          return jsonResponse([createRawRepo()]);
        }
        if (url.includes("/search/issues?")) {
          return jsonResponse({
            items: [createRawSearchIssue({ id: 1, number: 1 })],
          });
        }
        throw new Error(`Unhandled fetch ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getPublicGithubDashboard("buluma", { scanLimit: 8 });

    expect(
      payload.pullRequests.find((pr) => pr.id === 1)?.reviewRequested,
    ).toBeUndefined();
  });
});

describe("getGithubDashboard request coalescing", () => {
  it("shares simultaneous identical full loads", async () => {
    const { calls, executor } = createGithubExecutor();
    configureGithubDashboardForTests(executor);

    const first = getGithubDashboard({ force: true, scanLimit: 8 });
    const second = getGithubDashboard({ force: true, scanLimit: 8 });
    const [firstPayload, secondPayload] = await Promise.all([first, second]);

    expect(firstPayload).toBe(secondPayload);
    expect(calls.filter((call) => call.endpoint === "user")).toHaveLength(1);
    expect(
      calls.filter((call) => call.endpoint.startsWith("/user/repos?")),
    ).toHaveLength(1);
    expect(calls.filter((call) => call.endpoint === "graphql")).toHaveLength(1);
  });

  it("shares simultaneous authenticated loads within one session", async () => {
    const fetchMock = createAuthenticatedDashboardFetch();
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      force: true,
      quick: true,
      scanLimit: 8,
      auth: { token: "token-a", sessionId: "session-a" },
    };

    const [firstPayload, secondPayload] = await Promise.all([
      getGithubDashboard(options),
      getGithubDashboard(options),
    ]);

    expect(firstPayload).toBe(secondPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("isolates simultaneous authenticated loads for separate sessions of the same login", async () => {
    const fetchMock = createAuthenticatedDashboardFetch();
    vi.stubGlobal("fetch", fetchMock);

    const [firstPayload, secondPayload] = await Promise.all([
      getGithubDashboard({
        force: true,
        quick: true,
        scanLimit: 8,
        auth: { token: "token-a", sessionId: "session-a" },
      }),
      getGithubDashboard({
        force: true,
        quick: true,
        scanLimit: 8,
        auth: { token: "token-b", sessionId: "session-b" },
      }),
    ]);

    expect(firstPayload.repos[0]?.fullName).toBe("buluma/repo-a");
    expect(secondPayload.repos[0]?.fullName).toBe("buluma/repo-b");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps quick mode bounded and skips billing when no full cache is available", async () => {
    const { calls, executor } = createGithubExecutor();
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({
      force: true,
      quick: true,
      scanLimit: 8,
    });
    const repoCall = calls.find((call) =>
      call.endpoint.startsWith("/user/repos?"),
    );

    expect(payload.detailLevel).toBe("quick");
    expect(payload.billing.available).toBe(false);
    expect(payload.billing.message).toBe(
      "Billing loads with full dashboard details.",
    );
    expect(
      calls.some((call) => call.endpoint.includes("/settings/billing/usage")),
    ).toBe(false);
    expect(repoCall?.endpoint).toContain("per_page=8");
    expect(repoCall?.args).not.toContain("--paginate");
    expect(repoCall?.args).not.toContain("--slurp");
  });

  it("adds latest commit details directly to each repo", async () => {
    const { calls, executor } = createGithubExecutor({
      repos: [createRawRepo()],
      latestCommit: createRawCommit("Latest canonical commit"),
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const repo = payload.repos[0];

    expect(repo.latestCommit?.message).toBe("Latest canonical commit");
    expect(payload.recentCommits.map((commit) => commit.repo)).toEqual([
      "buluma/active-repo",
    ]);
    expect(
      calls.some(
        (call) =>
          call.endpoint === "/repos/buluma/active-repo/commits?per_page=1",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.endpoint ===
          "/repos/buluma/active-repo/pulls?state=all&sort=updated&direction=desc&per_page=1",
      ),
    ).toBe(false);
  });

  it("reuses same-day per-repo detail cache across forced full refreshes", async () => {
    const { calls, executor } = createGithubExecutor({
      repos: [createRawRepo()],
      latestCommit: createRawCommit("Cached commit"),
    });
    configureGithubDashboardForTests(executor);

    await getGithubDashboard({ force: true, scanLimit: 8 });
    await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(
      calls.filter(
        (call) =>
          call.endpoint === "/repos/buluma/active-repo/commits?per_page=1",
      ),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (call) =>
          call.endpoint ===
          "/repos/buluma/active-repo/pulls?state=all&sort=updated&direction=desc&per_page=1",
      ),
    ).toHaveLength(0);
  });

  it("retries a failed latest-commit fetch", async () => {
    const secretError =
      "Commit request failed with token ghp_repo_detail_secret";
    const { calls, executor } = createGithubExecutor({
      repos: [createRawRepo()],
      latestCommit: createRawCommit("Recovered commit"),
      latestCommitFailures: [new Error(secretError)],
    });
    configureGithubDashboardForTests(executor);

    const partial = await getGithubDashboard({ force: true, scanLimit: 8 });
    const recovered = await getGithubDashboard({ force: true, scanLimit: 8 });
    const warningText = partial.warnings
      .map((warning) => warning.message)
      .join("\n");

    expect(partial.repos[0].latestCommit).toBeNull();
    expect(partial.warnings).toContainEqual({
      area: "repo details",
      message:
        "Latest commit refresh failed for 1 repositories.",
    });
    expect(warningText).not.toContain(secretError);
    expect(warningText).not.toContain("ghp_repo_detail_secret");
    expect(recovered.repos[0].latestCommit?.message).toBe("Recovered commit");
    expect(
      calls.filter((call) => call.endpoint.endsWith("/commits?per_page=1")),
    ).toHaveLength(2);
    expect(
      calls.filter((call) =>
        call.endpoint.endsWith(
          "/pulls?state=all&sort=updated&direction=desc&per_page=1",
        ),
      ),
    ).toHaveLength(0);
  });

  it("bounds cold repo-detail fanout to the workflow scan set", async () => {
    const activeAt = new Date().toISOString();
    const repos = createRawRepos(10, {
      pushed_at: activeAt,
      updated_at: activeAt,
    });
    const { calls, executor } = createGithubExecutor({ repos });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const detailWarnings = payload.warnings.filter(
      (warning) => warning.area === "repo details",
    );

    expect(payload.repos).toHaveLength(10);
    expect(
      calls.filter((call) => call.endpoint.endsWith("/commits?per_page=1")),
    ).toHaveLength(8);
    expect(
      calls.filter((call) =>
        call.endpoint.endsWith(
          "/pulls?state=all&sort=updated&direction=desc&per_page=1",
        ),
      ),
    ).toHaveLength(0);
    expect(detailWarnings).toContainEqual({
      area: "repo details",
      message:
        "Latest commit refresh is limited to 8 of 10 repositories; active repositories outside the live refresh scope: 2.",
    });
    expect(
      detailWarnings.map((warning) => warning.message).join("\n"),
    ).not.toContain("buluma/repo-");
  });

  it("preserves cached repo details outside a narrower refresh set", async () => {
    const activeAt = new Date().toISOString();
    const repos = createRawRepos(9, {
      pushed_at: activeAt,
      updated_at: activeAt,
    });
    const { calls, executor } = createGithubExecutor({
      repos,
      latestCommit: createRawCommit("Cached out-of-scope commit"),
    });
    configureGithubDashboardForTests(executor);

    await getGithubDashboard({ force: true, scanLimit: 9 });
    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const outOfScopeRepo = payload.repos.find(
      (repo) => repo.fullName === "buluma/repo-9",
    );

    expect(outOfScopeRepo?.latestCommit?.message).toBe(
      "Cached out-of-scope commit",
    );
    expect(
      calls.filter((call) => call.endpoint.endsWith("/commits?per_page=1")),
    ).toHaveLength(9);
    expect(
      calls.filter((call) =>
        call.endpoint.endsWith(
          "/pulls?state=all&sort=updated&direction=desc&per_page=1",
        ),
      ),
    ).toHaveLength(0);
    expect(payload.warnings).toContainEqual({
      area: "repo details",
      message:
        "Latest commit refresh is limited to 8 of 9 repositories; active repositories outside the live refresh scope: 1.",
    });
  });

  it("clears expired cached repo details outside a narrower refresh set", async () => {
    const now = Date.parse("2026-07-12T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const activeAt = new Date().toISOString();
    const repos = createRawRepos(9, {
      pushed_at: activeAt,
      updated_at: activeAt,
    });
    const { calls, executor } = createGithubExecutor({
      repos,
      latestCommit: createRawCommit("Expired out-of-scope commit"),
    });
    configureGithubDashboardForTests(executor);

    await getGithubDashboard({ force: true, scanLimit: 9 });
    vi.setSystemTime(now + 24 * 60 * 60_000 + 1);
    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const outOfScopeRepo = payload.repos.find(
      (repo) => repo.fullName === "buluma/repo-9",
    );
    const outOfScopeDetailCalls = calls.filter(
      (call) =>
        call.endpoint.includes("/repos/buluma/repo-9/") &&
        (call.endpoint.endsWith("/commits?per_page=1") ||
          call.endpoint.includes("/pulls?state=all")),
    );

    expect(outOfScopeRepo?.latestCommit).toBeNull();
    expect(outOfScopeDetailCalls).toHaveLength(1);
  });

  it("skips uncached per-repo detail pulls for inactive repos", async () => {
    const { calls, executor } = createGithubExecutor({
      repos: [
        createRawRepo({
          pushed_at: "2000-01-01T00:00:00Z",
          updated_at: "2000-01-01T00:00:00Z",
        }),
      ],
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(payload.repos[0].latestCommit).toBeNull();
    expect(
      calls.some((call) => call.endpoint.includes("/commits?per_page=1")),
    ).toBe(false);
    expect(
      calls.some((call) => call.endpoint.includes("/pulls?state=all")),
    ).toBe(false);
  });

  it("returns stale cache with a warning when fresh load fails", async () => {
    const { executor } = createGithubExecutor({
      repos: [createRawRepo()],
    });
    configureGithubDashboardForTests(executor);

    const fresh = await getGithubDashboard({ force: true, scanLimit: 8 });

    const failingExecutor = vi.fn(async () => {
      const error = new Error("GitHub API returned 503 for user.") as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    });
    setGithubExecutorForTests(failingExecutor);

    const stale = await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(stale.repos).toEqual(fresh.repos);
    expect(stale.warnings.some((w) => w.area === "stale-cache")).toBe(true);
    expect(
      stale.warnings.some((w) => w.message.includes("temporarily unavailable")),
    ).toBe(true);
  });
});

describe("getPublicGithubDashboard", () => {
  it("loads public profile quick data without an OAuth Authorization header", async () => {
    delete process.env.GITHUB_PUBLIC_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_not_for_public_profiles";
    process.env.GH_TOKEN = "ghp_not_for_public_profiles";
    const fetchMock = vi.fn(
      async (...[input]: [string | URL | Request, RequestInit?]) => {
        const url = input.toString();
        if (url.endsWith("/users/buluma")) {
          return jsonResponse({
            login: "buluma",
            name: "saburo",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/buluma",
          });
        }
        if (
          url.endsWith("/users/buluma/repos?per_page=8&sort=pushed&type=owner")
        ) {
          return jsonResponse([
            createRawRepo({
              visibility: "public",
              private: false,
            }),
          ]);
        }
        throw new Error(`Unhandled fetch ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getPublicGithubDashboard("buluma", {
      force: true,
      quick: true,
      scanLimit: 8,
    });

    expect(payload.viewer.login).toBe("buluma");
    expect(payload.repos).toHaveLength(1);
    expect(payload.repos[0]).toMatchObject({
      fullName: "buluma/active-repo",
      visibility: "public",
      isPrivate: false,
    });
    expect(payload.billing.available).toBe(false);
    expect(
      fetchMock.mock.calls.every(([, init]) => {
        const headers = (init as RequestInit | undefined)?.headers as
          Record<string, string> | undefined;
        return headers?.Authorization === undefined;
      }),
    ).toBe(true);
  });

  it("uses only GITHUB_PUBLIC_TOKEN for hosted public profile requests", async () => {
    process.env.GITHUB_PUBLIC_TOKEN = "ghp_public_rate_token";
    process.env.GITHUB_TOKEN = "ghp_not_for_public_profiles";
    process.env.GH_TOKEN = "ghp_not_for_public_profiles";
    const fetchMock = vi.fn(
      async (...[input]: [string | URL | Request, RequestInit?]) => {
        const url = input.toString();
        if (url.endsWith("/users/buluma")) {
          return jsonResponse({
            login: "buluma",
            name: "saburo",
            avatar_url: "https://example.com/avatar.png",
            html_url: "https://github.com/buluma",
          });
        }
        if (
          url.endsWith("/users/buluma/repos?per_page=8&sort=pushed&type=owner")
        ) {
          return jsonResponse([
            createRawRepo({
              visibility: "public",
              private: false,
            }),
          ]);
        }
        throw new Error(`Unhandled fetch ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await getPublicGithubDashboard("buluma", {
      force: true,
      quick: true,
      scanLimit: 8,
    });

    expect(
      fetchMock.mock.calls.every(([, init]) => {
        const headers = (init as RequestInit | undefined)?.headers as
          Record<string, string> | undefined;
        return headers?.Authorization === "Bearer ghp_public_rate_token";
      }),
    ).toBe(true);
  });
});

describe("getGithubDashboard pagination completeness", () => {
  it("keeps partial repo pages when hosted REST pagination reaches the cap", async () => {
    const repos = [
      createRawRepo(),
      createRawRepo({
        id: 2,
        name: "partial-repo",
        full_name: "buluma/partial-repo",
        html_url: "https://github.com/buluma/partial-repo",
      }),
    ];
    const { executor } = createGithubExecutor({
      repos,
      reposError: new PaginationLimitError("/user/repos", 2, [
        [repos[0]],
        [repos[1]],
      ]),
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(payload.repos.map((repo) => repo.fullName)).toEqual([
      "buluma/active-repo",
      "buluma/partial-repo",
    ]);
    expect(payload.warnings).toContainEqual({
      area: "repos",
      message:
        "Repository list reached the hosted pagination limit; dashboard data is partial.",
    });
  });

  it("fetches enough GraphQL count pages to cover the repo list", async () => {
    const repos = createRawRepos(201);
    const { calls, executor } = createGithubExecutor({
      repos,
      graphqlPageSize: 50,
    });
    configureGithubDashboardForTests(executor);

    await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(calls.filter((call) => call.endpoint === "graphql")).toHaveLength(5);
  });

  it("keeps small account GraphQL count enrichment to one page", async () => {
    const repos = createRawRepos(2);
    const { calls, executor } = createGithubExecutor({
      repos,
      graphqlPageSize: 50,
    });
    configureGithubDashboardForTests(executor);

    await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(calls.filter((call) => call.endpoint === "graphql")).toHaveLength(1);
  });

  it("warns and leaves counts unknown when the GraphQL repo-count cap is reached", async () => {
    const repos = createRawRepos(1001);
    const { calls, executor } = createGithubExecutor({
      repos,
      graphqlPageSize: 50,
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const lastRepo = payload.repos.find(
      (repo) => repo.fullName === "buluma/repo-1001",
    );

    expect(calls.filter((call) => call.endpoint === "graphql")).toHaveLength(
      20,
    );
    expect(payload.warnings).toContainEqual({
      area: "repo counts",
      message:
        "Repository count enrichment reached the GraphQL pagination limit; some repository counts are unknown.",
    });
    expect(lastRepo).toMatchObject({
      openIssues: null,
      openPullRequests: null,
      checkState: null,
    });
  });

  it("does not use REST open issue fallback counts when full GraphQL enrichment fails", async () => {
    const repos = [createRawRepo({ open_issues_count: 7 })];
    const { executor } = createGithubExecutor({
      repos,
      graphqlError: new Error("GraphQL request failed."),
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });

    expect(payload.repos[0]).toMatchObject({
      openIssues: null,
      openPullRequests: null,
      checkState: null,
    });
    expect(
      payload.warnings.some((warning) => warning.area === "repo counts"),
    ).toBe(true);
  });
});

describe("getGithubDashboard workflow run warnings", () => {
  it("keeps successful workflow runs when another repo fails", async () => {
    const repos = [
      createRawRepo(),
      createRawRepo({
        id: 2,
        name: "failing-repo",
        full_name: "buluma/failing-repo",
        html_url: "https://github.com/buluma/failing-repo",
      }),
    ];
    const { executor } = createGithubExecutor({
      repos,
      workflowRunsByRepo: {
        "buluma/active-repo": [createRawWorkflowRun()],
      },
      workflowRunFailuresByRepo: {
        "buluma/failing-repo": new Error(
          "Resource not accessible by integration token ghp_fake_secret",
        ),
      },
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const ciWarnings = payload.warnings.filter(
      (warning) => warning.area === "ci",
    );

    expect(payload.ciRuns.map((run) => run.repo)).toEqual([
      "buluma/active-repo",
    ]);
    expect(
      payload.repos.find((repo) => repo.fullName === "buluma/active-repo")
        ?.latestRun?.name,
    ).toBe("CI");
    expect(ciWarnings.map((warning) => warning.message)).toContain(
      "Workflow runs could not be loaded for 1 of 2 scanned repositories: buluma/failing-repo.",
    );
    expect(
      ciWarnings.map((warning) => warning.message).join("\n"),
    ).not.toContain("ghp_fake_secret");
  });

  it("reports all workflow run fetch failures separately from empty runs", async () => {
    const repos = [
      createRawRepo(),
      createRawRepo({
        id: 2,
        name: "failing-repo",
        full_name: "buluma/failing-repo",
        html_url: "https://github.com/buluma/failing-repo",
      }),
    ];
    const { executor } = createGithubExecutor({
      repos,
      workflowRunFailuresByRepo: {
        "buluma/active-repo": new Error("HTTP 403 ghp_fake_secret"),
        "buluma/failing-repo": new Error("HTTP 500 ghp_fake_secret"),
      },
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const ciMessages = payload.warnings
      .filter((warning) => warning.area === "ci")
      .map((warning) => warning.message);

    expect(payload.ciRuns).toEqual([]);
    expect(ciMessages).toContain(
      "Workflow runs could not be loaded for 2 of 2 scanned repositories: buluma/active-repo, buluma/failing-repo.",
    );
    expect(ciMessages).toContain(
      "No workflow runs were returned from scanned repositories.",
    );
    expect(ciMessages[0]).not.toBe(
      "No workflow runs were returned from scanned repositories.",
    );
    expect(ciMessages.join("\n")).not.toContain("ghp_fake_secret");
  });

  it("limits workflow run failure warnings to three repo names", async () => {
    const repos = [
      createRawRepo(),
      createRawRepo({
        id: 2,
        name: "repo-two",
        full_name: "buluma/repo-two",
        html_url: "https://github.com/buluma/repo-two",
      }),
      createRawRepo({
        id: 3,
        name: "repo-three",
        full_name: "buluma/repo-three",
        html_url: "https://github.com/buluma/repo-three",
      }),
      createRawRepo({
        id: 4,
        name: "repo-four",
        full_name: "buluma/repo-four",
        html_url: "https://github.com/buluma/repo-four",
      }),
    ];
    const { executor } = createGithubExecutor({
      repos,
      workflowRunFailuresByRepo: {
        "buluma/active-repo": new Error("HTTP 403 ghp_fake_secret"),
        "buluma/repo-two": new Error("HTTP 403 ghp_fake_secret"),
        "buluma/repo-three": new Error("HTTP 403 ghp_fake_secret"),
        "buluma/repo-four": new Error("HTTP 403 ghp_fake_secret"),
      },
    });
    configureGithubDashboardForTests(executor);

    const payload = await getGithubDashboard({ force: true, scanLimit: 8 });
    const ciMessages = payload.warnings
      .filter((warning) => warning.area === "ci")
      .map((warning) => warning.message);

    expect(ciMessages).toContain(
      "Workflow runs could not be loaded for 4 of 4 scanned repositories: buluma/active-repo, buluma/repo-two, buluma/repo-three, and 1 more.",
    );
    expect(ciMessages.join("\n")).not.toContain("buluma/repo-four");
    expect(ciMessages.join("\n")).not.toContain("ghp_fake_secret");
  });
});


describe("dashboard request ownership and enrichment", () => {
  it("does not let an older normal load overwrite a forced full cache", async () => {
    const { executor } = createGithubExecutor({ repos: [createRawRepo({ name: "new", full_name: "buluma/new" })] });
    let release!: (value: string) => void;
    let reposRequested!: () => void;
    const started = new Promise<void>((resolve) => { reposRequested = resolve; });
    let first = true;
    configureGithubDashboardForTests(async (args, endpoint) => {
      if (endpoint.startsWith("/user/repos?") && first) {
        first = false;
        reposRequested();
        return new Promise<string>((resolve) => { release = resolve; });
      }
      return executor(args, endpoint);
    });
    const old = getGithubDashboard({ scanLimit: 8 });
    await started;
    const fresh = await getGithubDashboard({ force: true, scanLimit: 8 });
    release(JSON.stringify([[createRawRepo({ name: "old", full_name: "buluma/old" })]]));
    await old;
    const cached = await getGithubDashboard({ scanLimit: 8 });
    expect(cached.repos.map((repo) => repo.fullName)).toEqual(fresh.repos.map((repo) => repo.fullName));
    expect(cached.repos[0].fullName).toBe("buluma/new");
  });

  it("revalidates advanced activity, retains a failed value, and retries", async () => {
    const raw = createRawRepo();
    const { executor, calls } = createGithubExecutor({ repos: [raw] });
    let message = "Original commit";
    let fail = false;
    configureGithubDashboardForTests(async (args, endpoint) => {
      if (endpoint.endsWith("/commits?per_page=1")) {
        calls.push({ args, endpoint });
        if (fail) throw new Error("private upstream failure");
        return JSON.stringify([createRawCommit(message)]);
      }
      return executor(args, endpoint);
    });
    await getGithubDashboard({ force: true, scanLimit: 8 });
    await getGithubDashboard({ force: true, scanLimit: 8 });
    expect(calls.filter((call) => call.endpoint.endsWith("/commits?per_page=1"))).toHaveLength(1);
    raw.pushed_at = new Date(Date.parse(raw.pushed_at as string) + 1000).toISOString();
    fail = true;
    const failed = await getGithubDashboard({ force: true, scanLimit: 8 });
    expect(failed.repos[0].latestCommit?.message).toBe("Original commit");
    expect(failed.warnings).toContainEqual({ area: "repo details", message: "Latest commit refresh failed for 1 repositories." });
    fail = false;
    message = "New commit";
    const recovered = await getGithubDashboard({ force: true, scanLimit: 8 });
    expect(recovered.repos[0].latestCommit?.message).toBe("New commit");
    expect(calls.filter((call) => call.endpoint.endsWith("/commits?per_page=1"))).toHaveLength(3);
  });

  it("keeps valid GraphQL nodes while warning about partial errors on a later page", async () => {
    const { executor } = createGithubExecutor({ repos: createRawRepos(51), graphqlPageSize: 50 });
    let page = 0;
    configureGithubDashboardForTests(async (args, endpoint) => {
      const output = await executor(args, endpoint);
      if (endpoint !== "graphql") return output;
      page++;
      return page === 2 ? JSON.stringify({ ...JSON.parse(output), errors: [{ message: "private upstream information" }] }) : output;
    });
    const result = await getGithubDashboard({ force: true, scanLimit: 8 });
    expect(result.repos).toHaveLength(51);
    expect(result.repos.every((repo) => repo.openPullRequests === 0)).toBe(true);
    expect(result.warnings.some((warning) => warning.area === "repo counts" && warning.message.includes("partial GraphQL"))).toBe(true);
    expect(JSON.stringify(result.warnings)).not.toContain("private upstream information");
  });

  it("bounds a cold public quick-plus-full flow for 24 active repositories", async () => {
    const repos = createRawRepos(24, { pushed_at: new Date().toISOString(), updated_at: new Date().toISOString(), visibility: "public", private: false });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("/users/buluma/repos?")) return jsonResponse(repos);
      if (url.endsWith("/users/buluma")) return jsonResponse({ login: "buluma", avatar_url: "", html_url: "https://github.com/buluma" });
      if (url.includes("/commits?")) return jsonResponse([createRawCommit("Public commit")]);
      if (url.includes("/actions/runs?")) return jsonResponse({ workflow_runs: [] });
      if (url.includes("/search/issues?")) return jsonResponse({ items: [] });
      throw new Error(`Unexpected endpoint ${url}`);
    });
    configureGithubDashboardForTests(null);
    vi.stubGlobal("fetch", fetchMock);
    await getPublicGithubDashboard("buluma", { quick: true });
    const quickCalls = fetchMock.mock.calls.length;
    const full = await getPublicGithubDashboard("buluma");
    expect(full.scanLimit).toBe(16);
    expect(fetchMock.mock.calls.length - quickCalls).toBeLessThanOrEqual(50);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(60);
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().includes("/pulls?"))).toHaveLength(0);
    expect(full.recentCommits).toHaveLength(16);
  });
});
