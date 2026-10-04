import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { createLocalPrHandler } from "./local-pr-api.ts";
import { fetchPullRequestDetail, mergePullRequest } from "./github-client.ts";
vi.mock("./github-client.ts", () => ({ fetchPullRequestDetail: vi.fn(), mergePullRequest: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

async function runRequest(path: string, method = "GET", body?: string, headers: Record<string, string> = {}, tokenLoader: (() => Promise<string>) | null = async () => "test-local-credential") {
  const token = vi.fn(tokenLoader ?? (async () => "unused"));
  const handler = tokenLoader === null ? createLocalPrHandler() : createLocalPrHandler(token);
  const server = createServer((req, res) => { void handler(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({ hostname: "127.0.0.1", port: (server.address() as AddressInfo).port, path, method, headers }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, body: data }));
      });
      req.on("error", reject);
      req.end(body);
    });
    return { ...result, token };
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

it("loads PR details using the local gh credential without OAuth", async () => {
  vi.mocked(fetchPullRequestDetail).mockResolvedValue({ number: 12 } as Awaited<ReturnType<typeof fetchPullRequestDetail>>);
  expect((await runRequest("/api/pr-detail/me/app/12")).status).toBe(200);
  expect(fetchPullRequestDetail).toHaveBeenCalledWith({ token: "test-local-credential", owner: "me", repo: "app", pullNumber: 12 });
});

it("merges with the local credential and default squash method", async () => {
  vi.mocked(mergePullRequest).mockResolvedValue({ merged: true, message: "Merged" });
  expect((await runRequest("/api/merge-pr", "POST", JSON.stringify({ owner: "me", repo: "app", pullNumber: 12 }))).status).toBe(200);
  expect(mergePullRequest).toHaveBeenCalledWith({ token: "test-local-credential", owner: "me", repo: "app", pullNumber: 12, mergeMethod: "squash" });
});

it("rejects non-loopback hosts, invalid bodies, and same-site mutation before reading credentials", async () => {
  for (const result of [
    await runRequest("/api/pr-detail/me/app/12", "GET", undefined, { Host: "attacker.example" }),
    await runRequest("/api/merge-pr", "POST", "null"),
    await runRequest("/api/merge-pr", "POST", "x".repeat(4097)),
    await runRequest("/api/merge-pr", "POST", "{}", { "Sec-Fetch-Site": "same-site" }),
  ]) {
    expect([400, 403, 413]).toContain(result.status);
    expect(result.token).not.toHaveBeenCalled();
  }
  expect(mergePullRequest).not.toHaveBeenCalled();
  expect(fetchPullRequestDetail).not.toHaveBeenCalled();
});

it("rejects wrong methods and reports unavailable local authentication", async () => {
  const wrongMethod = await runRequest("/api/merge-pr", "GET");
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.token).not.toHaveBeenCalled();
  const result = await runRequest("/api/pr-detail/me/app/12", "GET", undefined, {}, async () => {
    throw new Error("GitHub CLI authentication is unavailable. Run gh auth login.");
  });
  expect(result.status).toBe(500);
  expect(JSON.parse(result.body).message).toContain("gh auth login");
  expect(fetchPullRequestDetail).not.toHaveBeenCalled();
});

it("uses the actual gh subprocess and strips credential output from authentication errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gcc-gh-probe-"));
  const executable = join(directory, "gh");
  vi.stubEnv("GH_BIN", executable);
  try {
    await writeFile(executable, "#!/bin/sh\nprintf 'probe-credential'\n", { mode: 0o700 });
    vi.mocked(fetchPullRequestDetail).mockResolvedValue({ number: 12 } as Awaited<ReturnType<typeof fetchPullRequestDetail>>);
    expect((await runRequest("/api/pr-detail/me/app/12", "GET", undefined, {}, null)).status).toBe(200);
    expect(fetchPullRequestDetail).toHaveBeenCalledWith({ token: "probe-credential", owner: "me", repo: "app", pullNumber: 12 });
    await writeFile(executable, "#!/bin/sh\nprintf 'must-never-leak'\nprintf 'stderr-sensitive' >&2\nexit 1\n");
    const result = await runRequest("/api/pr-detail/me/app/12", "GET", undefined, {}, null);
    expect(result.status).toBe(500);
    expect(result.body).not.toContain("must-never-leak");
    expect(result.body).not.toContain("stderr-sensitive");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
