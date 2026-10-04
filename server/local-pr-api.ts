import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchPullRequestDetail, mergePullRequest } from "./github-client.ts";
import { isLocalDashboardRequest, LOCAL_DASHBOARD_ONLY_MESSAGE } from "./local-access.ts";
import { parsePullRequestPath, PrRequestError, readMergeRequest } from "./pr-request.ts";

function loadGhToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.env.GH_BIN || "gh", ["auth", "token", "--hostname", "github.com"],
      { timeout: 10_000, maxBuffer: 8192 }, (error, stdout) => {
        // Do not retain stderr/stdout on an authentication error: it may contain credentials.
        if (error || !stdout.trim()) {
          reject(new Error("GitHub CLI authentication is unavailable. Run gh auth login."));
        } else resolve(stdout.trim());
      });
  });
}

export function createLocalPrHandler(getToken = loadGhToken) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const isMerge = url.pathname === "/api/merge-pr";
    if (!isMerge && !url.pathname.startsWith("/api/pr-detail/")) { next(); return; }
    const send = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    };
    if (!isLocalDashboardRequest(req)) { send(403, { message: LOCAL_DASHBOARD_ONLY_MESSAGE }); return; }
    if (req.method !== (isMerge ? "POST" : "GET")) {
      res.setHeader("Allow", isMerge ? "POST" : "GET");
      send(405, { message: "Method not allowed." }); return;
    }
    const fetchSite = req.headers["sec-fetch-site"];
    if (isMerge && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      send(403, { message: "Merge must be initiated from the dashboard." }); return;
    }
    try {
      const target = isMerge ? await readMergeRequest(req) : parsePullRequestPath(url.pathname);
      const token = await getToken();
      const result = isMerge
        ? { success: true, ...await mergePullRequest({ token, ...target }) }
        : await fetchPullRequestDetail({ token, ...target });
      send(200, result);
    } catch (error) {
      const status = error instanceof PrRequestError ? error.status : (error as { status?: number }).status ?? 500;
      send(status, { message: error instanceof Error ? error.message : "GitHub request failed." });
    }
  };
}
