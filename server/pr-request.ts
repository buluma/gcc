import type { IncomingMessage } from "node:http";
import { GITHUB_LOGIN_PATTERN } from "../src/types/github.ts";
import type { MergePullRequestRequest } from "../src/types/github.ts";

const MAX_MERGE_BODY_BYTES = 4096;

export class PrRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
  }
}

export function parsePullRequestPath(pathname: string) {
  const parts = pathname.split("/");
  if (parts.length !== 6 || parts[1] !== "api" || parts[2] !== "pr-detail") {
    throw new PrRequestError("Invalid pull request path.");
  }
  let owner: string;
  let repo: string;
  try {
    owner = decodeURIComponent(parts[3]);
    repo = decodeURIComponent(parts[4]);
  } catch {
    throw new PrRequestError("Invalid pull request path encoding.");
  }
  if (!/^\d+$/.test(parts[5])) throw new PrRequestError("Invalid pull request number.");
  const pullNumber = Number(parts[5]);
  validatePullRequestTarget(owner, repo, pullNumber);
  return { owner, repo, pullNumber };
}

function validatePullRequestTarget(owner: unknown, repo: unknown, pullNumber: unknown) {
  if (typeof owner !== "string" || !GITHUB_LOGIN_PATTERN.test(owner) ||
      typeof repo !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === ".." ||
      typeof pullNumber !== "number" || !Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    throw new PrRequestError("Expected a valid owner, repository, and positive integer pullNumber.");
  }
}

export async function readMergeRequest(req: IncomingMessage): Promise<MergePullRequestRequest> {
  // Check bytes actually received, including requests without Content-Length.
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };
    const onData = (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_MERGE_BODY_BYTES) {
        cleanup();
        req.resume();
        reject(new PrRequestError("Merge request body exceeds 4096 bytes.", 413));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new PrRequestError("Failed to read request body.")); };
    const onAborted = () => { cleanup(); reject(new PrRequestError("Request body was aborted.")); };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new PrRequestError("Invalid JSON body."); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PrRequestError("Expected a JSON object.");
  }
  const { owner, repo, pullNumber, mergeMethod } = parsed as Record<string, unknown>;
  validatePullRequestTarget(owner, repo, pullNumber);
  if (mergeMethod !== undefined && !["merge", "squash", "rebase"].includes(mergeMethod as string)) {
    throw new PrRequestError("mergeMethod must be merge, squash, or rebase.");
  }
  return { owner, repo, pullNumber, mergeMethod: mergeMethod ?? "squash" } as MergePullRequestRequest;
}
