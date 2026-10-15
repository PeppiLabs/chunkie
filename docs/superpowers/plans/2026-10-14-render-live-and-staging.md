# Render Staging (then Live) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put all of Dev-H's code on a new `staging` branch and run it on Render as a fully password-protected staging site, defined in a `render.yaml` Blueprint, without touching `main`. Phase 2, carried out later when the user brings the code into `main`, adds the public live site at `https://chunkie.peppilabs.net`.

**Architecture:**
- The password gate's public landing page becomes opt-in, through `SITE_PUBLIC_LANDING=true`. Staging leaves it unset, so every page except `/healthz` needs the password.
- `render.yaml` defines the project `chunkie` with a `staging` environment. A Vitest test parses it and fails if a secret value appears in it or the staging settings drift.
- Before anything is pushed, generated files are untracked, and the history being pushed for the first time is scanned for secrets.
- Phase 2 adds a `production` environment: a Render Static Site from `main`, with security headers and a content security policy.

**Tech Stack:** Vite 8, React 19, TypeScript 5.9, Vitest 5, Node 22, the `yaml` npm package (new dev dependency, tests only), Render Blueprints, headless Chrome over CDP (Phase 2 local checks).

**Spec:** `docs/superpowers/specs/2026-10-14-render-live-and-staging-design.md`

**Scope agreed with the user (2026-10-14).** It overrides the spec's rollout order where they differ:
- This round creates **staging only**. Nothing public is created.
- **`main` is never touched**: no commits, merges or pushes to it.
- Today's uncommitted work, and every task, is committed on **`Dev-H`**. Then `staging` is created from `Dev-H` and pushed once, after the user's go-ahead.
- The Blueprint is linked to the `staging` branch, the only branch that has `render.yaml`.
- `docs/superpowers/` (these working docs, which contain local machine paths) stays uncommitted.

## Global Constraints

- Never commit to, merge into, rebase or push `main`. Push only `staging`, and only after the user's go-ahead.
- Staging service: `type: web`, `runtime: node`, `name: chunkie-staging`, `plan: free`, `branch: staging`, `autoDeployTrigger: commit`, `buildCommand: npm ci && npm run build`, `startCommand: npm start`, `healthCheckPath: /healthz`. Project `chunkie`, environment `staging`.
- The public landing page is opt-in only when `SITE_PUBLIC_LANDING` is exactly `true`. Any other value, or no value, keeps every page except `/healthz` behind the password. Staging never sets it.
- No secret value in any committed file. In `render.yaml`, `SITE_PASSWORD_HASH` appears only as `sync: false`, with no `value`, and no env var has a `value`.
- Render and DNS changes happen only with the user's explicit go-ahead for that step. Secret values are never printed, pasted into chat or logged; env vars are referred to by name.
- The existing lint baseline (7 errors in `src/lib/chunk.ts` and `src/lib/parse.ts`, from the merge) is out of scope. Add no new errors.
- Code style: match the surrounding files. Doc comments explain why, no em dashes in prose, test names are plain sentences.

## Review Focus

1. **`SITE_PUBLIC_LANDING=TRUE`, `1` or `yes`:** someone expects these to open the landing page, but they must keep it private. *Pinned in Task 1 (`it.each` over near-miss values).*
2. **A secret pasted into `render.yaml` as `value:`:** it would be committed and pushed. *Pinned in Task 2 ("no env var in render.yaml carries a value"), with a mutation check that the test really fails.*
3. **Staging deployed before `SITE_PASSWORD_HASH` is set:** the gate must refuse to start, so the deploy fails instead of serving an open site. *Already pinned by the existing `refuses to start with the hash %j` tests. Task 5 Step 5 reads the deploy log if the first deploy fails.*
4. **Secrets in commits being pushed to GitHub for the first time:** *Pinned in Task 3 Step 5 (scan of every commit not yet on any remote).*
5. **`staging` created from the wrong base (`main`, or a stale `Dev-H`):** staging would show old code. *Checked in Task 5 Step 2: `staging` must equal `Dev-H`, and `origin/staging` must contain `render.yaml`.*

---

### Task 0: Commit today's work on Dev-H

**Files:** everything currently modified, deleted or untracked in the working tree, **except** `docs/superpowers/`. That covers:
- the landing page split (`app/index.html`, `src/landing.tsx`, `src/lib/siteUrls.ts`, `server/publicPaths.ts` and their tests)
- the gate changes
- the account-system removal
- the README

**Interfaces:**
- Consumes: nothing.
- Produces: a clean `Dev-H` with today's work committed. Tasks 1-4 build on it.

- [ ] **Step 1: Check what will be committed**

Run: `git switch Dev-H && git status --short && git diff --stat HEAD | tail -1`
Expected: you are on `Dev-H`. Every listed path is one of the files described above, or under `app/`, `src/`, `server/`, `public/`, `index.html`, `vite.config.ts` or `README.md`, plus untracked `docs/superpowers/`. If anything else shows up (for example an `.env` file, a build folder or a scratch script), stop and report it.

- [ ] **Step 2: Check the changes for secrets**

Run:

```bash
{ git diff HEAD; git ls-files --others --exclude-standard -- . ':!docs/superpowers' | xargs cat; } \
  | grep -nE "scrypt:[0-9a-f]{32}:[0-9a-f]{64}|BEGIN [A-Z ]*PRIVATE KEY|rnd_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}"
```

Expected: no output. A match means a real-looking hash or key is in the change: stop and report the file and line number. Never print the value itself.

- [ ] **Step 3: Verify it all works**

Run: `npx tsc -b && npx vitest run && npm run build`
Expected: `tsc` prints nothing, all tests pass, and the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A -- . ':!docs/superpowers'
git status --short | grep -v '^?? docs/superpowers' | grep -v '^[MADR] ' || true
git commit -m "Public landing page, visualizer at /app/, and the site password as the only sign-in

The landing page is its own page at / and the visualizer moved to /app/. The
password gate serves the landing page's files through a checked list and keeps
everything else behind the password. The in-app account system from the merge
is removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short
```

Expected: the second command prints nothing, so everything except `docs/superpowers` is staged. After the commit, `git status --short` shows only `?? docs/superpowers/`.

---

### Task 1: The public landing page becomes opt-in

**Files:**
- Modify: `server/passwordGate.ts` (the top doc comment and `passwordGate(env)` at about lines 502-548)
- Modify: `server/__tests__/passwordGate.test.ts` (the `passwordGate on the preview server` block at about lines 415-463, plus a new dev-server block)
- Modify: `server/__tests__/passwordGate.vite.test.ts` (the `createServer` call at about line 71)
- Modify: `.env.example`
- Modify: `README.md` ("The site password" section, about lines 134-162)

**Interfaces:**
- Consumes: `devPublicCheck(root)`, `previewPublicCheck(outDir)` and `NOTHING_PUBLIC` from `server/publicPaths.ts` (unchanged).
- Produces: `passwordGate(env)` reads `env.SITE_PUBLIC_LANDING`. Only the exact string `'true'` enables the public landing page.

- [ ] **Step 1: Make the existing landing-page tests opt in**

In `server/__tests__/passwordGate.test.ts`, inside `describe('passwordGate on the preview server', ...)`, change `startPreview` to take the env it adds:

```ts
  /** Runs the plugin's preview hook against a stand-in server and serves the gate it installs. */
  async function startPreview(extraEnv: Record<string, string> = {}) {
    let installed: Connect.NextHandleFunction | undefined;
    const plugin = passwordGate({ SITE_PASSWORD_HASH: HASH, ...extraEnv });
```

Leave the rest of `startPreview` unchanged. In the test `serves the landing page of the build without a password, and nothing else`, change `const base = await startPreview();` to:

```ts
    const base = await startPreview({ SITE_PUBLIC_LANDING: 'true' });
```

In the test `keeps everything behind the password when the build has no manifest`, change `const base = await startPreview();` to:

```ts
    const base = await startPreview({ SITE_PUBLIC_LANDING: 'true' });
```

In `server/__tests__/passwordGate.vite.test.ts`, change the plugin line to:

```ts
      plugins: [
        passwordGate({
          SITE_PASSWORD_HASH: await hashPassword('test-pass-13v'),
          SITE_PUBLIC_LANDING: 'true',
        }),
      ],
```

- [ ] **Step 2: Write the failing tests**

In `server/__tests__/passwordGate.test.ts`, add these two tests at the end of `describe('passwordGate on the preview server', ...)`:

```ts
  it('keeps the landing page behind the password unless SITE_PUBLIC_LANDING is true', async () => {
    mkdirSync(join(root, 'dist', '.vite'), { recursive: true });
    writeFileSync(join(root, 'dist', '.vite', 'manifest.json'), JSON.stringify(BUILD_MANIFEST));
    const base = await startPreview();

    for (const path of LANDING_BUILD_PATHS) {
      expect((await fetch(base + path)).status, path).toBe(401);
    }
    // The health check stays open, so Render can still see the service is up.
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it.each(['false', 'TRUE', 'True', '1', 'yes', ' true', 'true '])(
    'treats SITE_PUBLIC_LANDING=%j as not public',
    async (value) => {
      mkdirSync(join(root, 'dist', '.vite'), { recursive: true });
      writeFileSync(join(root, 'dist', '.vite', 'manifest.json'), JSON.stringify(BUILD_MANIFEST));
      const base = await startPreview({ SITE_PUBLIC_LANDING: value });
      expect((await fetch(`${base}/`)).status).toBe(401);
    },
  );
```

Add this new `describe` block right after `describe('passwordGate on the preview server', ...)`:

```ts
describe('passwordGate on the dev server', () => {
  let root: string;
  let site: Awaited<ReturnType<typeof serveHandler>> | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'chunkie-dev-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'landing.tsx'), 'export {};');
  });

  afterEach(async () => {
    await site?.stop();
    site = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  /** Runs the plugin's dev hook against a stand-in server and serves the gate it installs. */
  async function startDev(extraEnv: Record<string, string> = {}) {
    let installed: Connect.NextHandleFunction | undefined;
    const plugin = passwordGate({ SITE_PASSWORD_HASH: HASH, ...extraEnv });
    const hook = plugin.configureServer as unknown as (server: unknown) => void;
    hook({
      config: { root, server: {} },
      middlewares: { use: (handler: Connect.NextHandleFunction) => (installed = handler) },
      httpServer: null,
    });
    if (!installed) throw new Error('The plugin did not install the gate.');
    site = await serveHandler(installed);
    return site.base;
  }

  it('keeps the landing page behind the password by default', async () => {
    const base = await startDev();
    expect((await fetch(`${base}/`)).status).toBe(401);
    expect((await fetch(`${base}/src/landing.tsx`)).status).toBe(401);
  });

  it('serves the landing page without a password when SITE_PUBLIC_LANDING is true', async () => {
    const base = await startDev({ SITE_PUBLIC_LANDING: 'true' });
    expect((await fetch(`${base}/`)).status).toBe(200);
    expect((await fetch(`${base}/src/landing.tsx`)).status).toBe(200);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/passwordGate.test.ts`
Expected: FAIL. `keeps the landing page behind the password unless SITE_PUBLIC_LANDING is true` gets 200 instead of 401. Every `treats SITE_PUBLIC_LANDING=...` case gets 200. `keeps the landing page behind the password by default` gets 200. The other tests, including the two that now pass `SITE_PUBLIC_LANDING: 'true'`, still PASS.

- [ ] **Step 4: Implement the opt-in**

In `server/passwordGate.ts`, inside `passwordGate(env)`, replace:

```ts
  const passwordHash = env.SITE_PASSWORD_HASH ?? '';
  // Set once a server starts, when the plugin knows whether it is the dev
  // server or the preview of a build. Until then nothing is public.
  let isPublic: IsPublic = NOTHING_PUBLIC;
```

with:

```ts
  const passwordHash = env.SITE_PASSWORD_HASH ?? '';
  // The landing page is public only when asked for in exactly these words.
  // Anything else, a typo included, keeps every page behind the password, so a
  // missing or mistyped setting can only make a site more private. Staging
  // leaves it unset. The live site is plain files and runs no gate at all.
  const publicLanding = env.SITE_PUBLIC_LANDING === 'true';
  // Set once a server starts, when the plugin knows whether it is the dev
  // server or the preview of a build. Until then nothing is public.
  let isPublic: IsPublic = NOTHING_PUBLIC;
```

In `configureServer`, replace `isPublic = devPublicCheck(server.config.root);` with:

```ts
      if (publicLanding) isPublic = devPublicCheck(server.config.root);
```

In `configurePreviewServer`, replace `isPublic = previewPublicCheck(resolve(server.config.root, server.config.build.outDir));` with:

```ts
      if (publicLanding) {
        isPublic = previewPublicCheck(resolve(server.config.root, server.config.build.outDir));
      }
```

In the module doc comment at the top of the file, replace these three lines:

```ts
 * the password: /healthz, which answers "ok" and nothing else, so an uptime
 * ping or a health check has a page that is not an error, and the landing
 * page with exactly the files it needs (see publicPaths.ts).
```

with:

```ts
 * the password: /healthz, which answers "ok" and nothing else, so an uptime
 * ping or a health check has a page that is not an error, and, only when
 * SITE_PUBLIC_LANDING is "true", the landing page with exactly the files it
 * needs (see publicPaths.ts). Without it, every other page needs the password.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__`
Expected: PASS, every test in `passwordGate.test.ts`, `passwordGate.vite.test.ts` and `publicPaths.test.ts`.

- [ ] **Step 6: Document the setting**

Replace the whole of `.env.example` with:

```bash
# Copy to .env.local, then run: npm run password -- --write
# That prints a new 13 character password once and saves only its hash here,
# so the password itself is never stored on disk. .env.local is git ignored.
SITE_PASSWORD_HASH=

# Leave this out to keep every page behind the password (what staging does).
# Set it to exactly true to show the landing page at / without the password.
# The visualizer and everything else still need it.
# SITE_PUBLIC_LANDING=true
```

In `README.md`, in "The site password", replace the first paragraph, the one beginning "The dev server and the preview server both ask for a password before they serve the visualizer at", with:

```markdown
The dev server and the preview server both ask for a password before they serve anything, apart
from `/healthz`. That is how staging runs. To show the landing page at `/` without the password,
set `SITE_PUBLIC_LANDING=true` in `.env.local`. Then the landing page and exactly the scripts,
styles and fonts it needs are public, and everything else (the visualizer, its workers, the
samples, the concepts guide, and the hot reload connection) still needs the password. Any value
other than exactly `true` keeps the landing page private. Whatever the landing page imports
becomes public when it is on, so keep visualizer code out of `src/landing.tsx` and the
components it uses.
```

In the same section, change the paragraph that begins "For the built site, the list of public files comes from the manifest" so it starts "With `SITE_PUBLIC_LANDING=true`, the built site's list of public files comes from the manifest". Leave the rest of that paragraph as it is.

- [ ] **Step 7: Type check, lint, full suite**

Run: `npx tsc -b && npx eslint server && npx vitest run`
Expected: `tsc` and `eslint server` print nothing, and every test passes.

- [ ] **Step 8: Commit on Dev-H**

```bash
git add server/passwordGate.ts server/__tests__/passwordGate.test.ts server/__tests__/passwordGate.vite.test.ts .env.example README.md
git commit -m "Keep the landing page behind the password unless SITE_PUBLIC_LANDING is true

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The render.yaml Blueprint for staging, and a test that guards it

**Files:**
- Create: `render.yaml`
- Create: `server/__tests__/renderBlueprint.test.ts`
- Modify: `package.json`, `package-lock.json` (dev dependency `yaml`)
- Modify: `README.md` (new "Environments" section)

**Interfaces:**
- Consumes: Task 1's behaviour. Staging gates every page because it does not set `SITE_PUBLIC_LANDING`.
- Produces: `render.yaml` with project `chunkie` and environment `staging` (service `chunkie-staging`). Phase 2 adds environment `production` to the same file, and live tests to the same test file.

- [ ] **Step 1: Add the YAML parser for tests**

Run: `npm install --save-dev yaml@^2`
Expected: `package.json` gains `"yaml": "^2.x.y"` under `devDependencies`, and `package-lock.json` updates. Confirm with `node -e "console.log(require('yaml/package.json').version)"`, which prints a `2.` version.

- [ ] **Step 2: Write the failing test**

Create `server/__tests__/renderBlueprint.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Guards render.yaml, the Blueprint for Chunkie on Render. It checks the
 * staging settings, and that no secret is ever written into the file.
 */

type EnvVar = { key: string; value?: string; sync?: boolean; generateValue?: boolean };
type Service = {
  type: string;
  name: string;
  runtime: string;
  plan?: string;
  branch?: string;
  autoDeployTrigger?: string;
  buildCommand?: string;
  startCommand?: string;
  healthCheckPath?: string;
  envVars?: EnvVar[];
};
type Blueprint = {
  projects: { name: string; environments: { name: string; services: Service[] }[] }[];
};

const ROOT = resolve(__dirname, '../..');
const source = readFileSync(join(ROOT, 'render.yaml'), 'utf8');
const blueprint = parse(source) as Blueprint;
const allServices = blueprint.projects.flatMap((p) => p.environments.flatMap((e) => e.services));

function serviceIn(environment: string): Service {
  const env = blueprint.projects[0].environments.find((e) => e.name === environment);
  if (!env || env.services.length !== 1) throw new Error(`Expected one service in ${environment}.`);
  return env.services[0];
}

const staging = serviceIn('staging');

describe('render.yaml', () => {
  it('has one project, chunkie, with a staging environment', () => {
    expect(blueprint.projects).toHaveLength(1);
    expect(blueprint.projects[0].name).toBe('chunkie');
    expect(blueprint.projects[0].environments.map((e) => e.name)).toEqual(['staging']);
  });

  it('never carries a secret: no env var has a value written here', () => {
    for (const service of allServices) {
      for (const envVar of service.envVars ?? []) {
        expect(envVar.value, `${service.name} ${envVar.key}`).toBeUndefined();
      }
    }
    expect(source).not.toMatch(/scrypt:/);
  });
});

describe('the staging site', () => {
  it('is a password protected web service built from staging', () => {
    expect(staging).toMatchObject({
      type: 'web',
      name: 'chunkie-staging',
      runtime: 'node',
      plan: 'free',
      branch: 'staging',
      autoDeployTrigger: 'commit',
      buildCommand: 'npm ci && npm run build',
      startCommand: 'npm start',
      healthCheckPath: '/healthz',
    });
  });

  it('takes its password hash from the dashboard, and never opens the landing page', () => {
    expect(staging.envVars).toEqual([{ key: 'SITE_PASSWORD_HASH', sync: false }]);
    expect(staging.envVars?.some((v) => v.key === 'SITE_PUBLIC_LANDING')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run server/__tests__/renderBlueprint.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open '.../render.yaml'`.

- [ ] **Step 4: Write `render.yaml`**

Create `render.yaml` at the repo root:

```yaml
# Chunkie on Render.
#
# For now this defines only the password protected staging site, built from
# the staging branch. The public live site (chunkie.peppilabs.net, built from
# main) is added here once main carries this code.
#
# Secrets never go in this file. SITE_PASSWORD_HASH is entered in the Render
# dashboard (sync: false). server/__tests__/renderBlueprint.test.ts checks this
# file on every test run.
projects:
  - name: chunkie
    environments:
      - name: staging
        services:
          # Every page behind the site password, the landing page included:
          # SITE_PUBLIC_LANDING is deliberately not set here.
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

- [ ] **Step 5: Run the test to verify it passes, and that it really guards**

Run: `npx vitest run server/__tests__/renderBlueprint.test.ts`
Expected: PASS, all tests.

Then temporarily add `value: placeholder` under `sync: false` in the `SITE_PASSWORD_HASH` entry and rerun. `never carries a secret` must FAIL. Remove the line, rerun, and confirm it PASSES.

- [ ] **Step 6: Document the environments**

In `README.md`, add this section directly before `### The site password`:

```markdown
### Environments

Chunkie's staging site runs on Render, defined in [`render.yaml`](render.yaml). It is built from
the `staging` branch and redeploys on every commit to it. Every page except `/healthz` is behind
the site password, the landing page included.

The staging password hash is entered in the Render dashboard as `SITE_PASSWORD_HASH`, never in
`render.yaml` or anywhere else in the repository. Make it with `npm run password -- --write` and
copy the hash from `.env.local`. `server/__tests__/renderBlueprint.test.ts` fails if a secret
value ever appears in `render.yaml`.

A public live site at <https://chunkie.peppilabs.net>, built from `main`, will be added to the same
file once `main` carries this code.
```

- [ ] **Step 7: Type check, lint, full suite, build**

Run: `npx tsc -b && npx eslint server && npx vitest run && npm run build`
Expected: `tsc` and `eslint server` print nothing, all tests pass, and the build succeeds.

- [ ] **Step 8: Commit on Dev-H**

```bash
git add render.yaml server/__tests__/renderBlueprint.test.ts package.json package-lock.json README.md
git commit -m "Define the password protected staging site in render.yaml, with a test that guards it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Keep generated files and secrets out of what gets pushed

**Files:**
- Modify: `.gitignore`
- Untrack (files stay on disk): `server/.cache/`, `server/data/processed/`

**Interfaces:**
- Consumes: nothing. Produces: nothing used by code.

- [ ] **Step 1: Confirm nothing uses the folders**

Run: `grep -rn -E "server/data|\.cache/Xenova|data/processed|processed\.json" src server scripts vite.config.ts package.json start-chunkie.bat`
Expected: no output. If anything matches, stop and report it, since a reference means the folder is in use.

- [ ] **Step 2: Ignore them**

In `.gitignore`, add after the `# Build output` block:

```gitignore
# Generated while running the app locally: a downloaded copy of the embedding
# model and processed output. Never part of the repository.
server/.cache/
server/data/processed/
```

- [ ] **Step 3: Untrack them**

Run: `git rm -r --cached --quiet server/.cache server/data/processed && git status --short server | head`
Expected: the files show as `D ` (deleted from the index), and they are still on disk (`ls server/.cache/Xenova` lists them). `git check-ignore server/.cache/Xenova/all-MiniLM-L6-v2/config.json` prints the path.

- [ ] **Step 4: Commit on Dev-H**

```bash
git add .gitignore
git commit -m "Stop tracking the downloaded model and generated output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Scan everything that will be pushed for the first time**

`staging` will carry every commit on `Dev-H`. These commands list the commits that are not yet on any remote and scan their contents:

```bash
git fetch origin
git log --oneline HEAD --not --remotes
git log -p HEAD --not --remotes \
  | grep -nE "scrypt:[0-9a-f]{32}:[0-9a-f]{64}|SITE_PASSWORD=|BEGIN [A-Z ]*PRIVATE KEY|rnd_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}" \
  | sed -E 's/(scrypt:[0-9a-f]{6})[0-9a-f:]*/\1.../; s/(=).{4,}$/\1<redacted>/'
git rev-list --objects HEAD --not --remotes \
  | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' \
  | awk '$1=="blob" && $2>1000000 {print $2, $3}'
```

Expected:
- The commit list is today's commits plus Dev-H's earlier unpushed ones.
- The scan prints nothing, or only obvious test fixtures, such as `SITE_PASSWORD="old-password1"` in `server/__tests__/passwordGate.test.ts`. That is a dummy value the tests use to check that a plain-text password is refused.
- The last command prints no blob over 1 MB. The 23 MB model came from `origin/Updated`, which is already on GitHub, so it is not new.

Any other match: stop and report the commit and file. Never print the value.

---

### Task 4: Check staging locally before anything reaches Render

**Files:** scratch only, never committed. `SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad` already holds:
- `wait.mjs`
- `hash.txt` (a test hash for the password `verify-pass13`)
- `verify-hash.mjs`

If `hash.txt` is missing, run `node $SCRATCH/verify-hash.mjs > $SCRATCH/hash.txt`. Run servers as background commands, wait with `wait.mjs` (never `sleep`), and stop them by port.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: evidence that staging's configuration gates every page.

- [ ] **Step 1: Staging mode, built the way Render builds it**

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && npm run build
```

Start as a background command (no `SITE_PUBLIC_LANDING`, as on staging):

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && SITE_PASSWORD_HASH="$(cat $SCRATCH/hash.txt)" npx vite preview --port 4317 --strictPort
```

Then:

```bash
B=http://localhost:4317; node $SCRATCH/wait.mjs $B
LANDJS=$(grep -o 'src="/assets/[^"]*"' dist/index.html | head -1 | sed 's/src="//;s/"$//')
for p in / /index.html "$LANDJS" /favicon.svg /app/ /concepts.html /samples/friends-chat.json; do
  echo "$(curl -s --path-as-is -o /dev/null -w '%{http_code}' "$B$p") $p"; done
echo "$(curl -s -o /dev/null -w '%{http_code}' $B/healthz) /healthz"
COOKIE=$(curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'password=verify-pass13' $B/ | grep -i '^set-cookie' | sed 's/^[^:]*: //;s/;.*//')
for p in / /app/ /samples/friends-chat.json; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" "$B$p") signed in $p"; done
lsof -ti :4317 | xargs kill
```

Expected: every unsigned line prints `401`, the landing page and favicon included. `/healthz` prints `200`. Every `signed in` line prints `200`.

---

### Task 5: Roll out staging on Render

This task is done by the controller session with the user, not by a subagent. Every ⚡ step needs Render access: the Render MCP server signed in (`/mcp` in an interactive session), or the user working in the dashboard. Every step that changes something outside this machine waits for the user's explicit go-ahead. `main` is never touched.

**Prerequisite:** Tasks 0-4 are done and committed on `Dev-H`, and their reviews are clean.

- [ ] **Step 1: ⚡ Take stock of what is deployed now**

With MCP: `list_workspaces()`, `get_selected_workspace()`, `list_services()`, then `get_service(<id>)` for each Chunkie service. Record in the session for each: name, type, runtime, branch, plan, URL, custom domains and env var names (never values).
Expected outcome: the existing protected site is identified, or there is none. If a service is already named `chunkie-live` or `chunkie-staging`, stop and agree new names with the user before going on. Change them in `render.yaml` and the test together.

- [ ] **Step 2: Create `staging` from Dev-H and push it (one go-ahead from the user)**

```bash
git switch Dev-H && git status --short
git branch staging Dev-H
test "$(git rev-parse staging)" = "$(git rev-parse Dev-H)" && echo "staging matches Dev-H"
git show staging:render.yaml | head -3
git ls-remote origin refs/heads/main
```

Expected: `git status --short` shows only `?? docs/superpowers/`, the check prints `staging matches Dev-H`, and the `render.yaml` header prints. Note the `main` commit shown. Ask the user for the go-ahead, then push only `staging`, naming it explicitly:

```bash
git push -u origin staging
test "$(git ls-remote origin refs/heads/staging | cut -f1)" = "$(git rev-parse staging)" && echo "origin/staging is up to date"
git ls-remote origin refs/heads/main
```

Expected: `origin/staging is up to date`. The `main` line shows the same commit as before the push: `main` is untouched.

- [ ] **Step 3: ⚡ Make a staging password and keep only its hash**

The user runs `npm run password -- --write` locally and keeps the printed password in their password manager. The hash is now in `.env.local`. The user reads it there.

- [ ] **Step 4: ⚡ Create the Blueprint (user)**

The user opens `https://dashboard.render.com/blueprint/new` and connects the `PeppiLabs/chunkie` repository with branch **`staging`**. Render reads `render.yaml` and lists the project `chunkie` with the one service `chunkie-staging`. When Render asks for the `sync: false` value `SITE_PASSWORD_HASH`, the user pastes the hash from Step 3, in the dashboard only, never in chat. Then the user applies the Blueprint.
Expected: `chunkie-staging` starts its first deploy. If Render reports a name conflict with an existing service, stop and return to Step 1's outcome.

- [ ] **Step 5: ⚡ Verify staging**

With MCP `list_deploys(<chunkie-staging id>, 1)`, wait for status `live`. If the deploy fails, read its log with MCP `list_logs` (type `build`, then `deploy`). A missing `SITE_PASSWORD_HASH` makes the gate refuse to start, which is the intended fail-closed behaviour. Set it in the dashboard and redeploy. Then, with `S=<staging onrender URL>`:

```bash
for p in / /index.html /app/ /concepts.html /samples/friends-chat.json; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "$S$p") $p"; done
echo "$(curl -s -o /dev/null -w '%{http_code}' $S/healthz) /healthz"
curl -s -H 'Accept: text/html' $S/ | grep -o 'This site is protected' | head -1
```

Expected: every page prints `401`, `/healthz` prints `200`, and the last line prints `This site is protected`. The user then unlocks staging in a browser with the Step 3 password and checks that the visualizer and a sample load.

- [ ] **Step 6: Leave everything else alone**

Any service that already existed before this task, including one that runs from `main`, is left exactly as it is. Retiring or changing it is a separate decision for the user, made after staging is verified.

---

## Phase 2: the public live site (later)

**Do not start Phase 2 until the user says `main` carries this code**, through their own pull request from `staging` into `main`. Until then these tasks are a record of the agreed design, ready to run. The Blueprint stays linked to the `staging` branch. Adding the `production` environment to `render.yaml` on `staging` makes Render create the live service, which builds from `main`.

Additional constraints for Phase 2, from the spec:
- Live service: `type: web`, `runtime: static`, `name: chunkie-live`, `branch: main`, `autoDeployTrigger: commit`, `buildCommand: npm ci && npm run build && rm -rf dist/.vite`, `staticPublishPath: dist`, `domains: [chunkie.peppilabs.net]`, and a redirect from `/app` to `/app/`.
- Headers on `/*`, exact values:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Strict-Transport-Security: max-age=31536000`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - a `Content-Security-Policy` that never contains `'unsafe-eval'`, a bare `https:`, `*`, or `'unsafe-inline'` in `script-src`, and that contains `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`
- Cache headers: `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable`. `/`, `/index.html`, `/app/`, `/app/index.html` and `/concepts.html` get `Cache-Control: no-cache`.
- No HTML page the live site serves contains an inline `<script>`.

### Task 6: The live site's configuration

**Files:**
- Create: `public/concepts.js`
- Modify: `public/concepts.html`, `render.yaml`, `server/__tests__/renderBlueprint.test.ts`, `README.md`

**Interfaces:**
- Consumes: the Task 2 test file's `Blueprint`, `Service` and `EnvVar` types, and its `source`, `blueprint`, `allServices` and `serviceIn`.
- Produces: environment `production` with service `chunkie-live`. Task 7's local checker reads its `routes`, `headers` and `staticPublishPath`.

- [ ] **Step 1: Move the concepts guide's inline script into its own file**

Create `public/concepts.js` with exactly the code currently between `<script>` and `</script>` in `public/concepts.html`, with the indentation removed:

```js
// Highlights the section you are currently reading in the contents list.
var links = Array.prototype.slice.call(document.querySelectorAll('.index a[href^="#"]'));
var targets = links
  .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
  .filter(Boolean);

if ('IntersectionObserver' in window && targets.length) {
  var seen = new Set();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) seen.add(entry.target.id);
      else seen.delete(entry.target.id);
    });
    // The topmost visible heading wins, so the marker does not jump around.
    var current = targets.filter(function (t) { return seen.has(t.id); })[0];
    links.forEach(function (a) {
      a.classList.toggle('here', !!current && a.getAttribute('href') === '#' + current.id);
    });
  }, { rootMargin: '0px 0px -70% 0px' });
  targets.forEach(function (t) { observer.observe(t); });
}
```

Before deleting the inline block, compare it line by line with `sed -n '/<script>/,/<\/script>/p' public/concepts.html`. If the file has changed since this plan was written, copy the file's current code rather than the block above.

In `public/concepts.html`, replace the whole inline `<script> ... </script>` block with this single line, at the same position, so it still runs after the page's content:

```html
<script src="concepts.js"></script>
```

The relative path matches how this page already links `favicon.svg`. `eslint.config.js` only lints `.ts` and `.tsx` files, so this plain browser script is not linted, and keeps the page's existing `var` style.

- [ ] **Step 2: Write the failing live tests**

In `server/__tests__/renderBlueprint.test.ts`:

1. Change the import line `import { readFileSync } from 'node:fs';` to `import { readdirSync, readFileSync } from 'node:fs';`.
2. Add these types after `type EnvVar`:

```ts
type Header = { path: string; name: string; value: string };
type Route = { type: string; source: string; destination: string };
```

3. Add these optional fields to `type Service`: `staticPublishPath?: string; domains?: string[]; routes?: Route[]; headers?: Header[];`.
4. Replace `const staging = serviceIn('staging');` with:

```ts
const live = serviceIn('production');
const staging = serviceIn('staging');

function header(service: Service, path: string, name: string): string | undefined {
  return service.headers?.find((h) => h.path === path && h.name === name)?.value;
}

/** The CSP as a map of directive name to its list of sources. */
function cspDirectives(): Map<string, string[]> {
  const value = header(live, '/*', 'Content-Security-Policy') ?? '';
  return new Map(
    value
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0])
      .map(([name, ...sources]) => [name, sources]),
  );
}
```

5. Change the first test to expect both environments:

```ts
  it('has one project, chunkie, with a production and a staging environment', () => {
    expect(blueprint.projects).toHaveLength(1);
    expect(blueprint.projects[0].name).toBe('chunkie');
    expect(blueprint.projects[0].environments.map((e) => e.name)).toEqual(['production', 'staging']);
  });
```

6. Add this block before `describe('the staging site', ...)`:

```ts
describe('the live site', () => {
  it('is a public static site built from main at chunkie.peppilabs.net', () => {
    expect(live).toMatchObject({
      type: 'web',
      name: 'chunkie-live',
      runtime: 'static',
      branch: 'main',
      autoDeployTrigger: 'commit',
      staticPublishPath: 'dist',
      domains: ['chunkie.peppilabs.net'],
    });
    expect(live.envVars ?? []).toEqual([]);
  });

  it('drops the build manifest, which only the staging password gate needs', () => {
    expect(live.buildCommand).toBe('npm ci && npm run build && rm -rf dist/.vite');
  });

  it('sends /app on to /app/', () => {
    expect(live.routes).toContainEqual({ type: 'redirect', source: '/app', destination: '/app/' });
  });

  it.each([
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Cross-Origin-Embedder-Policy', 'require-corp'],
    ['Strict-Transport-Security', 'max-age=31536000'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ])('sends %s: %s on every page', (name, value) => {
    expect(header(live, '/*', name)).toBe(value);
  });

  it('has a content security policy with no way around it', () => {
    const csp = cspDirectives();
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
    for (const [name, sources] of csp) {
      expect(sources, name).not.toContain("'unsafe-eval'");
      expect(sources, name).not.toContain('*');
      expect(sources, name).not.toContain('https:');
      expect(sources, name).not.toContain('http:');
    }
  });

  it('caches hashed assets for a year and always revalidates the pages', () => {
    expect(header(live, '/assets/*', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
    for (const path of ['/', '/index.html', '/app/', '/app/index.html', '/concepts.html']) {
      expect(header(live, path, 'Cache-Control'), path).toBe('no-cache');
    }
  });

  it('no page the live site serves has an inline script, which the CSP would block', () => {
    const pages = [
      join(ROOT, 'index.html'),
      join(ROOT, 'app', 'index.html'),
      ...readdirSync(join(ROOT, 'public'))
        .filter((name) => name.endsWith('.html'))
        .map((name) => join(ROOT, 'public', name)),
    ];
    for (const page of pages) {
      const inline = readFileSync(page, 'utf8').match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
      expect(inline, page).toEqual([]);
    }
  });
});
```

Run: `npx vitest run server/__tests__/renderBlueprint.test.ts`
Expected: FAIL with `Expected one service in production.` (the environment does not exist yet).

- [ ] **Step 3: Add the production environment to `render.yaml`**

In `render.yaml`, replace the comment paragraph that begins "For now this defines only the password protected staging site" with:

```yaml
# The public live site (chunkie.peppilabs.net, built from main) and the
# password protected staging site (built from staging).
```

Then insert this block directly before the line `      - name: staging`, keeping its indentation exactly:

```yaml
      - name: production
        services:
          # Public. Plain files from Render's CDN, so no password code runs here.
          - type: web
            name: chunkie-live
            runtime: static
            branch: main
            autoDeployTrigger: commit
            # dist/.vite holds the build manifest, which only the staging
            # password gate reads, so the live site does not publish it.
            buildCommand: npm ci && npm run build && rm -rf dist/.vite
            staticPublishPath: dist
            domains:
              - chunkie.peppilabs.net
            routes:
              - type: redirect
                source: /app
                destination: /app/
            headers:
              # Cross origin isolation lets the embedding model use its faster
              # multi threaded runtime. Same values the dev and preview servers send.
              - path: /*
                name: Cross-Origin-Opener-Policy
                value: same-origin
              - path: /*
                name: Cross-Origin-Embedder-Policy
                value: require-corp
              # HTTPS only. No includeSubDomains, so other peppilabs.net sites are untouched.
              - path: /*
                name: Strict-Transport-Security
                value: max-age=31536000
              - path: /*
                name: X-Content-Type-Options
                value: nosniff
              - path: /*
                name: X-Frame-Options
                value: DENY
              - path: /*
                name: Referrer-Policy
                value: strict-origin-when-cross-origin
              - path: /*
                name: Permissions-Policy
                value: camera=(), microphone=(), geolocation=()
              # Scripts, workers and styles only from this site. Network requests
              # only to this site and to Hugging Face, which hosts the model.
              # 'wasm-unsafe-eval' lets the WASM runtime compile; it does not
              # allow eval() of JavaScript.
              - path: /*
                name: Content-Security-Policy
                value: >-
                  default-src 'self';
                  script-src 'self' 'wasm-unsafe-eval';
                  worker-src 'self' blob:;
                  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                  font-src 'self' https://fonts.gstatic.com;
                  img-src 'self' data: blob:;
                  connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co;
                  object-src 'none';
                  base-uri 'self';
                  form-action 'self';
                  frame-ancestors 'none';
                  upgrade-insecure-requests
              # File names in /assets carry a content hash, so they never change.
              - path: /assets/*
                name: Cache-Control
                value: public, max-age=31536000, immutable
              # Pages are always revalidated, so a deploy shows up at once.
              - path: /
                name: Cache-Control
                value: no-cache
              - path: /index.html
                name: Cache-Control
                value: no-cache
              - path: /app/
                name: Cache-Control
                value: no-cache
              - path: /app/index.html
                name: Cache-Control
                value: no-cache
              - path: /concepts.html
                name: Cache-Control
                value: no-cache
```

`>-` folds the CSP lines into one line joined by spaces, so the header value is `default-src 'self'; script-src ...` on a single line.

- [ ] **Step 4: Run the tests, and check the inline-script guard**

Run: `npx vitest run server/__tests__/renderBlueprint.test.ts`
Expected: PASS, all tests.

Then temporarily add `<script>alert(1)</script>` before `</body>` in `public/concepts.html` and rerun. `no page the live site serves has an inline script` must FAIL. Remove the line again, rerun, and confirm it PASSES.

- [ ] **Step 5: Update the README**

In `README.md`'s "Environments" section, replace the last paragraph, the one beginning "A public live site at", with:

```markdown
The public live site, <https://chunkie.peppilabs.net>, is a Render Static Site built from `main`.
It has no password, and sets its security headers, including a content security policy, in
`render.yaml`. The test also fails if any of those headers goes missing, or if a page gains an
inline script the policy would block. Changes reach live with a pull request from `staging` into
`main`.
```

- [ ] **Step 6: Type check, lint, full suite, build**

Run: `npx tsc -b && npx eslint server && npx vitest run && npm run build`
Expected: `tsc` and `eslint server` print nothing, all tests pass, and the build succeeds. Then confirm the guide still loads its script: `grep -c 'src="concepts.js"' dist/concepts.html` prints `1`, and `dist/concepts.js` exists.

- [ ] **Step 7: Commit on the branch the user names for Phase 2**

```bash
git add public/concepts.js public/concepts.html render.yaml server/__tests__/renderBlueprint.test.ts README.md
git commit -m "Add the public live site to render.yaml, with its security headers and their tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Check the live configuration locally

Same scratch rules as Task 4.

- [ ] **Step 1: Write the Render-like static server**

Create `$SCRATCH/serve-like-render.mjs`:

```js
// Usage: node serve-like-render.mjs <repo> <port>
// Serves <repo>/<staticPublishPath> the way the live Render Static Site will:
// the redirects and headers from render.yaml, index.html for directories, and
// 404 for anything else.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';

const [repo, port] = process.argv.slice(2);
const { parse } = createRequire(join(repo, 'package.json'))('yaml');
const live = parse(readFileSync(join(repo, 'render.yaml'), 'utf8'))
  .projects[0].environments.find((e) => e.name === 'production').services[0];
const root = join(repo, live.staticPublishPath);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8',
};
const matches = (rule, path) => (rule.endsWith('/*') ? path.startsWith(rule.slice(0, -1)) : rule === path);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const r of live.routes ?? []) {
    if (r.type === 'redirect' && r.source === path) {
      res.writeHead(301, { Location: r.destination });
      return res.end();
    }
  }
  for (const h of live.headers ?? []) if (matches(h.path, path)) res.setHeader(h.name, h.value);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(400);
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(Number(port), () => console.log(`serving ${root} like Render on ${port}`));
```

- [ ] **Step 2: Write the browser check**

Create `$SCRATCH/live-check.mjs`:

```js
// Usage: node live-check.mjs <base> <scratch-dir>
// Opens the site in headless Chrome as a visitor would, and reports PASS/FAIL
// for: no password screen, cross origin isolation, a sample embedding end to
// end, and no content security policy violations (page or worker).
import { spawn } from 'node:child_process';

const [B, S] = process.argv.slice(2);
const PORT = 9335;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${S}/chrome-live`,
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, detail);
  if (!ok) failed = true;
};

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json(); } catch { await sleep(300); }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done) => (ws.onopen = done));
  let id = 0;
  const pending = new Map();
  const logs = [];
  const send = (method, params = {}, sessionId) => new Promise((done) => {
    const i = ++id;
    pending.set(i, done);
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Target.attachedToTarget') {
      // Workers report their own CSP violations, so listen to them too.
      const sid = m.params.sessionId;
      send('Log.enable', {}, sid);
      send('Runtime.enable', {}, sid);
      send('Runtime.runIfWaitingForDebugger', {}, sid);
    }
    if (m.method === 'Log.entryAdded') logs.push(m.params.entry.text);
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  };
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const until = async (expr, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr)) return true; await sleep(500); }
    return false;
  };
  const click = (text) => ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));if(b){b.click();return true}return false})()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

  for (const path of ['/', '/concepts.html', '/app/']) {
    await send('Page.navigate', { url: B + path });
    await sleep(2500);
    check(`${path} shows no password screen`, !(await ev(`!!document.querySelector('input[type=password]')`)));
    check(`${path} is cross origin isolated`, (await ev('crossOriginIsolated')) === true);
  }
  check('a sample loads', await click('Two friends'));
  await sleep(1500);
  check('the Embed stage opens', await click('Embed'));
  await sleep(1000);
  check('embedding starts', await click('Generate the vectors'));
  check('embedding finishes', await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Search it')`, 180000));
  const violations = logs.filter((line) => /Content Security Policy|Refused to/i.test(line));
  check('no CSP violations', violations.length === 0, violations.slice(0, 8).join('\n'));
  ws.close();
} finally {
  chrome.kill();
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Live mode, built exactly as Render will build it**

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && npm run build && rm -rf dist/.vite
```

Start as a background command: `node $SCRATCH/serve-like-render.mjs /Users/onlymac/project-py/Py-ject/chunkie 4319`

Then:

```bash
B=http://localhost:4319
curl -s -D - -o /dev/null $B/ | grep -i -E "^(content-security-policy|cross-origin|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cache-control):"
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $B/app
echo "$(curl -s -o /dev/null -w '%{http_code}' $B/.vite/manifest.json) /.vite/manifest.json"
node $SCRATCH/live-check.mjs $B $SCRATCH
```

Expected:
- All eight `/*` headers are printed, plus `cache-control: no-cache` for `/`.
- `/app` prints `301 http://localhost:4319/app/`.
- `/.vite/manifest.json` prints `404`.
- `live-check.mjs` prints only `PASS` lines and exits 0. Embedding downloads about 23 MB from Hugging Face the first time. If that fails for network reasons, rerun once. If it still fails, record it as unverified rather than loosening anything.

Then stop the server: `lsof -ti :4319 | xargs kill`. Remove the browser profile: `rm -rf $SCRATCH/chrome-live`.

- [ ] **Step 4: Only if Step 3 reports CSP violations**

Read each violation and decide with this rule:
- **Violation for `https://cdn.jsdelivr.net/npm/onnxruntime-web@...`:** the ONNX runtime fetched its loader from the CDN. Read the exact version from `node_modules/onnxruntime-web/package.json` (at the time of writing, `1.26.0-dev.20260416-b7804b056c`). Add the version-pinned folder `https://cdn.jsdelivr.net/npm/onnxruntime-web@<that version>/dist/` to both `script-src` and `connect-src` in `render.yaml`. Never allow the bare `https://cdn.jsdelivr.net`.
- **Violation for another Hugging Face host:** add that exact host to `connect-src`.
- **Anything else:** stop and report it with the full violation text. Do not loosen the policy by guesswork.

After any change, rerun `npx vitest run server/__tests__/renderBlueprint.test.ts` (it must still pass, since none of these add a forbidden source) and Step 3. Record the final CSP in the report.

- [ ] **Step 5: Commit any CSP change**

```bash
git add render.yaml
git commit -m "Allow exactly what the embedding runtime loads in the live CSP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Roll out live on Render

Done by the controller session with the user, like Task 5. Every ⚡ step needs Render access, and every outward-facing step waits for the user's go-ahead.

**Prerequisite:** the user has brought the code into `main` themselves, and Tasks 6-7 are committed and pushed to `staging` the same way as Task 5 Step 2.

- [ ] **Step 1: ⚡ Let the Blueprint create the live service**

When `render.yaml` with the `production` environment reaches `origin/staging`, Render's Blueprint sync proposes the new `chunkie-live` service. The user reviews and applies it in the dashboard.
Expected: `chunkie-live` starts its first deploy from `main`.

- [ ] **Step 2: ⚡ Verify live on its `onrender.com` URL, before DNS**

Wait for `chunkie-live`'s deploy to be `live` (MCP `list_deploys`). With `L=<live onrender URL>`:

```bash
curl -s -D - -o /dev/null $L/ | grep -i -E "^(content-security-policy|cross-origin|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cache-control):"
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $L/app
echo "$(curl -s -o /dev/null -w '%{http_code}' $L/.vite/manifest.json) /.vite/manifest.json"
node $SCRATCH/live-check.mjs $L $SCRATCH
```

Expected: the same results as Task 7 Step 3. The headers are all present, `/app` gives a 301 to `/app/`, and the manifest gives 404. On Render's static hosting an unknown path may answer with a page other than 404; it must not be the manifest's JSON. All `live-check` lines PASS. If the CSP blocks something here that it did not block locally, apply Task 7 Step 4's rule, and redeploy through a PR to `staging` and then `main`.

- [ ] **Step 3: DNS (user)**

At the DNS provider for `peppilabs.net`, the user adds a `CNAME` with name `chunkie` and target `<live onrender host>` (shown in the Render dashboard under `chunkie-live` → Settings → Custom Domains). If the DNS is on Cloudflare, set the record to **DNS only** (grey cloud). Then ⚡ click **Verify** for `chunkie.peppilabs.net` in the Render dashboard. If it fails, wait a few minutes for DNS to propagate and retry.
Expected: Render shows the domain verified and issues the certificate.

- [ ] **Step 4: ⚡ Verify the real domain**

Run Step 2's commands with `L=https://chunkie.peppilabs.net`.
Expected: the same results as Step 2.

- [ ] **Step 5: ⚡ One public address (user's go-ahead)**

In the Render dashboard, under `chunkie-live` → Settings → Custom Domains → Render Subdomain, the user sets it to **Disabled**.
Expected: `curl -s -o /dev/null -w '%{http_code}' <live onrender URL>/` prints `404`, and `https://chunkie.peppilabs.net/` still prints `200`.

- [ ] **Step 6: ⚡ Retire the old protected service, if Task 5 Step 1 found one (user's go-ahead)**

Only after Steps 2-5 pass, and Task 5's staging checks, and only on the user's explicit instruction: suspend the old service first, and delete it only when the user asks. Deleting a Render service cannot be undone.
