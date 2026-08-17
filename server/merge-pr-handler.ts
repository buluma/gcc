import {
  isOAuthConfigured,
  oauthUnavailablePayload,
  SESSION_COOKIE,
  sendExpiredSession,
  sendJson,
  sendRateLimit,
  isSessionIdRevoked,
} from "./hosted-server.ts"
import { openSession, parseCookies } from "./session.ts"
import type { HostedServerDependencies } from "./hosted-server.ts"
import type { IncomingMessage, ServerResponse } from "node:http"

export async function handleMergePR(
  dependencies: HostedServerDependencies,
  req: IncomingMessage,
  res: ServerResponse
) {
  if (!isOAuthConfigured(dependencies)) {
    res.setHeader("x-gcc-auth", "oauth")
    sendJson(res, 503, oauthUnavailablePayload())
    return
  }

  const cookies = parseCookies(req.headers.cookie)
  const session = cookies[SESSION_COOKIE] ? openSession(cookies[SESSION_COOKIE], dependencies.sessionKey) : null

  if (!session) {
    res.setHeader("x-gcc-auth", "oauth")
    sendJson(res, 401, { message: "Sign in with GitHub to merge PRs.", loginUrl: "/auth/login" })
    return
  }

  if (isSessionIdRevoked(session.id)) {
    sendExpiredSession(dependencies, res)
    return
  }

  // Rate limit merge requests
  const limit = dependencies.rateLimiters.fullDashboard.check(`merge-pr:${session.login}`)
  if (!limit.allowed) {
    sendRateLimit(res, limit, { authHeader: "oauth" })
    return
  }

  // Read request body
  let body: string
  try {
    body = await readBody(req)
  } catch {
    sendJson(res, 400, { message: "Failed to read request body." })
    return
  }

  let parsed: { owner: string; repo: string; pullNumber: number; mergeMethod?: "merge" | "squash" | "rebase" }
  try {
    parsed = JSON.parse(body)
  } catch {
    sendJson(res, 400, { message: "Invalid JSON body." })
    return
  }

  const { owner, repo, pullNumber, mergeMethod } = parsed
  if (!owner || !repo || !pullNumber) {
    sendJson(res, 400, { message: "Missing required fields: owner, repo, pullNumber." })
    return
  }

  try {
    const { mergePullRequest } = await import("./github-client.ts")
    const result = await mergePullRequest({
      token: session.token,
      owner,
      repo,
      pullNumber,
      mergeMethod: mergeMethod ?? "squash",
    })
    res.setHeader("x-gcc-auth", "oauth")
    sendJson(res, 200, { success: true, ...result })
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 401) {
      sendExpiredSession(dependencies, res)
      return
    }
    if (status === 403) {
      sendJson(res, 403, { message: "Insufficient permissions. The token needs 'repo' scope." })
      return
    }
    if (status === 404) {
      sendJson(res, 404, { message: "Pull request not found." })
      return
    }
    if (status === 405) {
      sendJson(res, 405, { message: "Pull request cannot be merged (conflicts or already merged)." })
      return
    }
    if (status === 422) {
      const message = error instanceof Error ? error.message : "Pull request is not mergeable."
      sendJson(res, 422, { message })
      return
    }
    dependencies.logger.error("Merge PR failed:", error)
    sendJson(res, 500, { message: "Merge failed. Try again shortly." })
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}