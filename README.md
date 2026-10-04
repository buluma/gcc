# GitHub Command Center

A focused GitHub homepage for pull requests, issues, commits, CI failures, and
Actions billing across all your repositories.

Source and support: [buluma/gcc](https://github.com/buluma/gcc).

The root page opens public dashboards at `/username`, a fixture-backed tour at
`/demo`, or the private dashboard at `/dashboard`. Hidden repositories and
dismissed workflow failures persist in the browser. Click the Needs Attention
header to collapse or expand its list; the total and critical counts stay visible.
Dashboard search filters loaded repositories, PRs, issues, commits, and workflow
runs (including Needs Attention and Activity). Match repository names, titles or
messages, authors, PR/issue numbers, labels, commit SHAs, or workflow names and
branches. Search does not fetch older GitHub history.

PR details and squash merges use the same authenticated identity as the private
dashboard: local `gh` credentials in dev/preview, or your hosted OAuth session.
Local PR actions do not require a second server. Public PR titles open GitHub;
the demo opens sample details without API calls. Public and demo views do not
offer merge controls. PR detail failures display their message and a retry
button. Review requests count as yours only when you are directly requested or
belong to a requested team; stale scores use the last update time.

## Runtime modes

| Mode | Authentication | Best for |
| --- | --- | --- |
| Local Vite | Authenticated GitHub CLI | Personal use on one machine |
| Hosted public | None for `/username` | Public Cloudflare hosting |
| Standalone hosted OAuth | GitHub OAuth | Private repositories and billing |

The project supports Node.js 24 LTS only. `.nvmrc` and the Docker image pin the
same runtime.

## Local development

Requirements: Node.js 24.18.0, Bun 1.4.0, and an authenticated GitHub CLI.

```sh
nvm use
gh auth status
gh auth refresh -h github.com -s user,read:org # billing and PR team reviewers
bun install --frozen-lockfile
bun run dev
```

Open [the landing page](http://127.0.0.1:5173),
[the demo](http://127.0.0.1:5173/demo), or
[the local dashboard](http://127.0.0.1:5173/dashboard).

The local API accepts loopback requests only. Vite does not load unprefixed
`.env` values into its Node process; pass local overrides in the command shell:

```sh
GH_BIN=/absolute/path/to/gh bun run dev
```

## Hosted modes

Public `/username` routes use public GitHub REST data without login. The
Cloudflare Worker is intentionally public-only: `/demo` and `/username` work,
while `/dashboard` reports that OAuth is unavailable. It uses GitHub's anonymous
REST quota and never uploads the local `gh` token.

Build, verify, and deploy the public Worker:

```sh
nvm use
bun install --frozen-lockfile
bun run check
bun run deploy
# Set WORKER_URL to the HTTPS URL printed by Wrangler.
export WORKER_URL=https://github-command-center.YOUR_SUBDOMAIN.workers.dev
curl --fail "${WORKER_URL}/healthz"
```

`wrangler.jsonc` is the deployment source of truth. Wrangler uses the authenticated
Cloudflare account's Workers subdomain; no account-specific hostname is committed.
The public Worker does not need `BASE_URL`; standalone OAuth hosts must set it.
`bun run build:worker`
produces public-only homepage copy, `server/worker.ts` routes dynamic requests
through the shared Node HTTP server, and Cloudflare serves the Vite build with
the headers in `public/_headers`.

The standalone Node server supports optional OAuth. Set `GITHUB_PUBLIC_TOKEN`
to raise GitHub's anonymous quota without exposing the token to visitors.

OAuth requests `repo user read:org`; `read:org` is required for team reviewers
in PR details. After a scope change, sign out and sign back in to authorize a
new session. Changing `GITHUB_PUBLIC_TOKEN` does not replace the OAuth token
stored in an existing browser session.

OAuth is optional. It enables `/dashboard`, private repository metadata,
GraphQL-only rollups, workflow runs, and Actions billing. Create a GitHub OAuth
App with `${BASE_URL}/auth/callback` as its callback URL, then configure:

```sh
BASE_URL=https://gcc.example.com
PORT=3000
GITHUB_PUBLIC_TOKEN=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=... # openssl rand -hex 32
```

`bun run start` loads `.env` when it exists. Process environment variables take
precedence. OAuth deployments must use HTTPS; hosted tokens are stored in an
encrypted, httpOnly cookie. Do not add OAuth secrets to `wrangler.jsonc`; the
public Worker does not accept OAuth sessions.

Build and start:

```sh
bun install --frozen-lockfile
bun run build
bun run start
curl --fail http://127.0.0.1:3000/healthz
```

Set `TRUST_PROXY=1` only behind a trusted reverse proxy. See `.env.example` for
the complete environment contract.

## Docker

```sh
docker build -t github-command-center .
docker run --rm -p 3000:3000 \
  -e BASE_URL=http://127.0.0.1:3000 \
  -e GITHUB_PUBLIC_TOKEN=... \
  github-command-center
```

Add the three OAuth variables only when enabling sign-in. The container exposes
and health-checks `/healthz`.

## Verify

```sh
bun run check
bun run audit
```

The required gate runs lint, dead-code analysis, browser and server tests in
their real environments, typechecking, a production build, and a dependency-free
hosted health smoke. Focused commands and the container gate are documented in
[`docs/HARNESS.md`](./docs/HARNESS.md).

## Data and caching

- Local mode uses `gh api`; hosted OAuth uses the signed-in token; public routes
  use only `GITHUB_PUBLIC_TOKEN` or anonymous GitHub REST.
- Full and quick server payloads use short process-local caches.
- Repository detail refreshes are bounded by `scanLimit` and retained for one
  day. Only local mode persists those details under `.cache/`.
- Browser payloads are source-scoped in session storage and expire after ten
  minutes.
- Partial upstream results remain visible through dashboard warnings.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for ownership, security
boundaries, cache invariants, and migration triggers.

## License

[MIT](./LICENSE)
