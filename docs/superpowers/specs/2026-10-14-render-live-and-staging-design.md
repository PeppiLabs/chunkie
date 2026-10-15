# Live and staging environments on Render

Date: 2026-10-14
Status: design approved in conversation, awaiting review of this written spec

## Goal

Chunkie runs in two places on Render:

- **Live** at `https://chunkie.peppilabs.net`. Fully public: landing page,
  visualizer, guide and samples, with no password.
- **Staging**, for checking changes before they go live. Every page, landing
  page included, is behind the "This site is protected" password screen.

Nothing sensitive is published by either one, and the setup lives in git.

## Environments

| | Live (production) | Staging |
|---|---|---|
| Render service | Static Site, `runtime: static`, served from Render's CDN | Web service, `runtime: node`, `npm start` (`vite preview`) |
| Branch | `main` | `staging` |
| Deploys | on every commit to its branch | on every commit to its branch |
| URL | `https://chunkie.peppilabs.net` (plus its `onrender.com` URL until that is turned off) | its `onrender.com` URL |
| Password | none | everything except `/healthz` |
| Plan | free | free (sleeps after 15 minutes idle). Starter keeps it awake |

Both are defined in a `render.yaml` Blueprint at the repo root, as one project
`chunkie` with environments `production` and `staging`.

Release flow: feature branch → pull request into `staging` → check on staging
→ pull request `staging` → `main` → live.

## Code change: the public landing page becomes opt-in

Today any gated server makes the landing page public. Staging must gate
everything, and live runs no gate at all.

- The plugin `passwordGate(env)` makes the landing page public only when
  `env.SITE_PUBLIC_LANDING === 'true'`. For anything else, unset or misspelled,
  nothing is public except `/healthz`, and the `/app` redirect still works.
- The landing-page path lists in `server/publicPaths.ts` and the
  canonical-target rule in the gate are unchanged. They only take effect when
  the variable is set.
- Staging does not set it. Locally, `npm run dev` gates the landing page too,
  unless `SITE_PUBLIC_LANDING=true` is in `.env.local`.
- `.env.example` and the README document the variable.

A missing setting can only make a deployment more private, never less.

## render.yaml

```yaml
projects:
  - name: chunkie
    environments:
      - name: production
        services:
          - type: web
            name: chunkie-live
            runtime: static
            branch: main
            autoDeployTrigger: commit
            buildCommand: npm ci && npm run build && rm -rf dist/.vite
            staticPublishPath: dist
            domains:
              - chunkie.peppilabs.net
            routes:
              - type: redirect
                source: /app
                destination: /app/
            headers: # listed under Security below
      - name: staging
        services:
          - type: web
            name: chunkie-staging
            runtime: node
            plan: free
            branch: staging
            autoDeployTrigger: commit
            buildCommand: npm ci && npm run build
            startCommand: npm start
            healthCheckPath: /healthz
            envVars:
              - key: SITE_PASSWORD_HASH
                sync: false
```

- Node comes from `engines.node` in `package.json` (`>=22.12.0`). Both services
  build with the same `npm run build`.
- Live deletes `dist/.vite` after the build. That folder holds only the build
  manifest, which staging's gate needs and live does not.
- The live service is named `chunkie-live`, not `chunkie`, so it cannot clash with
  whatever the existing service is called. The real names and the plan are
  confirmed against what already exists in the Render workspace before the
  Blueprint is created (see Rollout).

## Security

**Secrets**

- No secret is ever written to `render.yaml`, the README or any committed file.
  `SITE_PASSWORD_HASH` is entered in the Render dashboard (`sync: false`).
- The staging password is made with `npm run password -- --write`, which prints
  it once and stores only the hash in `.env.local`. That file is git-ignored
  (`.env.*`). The same hash goes into Render.
- The Render API key, or the MCP sign-in, stays in Claude Code's MCP
  configuration, never in the repo or in chat.

**What live publishes**

Live publishes the build and the contents of `public/` and nothing else:

- No source maps (Vite's default).
- No `VITE_` variables. None are used, so no server variable reaches the
  browser.
- The samples are synthetic.
- An audit on 2026-10-14 found no secrets in tracked files or in git history.
  The only env file ever committed is `.env.example`.

**Repo hygiene before pushing**

The `origin/Updated` merge committed generated files that do not belong in a
public repo: `server/.cache/` (a 23 MB copy of the embedding model) and
`server/data/processed/` (tool output). Nothing references them. They are
untracked (`git rm --cached`) and added to `.gitignore`. They are not sensitive,
but they are not ours to publish either, and they bloat every clone.

**Live response headers** (set in `render.yaml`)

| Header | Value | Why |
|---|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` | Needed for the fast multithreaded embedding runtime |
| `Cross-Origin-Embedder-Policy` | `require-corp` | Same |
| `Strict-Transport-Security` | `max-age=31536000` | HTTPS only. No `includeSubDomains`, so other peppilabs.net sites are unaffected |
| `X-Content-Type-Options` | `nosniff` | |
| `X-Frame-Options` | `DENY` | No framing (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | The app uses none of these |
| `Content-Security-Policy` | limits scripts, workers, fonts and styles to the site itself, and network requests to the site and Hugging Face's model hosts; `frame-ancestors 'none'` | Limits what injected code could load or send |

- `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`, since
  file names carry content hashes.
- The HTML pages (`/`, `/index.html`, `/app/`, `/app/index.html`,
  `/concepts.html`) get `Cache-Control: no-cache`, so a deploy is picked up at
  once.
- The exact CSP is worked out by loading the live `onrender.com` URL in a
  browser before DNS points at it. The embedding model downloads from
  huggingface.co and its CDN hosts, and the WASM runtime needs
  `'wasm-unsafe-eval'`. The site goes public only when the CSP shows no
  violations and embedding still works.

**Staging**

- Everything is gated, so staging never shows unreleased work. The login page
  already sends `X-Robots-Tag: noindex`.
- The session cookie is `Secure` behind Render's proxy, failed attempts are
  limited per real client IP, and sign-ins last 3 hours. All of this exists
  already.

## Rollout

Steps marked ⚡ need Render access (the Render MCP server signed in, or the
dashboard).

1. ⚡ List the workspace's services. Note which one runs today's protected
   site, plus its branch, URL, plan and env var names (never values).
2. Code changes from this spec are reviewed and land on `main`.
3. Create the `staging` branch from `main` and push it.
4. ⚡ Create the Blueprint from `render.yaml` on `main`. If the existing
   protected service matches staging, rename or adopt it as `chunkie-staging`,
   keeping its URL and password. Otherwise, remove it once the new staging
   passes step 5. Either way, removing a service needs the user's go-ahead.
5. ⚡ Set `SITE_PASSWORD_HASH` on staging. Signed out, every staging URL except
   `/healthz` must show the password screen, the landing page included. After
   Unlock, the visualizer and samples load.
6. ⚡ Live on its `onrender.com` URL, checked in a real browser:
   - every page loads without a password
   - every header in the table above is present
   - `crossOriginIsolated` is `true`
   - a sample embeds
   - the console shows no CSP violations
   - `/app` redirects to `/app/`
7. The user adds `CNAME chunkie → <live service>.onrender.com` at
   peppilabs.net's DNS provider (on Cloudflare, DNS only, grey cloud). ⚡ Verify
   the domain in Render, which then issues the HTTPS certificate.
8. ⚡ Once `https://chunkie.peppilabs.net` passes step 6's checks, turn off the
   live service's `onrender.com` subdomain, so there is one public address.

## Out of scope

- A custom domain for staging (it can be added to `render.yaml` later).
- Pull-request preview environments (`previews.generation` stays `off`).
- Paid plans. The free staging service sleeps, and that is acceptable for
  staging.
