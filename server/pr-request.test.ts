import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { expect, it } from "vitest";
import { parsePullRequestPath, readMergeRequest } from "./pr-request.ts";

function request(chunks: string[]) {
  return Readable.from(chunks.map((chunk) => Buffer.from(chunk))) as unknown as IncomingMessage;
}

it("bounds chunked bodies using bytes rather than characters or Content-Length", async () => {
  await expect(readMergeRequest(request(["x".repeat(3000), "x".repeat(1097)]))).rejects.toMatchObject({ status: 413 });
  await expect(readMergeRequest(request(["é".repeat(2049)]))).rejects.toMatchObject({ status: 413 });
});

it.each(["merge", "squash", "rebase"])("accepts a valid %s request", async (mergeMethod) => {
  const value = { owner: "me", repo: "app", pullNumber: 12, mergeMethod };
  expect(await readMergeRequest(request([JSON.stringify(value)]))).toEqual(value);
});

it("rejects malformed PR paths and encoded traversal", () => {
  for (const path of ["/api/pr-detail/me/app/-1", "/api/pr-detail/me/app/1.5", "/api/pr-detail/me/app/Infinity",
    "/api/pr-detail/me/%2E%2E/1", "/api/pr-detail/me/%2Fapp/1", "/api/pr-detail/me/app/1/extra"]) {
    expect(() => parsePullRequestPath(path)).toThrow();
  }
  expect(parsePullRequestPath("/api/pr-detail/me/app/12")).toEqual({ owner: "me", repo: "app", pullNumber: 12 });
});
