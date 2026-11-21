export async function diagnose(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
): Promise<{ github: "reachable" | "unreachable"; oauth: "configured" | "disabled" | "incomplete" }> {
  const clientId = Boolean(env.GITHUB_CLIENT_ID)
  const clientSecret = Boolean(env.GITHUB_CLIENT_SECRET)
  const oauth = !clientId && !clientSecret ? "disabled"
    : clientId && clientSecret && (env.SESSION_SECRET?.length ?? 0) >= 32 ? "configured"
      : "incomplete"
  try {
    const headers: Record<string, string> = { "User-Agent": "github-command-center", Accept: "application/vnd.github+json" }
    if (env.GITHUB_PUBLIC_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_PUBLIC_TOKEN}`
    const response = await fetcher("https://api.github.com/rate_limit", { headers, signal: AbortSignal.timeout(10_000) })
    return { github: response.ok ? "reachable" : "unreachable", oauth }
  } catch {
    return { github: "unreachable", oauth }
  }
}
