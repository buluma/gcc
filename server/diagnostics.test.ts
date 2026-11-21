import { describe, expect, it, vi } from "vitest"
import { diagnose } from "./diagnostics.ts"

describe("hosted diagnostics", () => {
  it("reports connectivity and OAuth configuration without returning credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    const result = await diagnose({ GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret", SESSION_SECRET: "x".repeat(32) }, fetcher)
    expect(result).toEqual({ github: "reachable", oauth: "configured" })
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("distinguishes unavailable GitHub and incomplete OAuth configuration", async () => {
    const result = await diagnose({ GITHUB_CLIENT_ID: "client" }, vi.fn().mockRejectedValue(new Error("offline")))
    expect(result).toEqual({ github: "unreachable", oauth: "incomplete" })
  })

  it("reports public-only mode", async () => {
    const result = await diagnose({}, vi.fn().mockResolvedValue({ ok: false }))
    expect(result).toEqual({ github: "unreachable", oauth: "disabled" })
  })
})
