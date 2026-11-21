import { diagnose } from "./diagnostics.ts"

const result = await diagnose(process.env)
console.log(`GitHub API: ${result.github}`)
console.log(`OAuth configuration: ${result.oauth}`)
console.log("OAuth credentials and callback registration are not verified by this check.")
if (result.github !== "reachable" || result.oauth === "incomplete") process.exitCode = 1
