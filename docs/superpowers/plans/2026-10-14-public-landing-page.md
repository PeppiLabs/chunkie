# Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the landing page at `/` without the site password, and move the visualizer to `/app/` behind it.

**Architecture:** Vite builds two pages: `index.html` (landing) and `app/index.html` (visualizer). The password gate gets an `isPublic(pathname)` option. It is fed by a new `server/publicPaths.ts`, which lists the landing page's files from Vite's build manifest (for preview and Render) or by following the landing page's imports (for dev). Everything not on that list keeps today's behaviour.

**Tech Stack:** Vite 8 (Rolldown), React 19, TypeScript 5.9, Vitest 5, Node 22 `node:http`/`node:fs`.

**Spec:** `docs/superpowers/specs/2026-10-14-public-landing-page-design.md`

## Global Constraints

- Public URL: `/` (landing). Gated URL: `/app/` (visualizer). The `/healthz` and `/logout` behaviour is unchanged.
- The public check applies to `GET` and `HEAD` only. A `POST` to any path is still a login attempt.
- Any pathname containing `%` or `\` is never public. Matching uses the pathname after `new URL()` parsing.
- A missing, unreadable, or old single-page manifest (no `app/index.html` entry) makes nothing public, and the gate logs a warning.
- Dev public set: `/`, `/index.html`, `/favicon.svg`, `/@vite/client`, `/@vite/env`, `/@react-refresh`, the `/node_modules/` prefix, and the files reached by relative imports from `src/landing.tsx` inside `src/`.
- `passwordGate(env)` must still throw immediately on a missing, malformed, or plain-text password (existing tests).
- The hot-reload WebSocket stays password-only. `createUpgradeGuard` is not changed.
- Code style: match the surrounding files. Doc comments explain why, no em dashes in prose, and the test names are plain sentences.
- Lint already fails on 15 errors from the merged `origin/Updated` code. Do not fix them here, and do not add new ones in files this plan touches.

## Review Focus

1. **Stale build on Render or after `git pull`:** `npm start` with a `dist/` built before this change has no manifest, or one without `app/index.html`. Nothing may be public then, because that old `index.html` entry is the whole visualizer. *Pinned in Task 1 ("refuses a manifest without the app page").*
2. **Old bookmarks:** links like `/#visualizer`, `/#login`, `/#register` and `/#forgot-password` now open the landing page. They must forward to `/app/#...`. *Pinned in Task 3 (`appUrlForLegacyHash` tests).*
3. **Windows dev:** `start-chunkie.bat` runs `npm run dev` on Windows, where `path.relative` returns backslashes. Public source paths must use forward slashes or the landing page 401s there. *Pinned in Task 1 ("uses forward slashes on every platform").*
4. **Other HTTP methods:** `OPTIONS`, `PUT` or `DELETE` on a public path must still get 401. *Pinned in Task 2.*
5. **`/app` without the trailing slash:** must reach the visualizer, never the landing page and never a 404. *Checked in Task 4 Steps 3 and 4. Task 4 Step 5 adds a gate redirect and its test only if either check fails.*

---

### Task 1: Public path lists (`server/publicPaths.ts`)

**Files:**
- Create: `server/publicPaths.ts`
- Create: `server/__tests__/manifestFixture.ts`
- Test: `server/__tests__/publicPaths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type IsPublic = (pathname: string) => boolean`
  - `const NOTHING_PUBLIC: IsPublic`
  - `const LANDING_ENTRY = 'src/landing.tsx'`
  - `function landingPathsFromManifest(manifest: unknown): Set<string>`
  - `function previewPublicCheck(outDir: string, warn?: (message: string) => void): IsPublic`
  - `function landingSourcePaths(root: string, entry?: string): Set<string>`
  - `function devPublicCheck(root: string): IsPublic`
  - Test fixture `BUILD_MANIFEST` and `LANDING_BUILD_PATHS` (in `manifestFixture.ts`).

- [ ] **Step 1: Write the manifest fixture**

Create `server/__tests__/manifestFixture.ts`:

```ts
/**
 * A build manifest shaped like Vite's output for the two page build: the
 * landing page and the visualizer share a chunk, and the visualizer alone
 * carries the workers. The shared chunks import each other, as real ones can.
 */
export const BUILD_MANIFEST = {
  'index.html': {
    file: 'assets/landing-AAAA.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_shared-BBBB.js'],
    css: ['assets/landing-CCCC.css'],
    assets: ['assets/geist-DDDD.woff2'],
  },
  'app/index.html': {
    file: 'assets/app-EEEE.js',
    src: 'app/index.html',
    isEntry: true,
    imports: ['_shared-BBBB.js'],
    css: ['assets/app-FFFF.css'],
    assets: ['assets/embedder.worker-GGGG.js', 'assets/pdf.worker.min-HHHH.mjs'],
  },
  '_shared-BBBB.js': {
    file: 'assets/shared-BBBB.js',
    css: ['assets/shared-IIII.css'],
    imports: ['_react-JJJJ.js'],
  },
  '_react-JJJJ.js': {
    file: 'assets/react-JJJJ.js',
    imports: ['_shared-BBBB.js'],
  },
};

/** Everything the landing page in BUILD_MANIFEST needs, and nothing else. */
export const LANDING_BUILD_PATHS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/assets/landing-AAAA.js',
  '/assets/landing-CCCC.css',
  '/assets/geist-DDDD.woff2',
  '/assets/shared-BBBB.js',
  '/assets/shared-IIII.css',
  '/assets/react-JJJJ.js',
];
```

- [ ] **Step 2: Write the failing tests**

Create `server/__tests__/publicPaths.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  devPublicCheck,
  landingPathsFromManifest,
  landingSourcePaths,
  previewPublicCheck,
} from '../publicPaths';
import { BUILD_MANIFEST, LANDING_BUILD_PATHS } from './manifestFixture';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chunkie-public-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes files under `dir`, creating folders as needed. */
function writeTree(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

describe('landingPathsFromManifest', () => {
  it('lists the landing page, its shared chunks, styles and fonts', () => {
    expect([...landingPathsFromManifest(BUILD_MANIFEST)].sort()).toEqual(
      [...LANDING_BUILD_PATHS].sort(),
    );
  });

  it('leaves out the visualizer and its workers', () => {
    const paths = landingPathsFromManifest(BUILD_MANIFEST);
    expect(paths.has('/assets/app-EEEE.js')).toBe(false);
    expect(paths.has('/assets/app-FFFF.css')).toBe(false);
    expect(paths.has('/assets/embedder.worker-GGGG.js')).toBe(false);
    expect(paths.has('/assets/pdf.worker.min-HHHH.mjs')).toBe(false);
  });

  it('refuses a manifest without the app page, since an older build has the whole app at index.html', () => {
    const { 'app/index.html': _app, ...singlePage } = BUILD_MANIFEST;
    expect(landingPathsFromManifest(singlePage).size).toBe(0);
  });

  it.each([undefined, null, 'index.html', 42, {}, { 'index.html': {} }])(
    'makes nothing public for the manifest %j',
    (manifest) => {
      expect(landingPathsFromManifest(manifest).size).toBe(0);
    },
  );
});

describe('previewPublicCheck', () => {
  it('reads the manifest Vite wrote into the build', () => {
    writeTree({ '.vite/manifest.json': JSON.stringify(BUILD_MANIFEST) });
    const isPublic = previewPublicCheck(dir);
    expect(isPublic('/')).toBe(true);
    expect(isPublic('/assets/landing-AAAA.js')).toBe(true);
    expect(isPublic('/assets/app-EEEE.js')).toBe(false);
    expect(isPublic('/app/')).toBe(false);
    expect(isPublic('/concepts.html')).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['not JSON', '{ not json'],
    ['an older single page build', JSON.stringify({ 'index.html': BUILD_MANIFEST['index.html'] })],
  ])('makes nothing public, and says so, when the manifest is %s', (_label, content) => {
    if (content !== undefined) writeTree({ '.vite/manifest.json': content });
    const warn = vi.fn();
    const isPublic = previewPublicCheck(dir, warn);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/npm run build/);
    for (const path of ['/', '/index.html', '/favicon.svg', '/assets/landing-AAAA.js']) {
      expect(isPublic(path), path).toBe(false);
    }
  });
});

describe('landingSourcePaths', () => {
  beforeEach(() => {
    writeTree({
      'src/landing.tsx': [
        "import '@fontsource-variable/geist';",
        "import './index.css';",
        "import { LandingPage } from './components/pages/LandingPage';",
        "import type { Thing } from './types';",
        "export { helper } from './lib/helper';",
        'console.log(import.meta.env.BASE_URL);',
      ].join('\n'),
      'src/index.css': '@import "tailwindcss";',
      'src/components/pages/LandingPage.tsx': [
        'import {',
        '  Button,',
        "} from '../common/Button';",
        "import '../../../outside';",
        'export function LandingPage() {}',
      ].join('\n'),
      'src/components/common/Button.tsx': 'export function Button() {}',
      'src/types.ts': 'export type Thing = string;',
      'src/lib/helper.ts': "import { util } from './util';\nexport const helper = util;",
      'src/lib/util/index.ts': 'export const util = 1;',
      'src/App.tsx': "import './secret';",
      'src/secret.ts': 'export const secret = 1;',
      'outside.ts': 'export {};',
    });
  });

  it('follows relative imports from the landing entry, and nothing else', () => {
    expect([...landingSourcePaths(dir)].sort()).toEqual(
      [
        '/src/landing.tsx',
        '/src/index.css',
        '/src/components/pages/LandingPage.tsx',
        '/src/components/common/Button.tsx',
        '/src/types.ts',
        '/src/lib/helper.ts',
        '/src/lib/util/index.ts',
      ].sort(),
    );
  });

  it('never reaches outside src, even when an import climbs out', () => {
    expect([...landingSourcePaths(dir)].some((path) => path.includes('outside'))).toBe(false);
  });

  it('uses forward slashes on every platform, so Windows dev serves the same paths', () => {
    for (const path of landingSourcePaths(dir)) {
      expect(path).toMatch(/^\/src\//);
      expect(path).not.toContain('\\');
    }
  });

  it('is empty when the entry does not exist', () => {
    expect(landingSourcePaths(dir, 'src/missing.tsx').size).toBe(0);
  });
});

describe('devPublicCheck', () => {
  beforeEach(() => {
    writeTree({
      'src/landing.tsx': "import { LandingPage } from './components/pages/LandingPage';",
      'src/components/pages/LandingPage.tsx': 'export function LandingPage() {}',
      'src/App.tsx': 'export default function App() {}',
    });
  });

  it.each([
    '/',
    '/index.html',
    '/favicon.svg',
    '/@vite/client',
    '/@vite/env',
    '/@react-refresh',
    '/node_modules/.vite/deps/react.js',
    '/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
    '/src/landing.tsx',
    '/src/components/pages/LandingPage.tsx',
  ])('serves %s without a password', (path) => {
    expect(devPublicCheck(dir)(path)).toBe(true);
  });

  it.each(['/src/App.tsx', '/src/main.tsx', '/app/', '/concepts.html', '/samples/x.json', '/@fs/etc/passwd', '/@id/x'])(
    'keeps %s behind the password',
    (path) => {
      expect(devPublicCheck(dir)(path)).toBe(false);
    },
  );

  it('picks up a new import on the landing page without a restart', () => {
    const isPublic = devPublicCheck(dir);
    expect(isPublic('/src/components/common/Card.tsx')).toBe(false);
    writeTree({
      'src/components/common/Card.tsx': 'export function Card() {}',
      'src/components/pages/LandingPage.tsx':
        "import { Card } from '../common/Card';\nexport function LandingPage() {}",
    });
    expect(isPublic('/src/components/common/Card.tsx')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/publicPaths.test.ts`
Expected: FAIL, with `Failed to resolve import "../publicPaths"` (the module does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `server/publicPaths.ts`:

```ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Which paths the password gate serves without a password.
 *
 * Only the landing page is public. Everything it needs to render, and nothing
 * else, is listed here: from Vite's build manifest for a built site, and by
 * following the landing page's imports on the dev server. Whatever the landing
 * page imports becomes public, so keep the visualizer out of it.
 */

export type IsPublic = (pathname: string) => boolean;

/** Every page asks for the password. */
export const NOTHING_PUBLIC: IsPublic = () => false;

/** The landing page's HTML and the site icon. */
const PAGE_PATHS = ['/', '/index.html', '/favicon.svg'];

/** Vite's own client runtime, which the dev server adds to every page. */
const DEV_CLIENT_PATHS = ['/@vite/client', '/@vite/env', '/@react-refresh'];

/** Keys of the two pages in Vite's build manifest, relative to the project root. */
const LANDING_HTML = 'index.html';
const APP_HTML = 'app/index.html';

/** The landing page's script, relative to the project root. */
export const LANDING_ENTRY = 'src/landing.tsx';

type ManifestChunk = { file?: string; css?: string[]; assets?: string[]; imports?: string[] };

/**
 * The URL paths the landing page needs, read from Vite's build manifest.
 *
 * Empty unless the manifest has both pages. A build from before the split has
 * only `index.html`, and there that entry is the whole visualizer, so trusting
 * it would publish the app.
 */
export function landingPathsFromManifest(manifest: unknown): Set<string> {
  const paths = new Set<string>();
  if (typeof manifest !== 'object' || manifest === null) return paths;
  const chunks = manifest as Record<string, ManifestChunk | undefined>;
  if (!chunks[LANDING_HTML]?.file || !chunks[APP_HTML]?.file) return paths;

  const seen = new Set<string>();
  const visit = (key: string) => {
    const chunk = chunks[key];
    if (seen.has(key) || !chunk?.file) return;
    seen.add(key);
    for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
      paths.add(`/${file}`);
    }
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(LANDING_HTML);

  for (const path of PAGE_PATHS) paths.add(path);
  return paths;
}

/**
 * The public set of a built site, from `<outDir>/.vite/manifest.json`. It is
 * read once, when the preview server starts. A missing or unusable manifest
 * makes nothing public, so a bad build keeps the whole site private.
 */
export function previewPublicCheck(
  outDir: string,
  warn: (message: string) => void = console.warn,
): IsPublic {
  const file = join(outDir, '.vite', 'manifest.json');
  let paths = new Set<string>();
  try {
    paths = landingPathsFromManifest(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // Missing or not JSON: handled below, the same as a manifest without the landing page.
  }
  if (paths.size === 0) {
    warn(
      `[password gate] No landing page found in ${file}, so every page asks for the password. ` +
        'Run `npm run build` and start the preview again.',
    );
    return NOTHING_PUBLIC;
  }
  return (pathname) => paths.has(pathname);
}

/** `import x from './a'`, `import './a.css'`, `export { x } from '../b'`, `import type ...`. */
const RELATIVE_IMPORT = /\b(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;

/** How Vite resolves an import written without its extension. */
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

function resolveImport(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

/**
 * The landing page's own source files, as dev server URL paths, found by
 * following relative imports from its entry. Package imports are skipped,
 * since those are served from /node_modules/. Nothing outside `<root>/src` is
 * ever included, and the paths use forward slashes on every platform.
 */
export function landingSourcePaths(root: string, entry = LANDING_ENTRY): Set<string> {
  const srcDir = resolve(root, 'src');
  const paths = new Set<string>();
  const seen = new Set<string>();
  const pending = [resolve(root, entry)];

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file) || !file.startsWith(srcDir + sep) || !existsSync(file)) continue;
    seen.add(file);
    paths.add(`/${relative(root, file).split(sep).join('/')}`);

    // Styles and other files are leaves: their imports are packages, if any.
    if (!/\.[jt]sx?$/.test(file)) continue;
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      const target = resolveImport(file, specifier);
      if (target) pending.push(target);
    }
  }
  return paths;
}

/**
 * The dev server's public set. Vite serves source files one at a time, so the
 * landing page's files are worked out from its imports, again on every request
 * for a /src/ path, so editing the landing page never needs a restart.
 */
export function devPublicCheck(root: string): IsPublic {
  const fixed = new Set([...PAGE_PATHS, ...DEV_CLIENT_PATHS]);
  return (pathname) => {
    if (fixed.has(pathname)) return true;
    // Published packages, such as React and the fonts. Nothing private lives here.
    if (pathname.startsWith('/node_modules/')) return true;
    if (pathname.startsWith('/src/')) return landingSourcePaths(root).has(pathname);
    return false;
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/__tests__/publicPaths.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Type check and lint the new files**

Run: `npx tsc -b && npx eslint server/publicPaths.ts server/__tests__/publicPaths.test.ts server/__tests__/manifestFixture.ts`
Expected: no output from either command. (`_app` is allowed: `eslint.config.js` sets `varsIgnorePattern: '^_'`.)

- [ ] **Step 7: Commit**

```bash
git add server/publicPaths.ts server/__tests__/publicPaths.test.ts server/__tests__/manifestFixture.ts
git commit -m "Work out which files the landing page needs, for the password gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The gate serves public paths without a password

**Files:**
- Modify: `server/passwordGate.ts` (the `GateOptions` type, the request handler in `createPasswordGate`, and the `passwordGate` plugin)
- Test: `server/__tests__/passwordGate.test.ts`

**Interfaces:**
- Consumes: `IsPublic`, `NOTHING_PUBLIC`, `devPublicCheck(root)`, `previewPublicCheck(outDir)` from Task 1; `BUILD_MANIFEST`, `LANDING_BUILD_PATHS` from `server/__tests__/manifestFixture.ts`.
- Produces: `GateOptions.isPublic?: (pathname: string) => boolean`. The `passwordGate(env)` plugin sets it to the dev check in `configureServer` and to the preview check in `configurePreviewServer`.

- [ ] **Step 1: Add the test helpers**

In `server/__tests__/passwordGate.test.ts`:

Change the `node:fs` import to also bring in `mkdirSync`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
```

Add `type Connect` from vite and the fixture, below the existing imports:

```ts
import type { Connect } from 'vite';
import { BUILD_MANIFEST, LANDING_BUILD_PATHS } from './manifestFixture';
```

Replace the existing `serveGate` function with these two functions:

```ts
/** Starts a server running `handler` in front of "the real page", and returns its base URL. */
async function serveHandler(handler: Connect.NextHandleFunction) {
  const server = createServer((req, res) => handler(req, res, () => res.end('the real page')));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: () => new Promise((done) => server.close(done)),
  };
}

/** Starts a server running the gate and returns its base URL and a stop function. */
function serveGate(passwordHash: string, options?: GateOptions) {
  return serveHandler(createPasswordGate(passwordHash, options));
}
```

Add this helper after `postPassword`:

```ts
/** Sends a GET with the path exactly as written. fetch would normalise it first. */
function rawGet(base: string, path: string): Promise<number> {
  return new Promise((done, fail) => {
    const req = request(base, { path }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on('error', fail);
    req.end();
  });
}
```

- [ ] **Step 2: Write the failing gate tests**

Add this `describe` block after the `createPasswordGate behind Render` block:

```ts
describe('createPasswordGate with public paths', () => {
  const PUBLIC = new Set(['/', '/assets/landing.js']);
  let site: Awaited<ReturnType<typeof serveGate>>;
  let base: string;

  beforeEach(async () => {
    site = await serveGate(HASH, {
      isPublic: (pathname) => PUBLIC.has(pathname) || pathname.startsWith('/node_modules/'),
    });
    base = site.base;
  });

  afterEach(async () => {
    await site.stop();
  });

  it('serves a public page and its files without a password', async () => {
    const page = await fetch(`${base}/?from=link`, { headers: { Accept: 'text/html' } });
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('the real page');
    expect((await fetch(`${base}/assets/landing.js`)).status).toBe(200);
    expect((await fetch(`${base}/assets/landing.js`, { method: 'HEAD' })).status).toBe(200);
  });

  it.each(['/app/', '/app', '/assets/app.js', '/concepts.html', '/samples/friends-chat.json'])(
    'keeps %s behind the password',
    async (path) => {
      const res = await fetch(base + path, { headers: { Accept: 'text/html' } });
      expect(res.status).toBe(401);
      expect(await res.text()).toContain('This site is protected');
    },
  );

  it('still treats a POST to a public path as a login attempt', async () => {
    const res = await postPassword(base, 'test-pass-13x', '/');
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('Incorrect password');
  });

  it('signs the visitor in from a public page', async () => {
    const res = await postPassword(base, PASSWORD, '/');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
  });

  it.each(['OPTIONS', 'PUT', 'DELETE'])('keeps a public path behind the password for %s', async (method) => {
    expect((await fetch(`${base}/assets/landing.js`, { method })).status).toBe(401);
  });

  it.each([
    '/node_modules/..%2fsrc/App.tsx',
    '/node_modules/%2e%2e/src/App.tsx',
    '/node_modules/../src/App.tsx',
    '/node_modules\\..\\src\\App.tsx',
    '/assets/landing%2Ejs',
  ])('refuses the disguised path %s', async (path) => {
    expect(await rawGet(base, path)).toBe(401);
  });
});
```

Add this `describe` block right after it:

```ts
describe('passwordGate on the preview server', () => {
  let root: string;
  let site: Awaited<ReturnType<typeof serveHandler>> | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'chunkie-preview-'));
  });

  afterEach(async () => {
    await site?.stop();
    site = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  /** Runs the plugin's preview hook against a stand-in server and serves the gate it installs. */
  async function startPreview() {
    let installed: Connect.NextHandleFunction | undefined;
    const plugin = passwordGate({ SITE_PASSWORD_HASH: HASH });
    const hook = plugin.configurePreviewServer as unknown as (server: unknown) => void;
    hook({
      config: { root, build: { outDir: 'dist' } },
      middlewares: { use: (handler: Connect.NextHandleFunction) => (installed = handler) },
      httpServer: { prependListener: () => undefined },
    });
    if (!installed) throw new Error('The plugin did not install the gate.');
    site = await serveHandler(installed);
    return site.base;
  }

  it('serves the landing page of the build without a password, and nothing else', async () => {
    mkdirSync(join(root, 'dist', '.vite'), { recursive: true });
    writeFileSync(join(root, 'dist', '.vite', 'manifest.json'), JSON.stringify(BUILD_MANIFEST));
    const base = await startPreview();

    for (const path of LANDING_BUILD_PATHS) {
      expect((await fetch(base + path)).status, path).toBe(200);
    }
    for (const path of ['/app/', '/assets/app-EEEE.js', '/assets/embedder.worker-GGGG.js']) {
      expect((await fetch(base + path)).status, path).toBe(401);
    }
  });

  it('keeps everything behind the password when the build has no manifest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await startPreview();
    expect((await fetch(`${base}/`)).status).toBe(401);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/__tests__/passwordGate.test.ts`
Expected: the new tests FAIL. "serves a public page..." gets 401 instead of 200, and the preview tests get 401 for the landing paths. TypeScript-only errors (unknown `isPublic` key) do not fail Vitest, so the failures are the status codes. All existing tests still PASS.

- [ ] **Step 4: Add `isPublic` to the gate**

In `server/passwordGate.ts`, add to the imports at the top:

```ts
import { resolve } from 'node:path';
import { devPublicCheck, type IsPublic, NOTHING_PUBLIC, previewPublicCheck } from './publicPaths.ts';
```

In `GateOptions`, add after `behindRenderProxy`:

```ts
  /**
   * Paths served without a password, asked only for GET and HEAD. It gets the
   * pathname after the URL parser has resolved `.` and `..`, and is never asked
   * about one holding `%` or `\`, so an encoded path cannot reach a different
   * file than the one that was checked.
   */
  isPublic?: IsPublic;
```

In the handler returned by `createPasswordGate`, insert this block between the `hasSession` check and the `// Not signed in.` comment:

```ts
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      options.isPublic &&
      !/[%\\]/.test(url.pathname) &&
      options.isPublic(url.pathname)
    ) {
      next();
      return;
    }
```

- [ ] **Step 5: Wire the plugin**

In `passwordGate(env)`, replace:

```ts
  const gate = createPasswordGate(passwordHash, { behindRenderProxy: env.RENDER === 'true' });
```

with:

```ts
  // Set once a server starts, when the plugin knows whether it is the dev
  // server or the preview of a build. Until then nothing is public.
  let isPublic: IsPublic = NOTHING_PUBLIC;
  const gate = createPasswordGate(passwordHash, {
    behindRenderProxy: env.RENDER === 'true',
    isPublic: (pathname) => isPublic(pathname),
  });
```

In `configureServer(server)`, add this line directly before `server.middlewares.use(gate);`:

```ts
      isPublic = devPublicCheck(server.config.root);
```

In `configurePreviewServer(server)`, add this line directly before `server.middlewares.use(gate);`:

```ts
      isPublic = previewPublicCheck(resolve(server.config.root, server.config.build.outDir));
```

Update the module doc comment at the top of the file. Replace:

```ts
 * Sits in front of every request the dev and preview servers handle, so no
 * page, script, stylesheet or worker is served until the visitor has entered
 * the site password. WebSocket upgrades, such as the dev server's hot reload
 * socket, never pass through middleware, so they are checked separately before
 * Vite sees them. The one exception is /healthz, which answers "ok" and nothing
 * else, so an uptime ping or a health check has a page that is not an error.
```

with:

```ts
 * Sits in front of every request the dev and preview servers handle, so no
 * page, script, stylesheet or worker of the visualizer is served until the
 * visitor has entered the site password. WebSocket upgrades, such as the dev
 * server's hot reload socket, never pass through middleware, so they are
 * checked separately before Vite sees them. Two things get through without
 * the password: /healthz, which answers "ok" and nothing else, so an uptime
 * ping or a health check has a page that is not an error, and the landing
 * page with exactly the files it needs (see publicPaths.ts).
```

- [ ] **Step 6: Run the gate tests to verify they pass**

Run: `npx vitest run server/__tests__`
Expected: PASS, every test in `passwordGate.test.ts` and `publicPaths.test.ts`.

- [ ] **Step 7: Type check and lint**

Run: `npx tsc -b && npx eslint server`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add server/passwordGate.ts server/__tests__/passwordGate.test.ts
git commit -m "Let the landing page through the password gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Split the site into the landing page and the visualizer

**Files:**
- Create: `src/lib/siteUrls.ts`
- Create: `src/lib/__tests__/siteUrls.test.ts`
- Create: `src/landing.tsx`
- Create: `app/index.html`
- Modify: `index.html` (script `src`)
- Modify: `src/App.tsx` (lines 10, 69-99, 113-130, 149-155)
- Modify: `src/lib/samples.ts` (the four `path:` values and the `path` doc comment)
- Modify: `src/lib/__tests__/samples.test.ts` (the `readFileSync` line, plus one new test)
- Modify: `public/concepts.html` (the two `Open the visualizer` links)
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `LANDING_ENTRY = 'src/landing.tsx'` (Task 1 expects the entry at this path); the manifest keys `index.html` and `app/index.html` (Task 1).
- Produces: `LANDING_URL = '/'`, `APP_URL = '/app/'`, `appUrlForLegacyHash(hash: string): string | null` in `src/lib/siteUrls.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/siteUrls.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { APP_URL, LANDING_URL, appUrlForLegacyHash } from '../siteUrls';

describe('site URLs', () => {
  it('puts the landing page at the root and the visualizer under /app/', () => {
    expect(LANDING_URL).toBe('/');
    expect(APP_URL).toBe('/app/');
  });

  it.each([
    ['#visualizer', '/app/#visualizer'],
    ['#pipeline', '/app/#pipeline'],
    ['#app', '/app/#app'],
    ['#login', '/app/#login'],
    ['#Register', '/app/#register'],
    ['#signup', '/app/#signup'],
    ['#forgot-password', '/app/#forgot-password'],
    ['#reset', '/app/#reset'],
  ])('sends an old %s link on to %s', (hash, url) => {
    expect(appUrlForLegacyHash(hash)).toBe(url);
  });

  it.each(['', '#', '#overview', '#landing', '#home', '#how-it-works'])(
    'keeps %j on the landing page',
    (hash) => {
      expect(appUrlForLegacyHash(hash)).toBeNull();
    },
  );
});
```

In `src/lib/__tests__/samples.test.ts`, replace:

```ts
      const raw = readFileSync(`public/${sample.path}`, 'utf8');
```

with:

```ts
      const raw = readFileSync(`public/${sample.path.slice(import.meta.env.BASE_URL.length)}`, 'utf8');
```

and add this test inside `describe('bundled samples', ...)`, after the first test:

```ts
  it('every sample loads from the site root, so it works from /app/ as well', () => {
    for (const sample of SAMPLES) {
      expect(sample.path, sample.label).toMatch(new RegExp(`^${import.meta.env.BASE_URL}samples/`));
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/siteUrls.test.ts src/lib/__tests__/samples.test.ts`
Expected: FAIL. `siteUrls.test.ts` cannot resolve `../siteUrls`, the new samples test fails on `samples/friends-chat.json`, and "every sample file exists" fails because the slice cuts the first letter off the old relative path.

- [ ] **Step 3: Write `src/lib/siteUrls.ts`**

```ts
/**
 * Where the two pages of the site live.
 *
 * The landing page is public. The visualizer sits behind the site password,
 * so every way into it is a link to APP_URL, never an in-page switch.
 */

/** The public landing page. */
export const LANDING_URL = '/';

/** The visualizer, behind the password. */
export const APP_URL = '/app/';

/**
 * Hashes that opened part of the app when it lived at the root. Old bookmarks
 * and shared links now land on the landing page, which sends them on.
 */
const APP_HASHES = new Set([
  '#visualizer',
  '#pipeline',
  '#app',
  '#login',
  '#register',
  '#signup',
  '#forgot-password',
  '#reset',
]);

/** Where an old `/#...` link should go now, or null to stay on the landing page. */
export function appUrlForLegacyHash(hash: string): string | null {
  const normalized = hash.toLowerCase();
  return APP_HASHES.has(normalized) ? `${APP_URL}${normalized}` : null;
}
```

- [ ] **Step 4: Make the sample paths root-relative**

In `src/lib/samples.ts`, replace the doc comment line:

```ts
  /** Path under public/, fetched relative to the site root. */
```

with:

```ts
  /**
   * URL of the file in public/, from the site root, so it loads the same from
   * the landing page and from the visualizer at /app/.
   */
```

Then change each of the four `path:` values the same way. For example:

```ts
    path: 'samples/friends-chat.json',
```

becomes:

```ts
    path: `${import.meta.env.BASE_URL}samples/friends-chat.json`,
```

Do the same for `samples/team-standup.json`, `samples/cooking-club.json` and `samples/rag-guide.md`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/siteUrls.test.ts src/lib/__tests__/samples.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the two HTML pages**

Copy the current page to the app's page, then point the root page at the landing script:

```bash
mkdir -p app && cp index.html app/index.html
```

In `index.html`, replace:

```html
    <script type="module" src="/src/main.tsx"></script>
```

with:

```html
    <script type="module" src="/src/landing.tsx"></script>
```

`app/index.html` keeps `/src/main.tsx`. Its `/favicon.svg` and `/src/main.tsx` URLs are already absolute, so they work from `/app/`.

- [ ] **Step 7: Create `src/landing.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * The public landing page. Everything this file imports is served without the
 * site password (see server/publicPaths.ts), so the visualizer stays out of
 * it: every way into the app is a link to /app/, which asks for the password.
 *
 * The fonts and styles are imported here, as in main.tsx, for the reason given
 * there.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { LandingPage } from './components/pages/LandingPage';
import { AuthProvider } from './context/AuthContext';
import { APP_URL, appUrlForLegacyHash } from './lib/siteUrls';

const legacy = appUrlForLegacyHash(window.location.hash);
if (legacy) window.location.replace(legacy);

const openApp = (hash = '') => window.location.assign(APP_URL + hash);

function navigate(view: 'landing' | 'pipeline' | 'login' | 'register') {
  if (view === 'landing') window.scrollTo({ top: 0, behavior: 'smooth' });
  else if (view === 'pipeline') openApp();
  else openApp(`#${view}`);
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-ink-50">
        <Header currentView="landing" onNavigate={navigate} />
        <LandingPage
          onLaunchVisualizer={() => openApp()}
          onNavigateToAuth={(mode) => openApp(`#${mode ?? 'login'}`)}
        />
        <Footer />
      </div>
    </AuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 8: Remove the landing view from the app**

In `src/App.tsx`:

Replace line 10:

```ts
import { LandingPage } from './components/pages/LandingPage';
```

with:

```ts
import { LANDING_URL } from './lib/siteUrls';
```

Replace:

```ts
  // View state: landing (initial page), pipeline (visualizer), or auth (login/register)
  const [currentView, setCurrentView] = useState<AppView>('landing');
```

with:

```ts
  // View state: pipeline (visualizer) or auth (login/register). The landing
  // page is its own page at LANDING_URL, outside the password.
  const [currentView, setCurrentView] = useState<AppView>('pipeline');
```

In the hash handler, replace:

```ts
      } else if (hash === '#overview' || hash === '#landing' || hash === '#home') {
        setCurrentView('landing');
      }
```

with:

```ts
      } else if (hash === '#overview' || hash === '#landing' || hash === '#home') {
        window.location.assign(LANDING_URL);
      }
```

In `handleNavigate`, replace:

```ts
    } else {
      window.location.hash = '#overview';
      setCurrentView('landing');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
```

with:

```ts
    } else {
      window.location.assign(LANDING_URL);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
```

Delete the landing view block:

```tsx
      {/* VIEW 1: LANDING / INITIAL EXPLAINER PAGE */}
      {currentView === 'landing' && (
        <LandingPage
          onLaunchVisualizer={handleLaunchVisualizer}
          onNavigateToAuth={(mode) => handleNavigate(mode || 'login')}
        />
      )}

```

Then renumber the remaining view comments: `VIEW 2: AUTH PORTAL` becomes `VIEW 1: AUTH PORTAL`, and `VIEW 3: PIPELINE VISUALIZER` becomes `VIEW 2: PIPELINE VISUALIZER`.

- [ ] **Step 9: Point `concepts.html` at the visualizer**

In `public/concepts.html`, replace every occurrence (there are two, at lines 212 and 815) of:

```html
<a href="/">Open the visualizer</a>
```

with:

```html
<a href="/app/">Open the visualizer</a>
```

Leave the wordmark link (`<a class="wordmark" href="/">`) pointing at `/`.

- [ ] **Step 10: Build both pages with Vite**

In `vite.config.ts`, add to the imports:

```ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
```

and below the imports:

```ts
const ROOT = dirname(fileURLToPath(import.meta.url));
```

In the returned config object, add `appType` as the first property:

```ts
  // Two pages: the public landing page (index.html) and the visualizer behind
  // the password (app/index.html). 'mpa' turns off the fallback that answers
  // unknown paths with index.html, so a wrong URL is a 404, not the landing page.
  appType: 'mpa',
```

and replace the `build` block:

```ts
  build: {
    // The embedding runtime is large and loads in a worker, so the warning
    // about chunk size is expected rather than something to act on.
    chunkSizeWarningLimit: 1500,
  },
```

with:

```ts
  build: {
    // The embedding runtime is large and loads in a worker, so the warning
    // about chunk size is expected rather than something to act on.
    chunkSizeWarningLimit: 1500,
    // The password gate reads the manifest to find what the landing page needs.
    manifest: true,
    rolldownOptions: {
      input: {
        landing: resolve(ROOT, 'index.html'),
        app: resolve(ROOT, 'app/index.html'),
      },
    },
  },
```

- [ ] **Step 11: Build and check the output**

Run: `npm run build && ls dist/index.html dist/app/index.html dist/.vite/manifest.json && node -e "const m=require('./dist/.vite/manifest.json'); console.log(Object.keys(m).filter(k=>m[k].isEntry))"`
Expected: the build succeeds, all three files are listed, and the last line prints `[ 'index.html', 'app/index.html' ]` (in either order).

Then confirm that the landing page's scripts carry no visualizer code. The four strings below occur only in visualizer files (`App.tsx`, `embedder.ts`, `parse.ts`), and string literals survive minification:

Run:

```bash
node -e "
const fs = require('fs');
const m = require('./dist/.vite/manifest.json');
const seen = new Set();
const walk = (k) => { if (seen.has(k)) return; seen.add(k); (m[k].imports || []).forEach(walk); };
walk('index.html');
const files = [...seen].map((k) => m[k].file);
const banned = ['Cut the document into chunks', 'Turn the chunks into numbers', 'embedder.worker', 'pdf.worker'];
const hits = files.flatMap((f) => banned.filter((b) => fs.readFileSync('dist/' + f, 'utf8').includes(b)).map((b) => f + ': ' + b));
console.log(files);
console.log(hits.length ? 'VISUALIZER CODE FOUND\n' + hits.join('\n') : 'landing bundle is clean');
console.log('landing assets', m['index.html'].assets || []);
"
```

Expected: `landing bundle is clean`, and `landing assets` lists only font files (`.woff2`), with no worker. If visualizer code is found, stop: an import pulls the visualizer into the landing page, so find it before continuing.

- [ ] **Step 12: Run everything**

Run: `npx vitest run && npx tsc -b && npx eslint src/landing.tsx src/lib/siteUrls.ts src/lib/__tests__/siteUrls.test.ts src/lib/samples.ts src/lib/__tests__/samples.test.ts vite.config.ts`
Expected: all tests PASS, `tsc` prints nothing, and ESLint prints nothing for these files. `src/App.tsx` is left out of the ESLint run on purpose: run `npx eslint src/App.tsx` separately and confirm it reports nothing new. Its existing errors, if any, come from the merge.

- [ ] **Step 13: Commit**

```bash
git add index.html app/index.html src/landing.tsx src/lib/siteUrls.ts src/lib/__tests__/siteUrls.test.ts src/App.tsx src/lib/samples.ts src/lib/__tests__/samples.test.ts public/concepts.html vite.config.ts
git commit -m "Split the site into a public landing page and the visualizer at /app/

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end checks and README

**Files:**
- Modify: `README.md` (the "Running it" paragraph, "The site password" section, "Project layout")
- Possibly modify: `server/passwordGate.ts`, `server/__tests__/passwordGate.test.ts`, `server/publicPaths.ts`, `server/__tests__/publicPaths.test.ts` (Steps 5 and 6, only if a check fails in the way described there)
- Scratch only, never committed, in `$SCRATCH`: `verify-hash.mjs`, `crawl.mjs`, `wait.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing used by code.

Throughout this task, `SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad`. Every shell command below starts with `cd /Users/onlymac/project-py/Py-ject/chunkie` and sets `SCRATCH` itself, since shell state does not carry between commands. Servers run as background commands. Stop them by port (`lsof -ti :4317 | xargs kill`), never with `kill %1`.

- [ ] **Step 1: Write the throwaway password hash script**

`.env.local` holds only the hash of the real password, so the checks run with the known test password `verify-pass13` instead. Vite's `loadEnv` lets a variable set in the environment win over `.env.local`. Create `$SCRATCH/verify-hash.mjs`:

```js
// Prints a SITE_PASSWORD_HASH for the test password, in the gate's format.
import { randomBytes, scryptSync } from 'node:crypto';
const salt = randomBytes(16);
const key = scryptSync('verify-pass13', salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
console.log(`scrypt:${salt.toString('hex')}:${key.toString('hex')}`);
```

Run: `node $SCRATCH/verify-hash.mjs > $SCRATCH/hash.txt && cat $SCRATCH/hash.txt`
Expected: one line, `scrypt:<32 hex>:<64 hex>`.

- [ ] **Step 2: Write the crawler and the wait helper**

Create `$SCRATCH/wait.mjs`, which waits until a server answers `/healthz`:

```js
// Usage: node wait.mjs <base>. Exits once <base>/healthz answers, or fails after 30 seconds.
const base = process.argv[2];
const deadline = Date.now() + 30_000;
for (;;) {
  try {
    if ((await fetch(`${base}/healthz`)).ok) process.exit(0);
  } catch {
    // Not listening yet.
  }
  if (Date.now() > deadline) {
    console.error(`${base} did not start`);
    process.exit(1);
  }
  await new Promise((done) => setTimeout(done, 300));
}
```

Create `$SCRATCH/crawl.mjs`. Starting at `/`, it follows every same-site URL in the HTML (`src="..."`, `href="..."`), the JS (static and dynamic imports, absolute or relative) and the CSS (`url(...)`, also inside dev mode's JS-wrapped CSS). It prints each URL with its status:

```js
// Usage: node crawl.mjs <base> [cookie]
const [base, cookie] = process.argv.slice(2);
const origin = new URL(base).origin;
const SPEC = String.raw`((?:\.{1,2})?\/[^"'\s)\\]+)`;
const patterns = [
  new RegExp(String.raw`(?:src|href)="` + SPEC + '"', 'g'),
  new RegExp(String.raw`\bfrom\s*["']` + SPEC + `["']`, 'g'),
  new RegExp(String.raw`\bimport\s*["']` + SPEC + `["']`, 'g'),
  new RegExp(String.raw`\bimport\(\s*["']` + SPEC + `["']`, 'g'),
  new RegExp(String.raw`url\(\s*\\?["']?` + SPEC, 'g'),
];
const seen = new Map();
const queue = ['/'];
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  const res = await fetch(origin + path, {
    headers: { Accept: path === '/' ? 'text/html' : '*/*', ...(cookie ? { Cookie: cookie } : {}) },
  });
  seen.set(path, res.status);
  const type = res.headers.get('content-type') ?? '';
  if (res.status !== 200 || !/html|javascript|css/.test(type)) continue;
  const body = await res.text();
  for (const pattern of patterns) {
    for (const [, spec] of body.matchAll(pattern)) {
      const url = new URL(spec, origin + path);
      if (url.origin === origin) queue.push(url.pathname + url.search);
    }
  }
}
let bad = 0;
for (const [path, status] of seen) {
  if (status !== 200) bad++;
  console.log(status, path);
}
console.log(bad ? `${bad} not OK` : `all ${seen.size} OK`);
process.exit(bad ? 1 : 0);
```

- [ ] **Step 3: Check the built site (what Render runs)**

Build, then start the preview as a background command:

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && npm run build
```

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad; SITE_PASSWORD_HASH="$(cat $SCRATCH/hash.txt)" npx vite preview --port 4317 --strictPort
```

Then, in a separate command:

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad; B=http://localhost:4317
node $SCRATCH/wait.mjs $B && node $SCRATCH/crawl.mjs $B
WORKER=/assets/$(ls dist/assets | grep -m1 embedder.worker)
APPJS=$(grep -o 'src="/assets/[^"]*"' dist/app/index.html | head -1 | sed 's/src="//;s/"$//')
for p in /app/ /concepts.html /samples/friends-chat.json "$WORKER" "$APPJS"; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "$B$p") $p"
done
```

Expected: the crawler ends with `all N OK`, where N counts the landing page, its scripts, styles and fonts. Every line of the `for` loop prints `401`.

Then sign in, and check the visualizer, a sample, and `/app` without the slash:

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && B=http://localhost:4317
COOKIE=$(curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'password=verify-pass13' $B/app/ | grep -i '^set-cookie' | sed 's/^[^:]*: //;s/;.*//')
curl -s -o /dev/null -w '%{http_code} /app/\n' -H "Cookie: $COOKIE" $B/app/
curl -s -o /dev/null -w '%{http_code} /samples/friends-chat.json\n' -H "Cookie: $COOKIE" $B/samples/friends-chat.json
curl -s -o /dev/null -w '%{http_code} /app -> %{redirect_url}\n' -H "Cookie: $COOKIE" $B/app
curl -s -H "Cookie: $COOKIE" $B/app | grep -c '/assets/app-'
lsof -ti :4317 | xargs kill
```

Expected:
- `200 /app/` and `200 /samples/friends-chat.json`.
- For `/app`, either a redirect status (301, 302, 307 or 308) to `.../app/`, or `200` with the last line printing `1` or more (the visualizer's HTML). Note which one you got. A `404`, or `200` with `0` (the landing page), is a failure to fix in Step 5.

- [ ] **Step 4: Check the dev server**

Start the dev server as a background command:

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad; SITE_PASSWORD_HASH="$(cat $SCRATCH/hash.txt)" npx vite --port 4318 --strictPort
```

Then:

```bash
cd /Users/onlymac/project-py/Py-ject/chunkie && SCRATCH=/private/tmp/claude-501/-Users-onlymac-project-py-Py-ject-chunkie/a98e270f-5ca1-4875-b813-eaa3909d4b12/scratchpad; B=http://localhost:4318
node $SCRATCH/wait.mjs $B && node $SCRATCH/crawl.mjs $B
for p in /app/ /src/App.tsx /src/main.tsx /src/lib/chunk.ts /concepts.html; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "$B$p") $p"
done
COOKIE=$(curl -s -o /dev/null -D - -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'password=verify-pass13' $B/app/ | grep -i '^set-cookie' | sed 's/^[^:]*: //;s/;.*//')
curl -s -o /dev/null -w '%{http_code} /app/\n' -H "Cookie: $COOKIE" $B/app/
curl -s -o /dev/null -w '%{http_code} /app -> %{redirect_url}\n' -H "Cookie: $COOKIE" $B/app
curl -s -H "Cookie: $COOKIE" $B/app | grep -c 'src/main.tsx'
```

Expected:
- The crawler ends with `all N OK`, and each `for` line prints `401`.
- `200 /app/`.
- For `/app`: a redirect to `.../app/`, or `200` with the last line printing `1` or more. A `404`, or `200` with `0`, is a failure to fix in Step 5.

Leave the dev server running for Step 6.

If the crawler reports a 401 for a path Vite itself needs on the landing page, such as one under `/@id/`, add exactly that path to `DEV_CLIENT_PATHS` in `server/publicPaths.ts`, with a one-line comment saying what Vite uses it for. Then add it to the `serves %s without a password` list in `publicPaths.test.ts`, run `npx vitest run server/__tests__`, and rerun this step. Never add a broad prefix such as `/@id/` or `/@fs/`.

- [ ] **Step 5: Fix `/app` without the slash (only if Step 3 or 4 flagged it)**

Skip this step if both servers handled `/app` correctly.

Add this test to the `createPasswordGate with public paths` block in `server/__tests__/passwordGate.test.ts`, and remove `'/app'` from that block's `keeps %s behind the password` list:

```ts
  it('sends /app on to /app/, keeping the query', async () => {
    const res = await fetch(`${base}/app?x=1`, { redirect: 'manual' });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/app/?x=1');
  });
```

Run: `npx vitest run server/__tests__/passwordGate.test.ts`
Expected: the new test FAILS with status 401.

In `server/passwordGate.ts`, add this block to the request handler, directly after the `LOGOUT_PATH` block:

```ts
    // The visualizer is the page at /app/. Without the slash the server does
    // not find it, so send the visitor on. This reveals nothing.
    if (url.pathname === '/app' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.statusCode = 308;
      res.setHeader('Location', `/app/${url.search}`);
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }
```

Run: `npx vitest run server/__tests__/passwordGate.test.ts`
Expected: PASS. Then repeat the `/app` lines of Step 3 and Step 4 and confirm they now redirect.

- [ ] **Step 6: Check in a real browser**

Use the `run` skill, or whatever browser automation is available, against the dev server on port 4318, starting signed out (a fresh browser profile, or after visiting `/logout`):

1. Open `/`. The landing page renders with its fonts. The console shows at most one hot-reload WebSocket error. Wait 15 seconds and confirm the page has **not** reloaded: no repeated `[vite] connecting...` lines and no flicker. If it reloads in a loop, stop and report to the user, as the spec says. Do not open the socket.
2. Click "Launch visualizer". The password screen appears at `/app/`. Enter `verify-pass13`, and the visualizer opens at `/app/`.
3. Load the "Two friends" sample, go to Embed, and run it. Chunks and vectors appear, which shows the worker loaded.
4. Click "Overview" in the header. The browser goes to `/`.
5. Open `/#login`. The browser goes on to `/app/#login`.
6. Visit `/logout`, then open `/app/#login`. After the password, the login view is shown, so the fragment survived the redirect.

If no browser automation is available, list these six checks for the user to do by hand and mark them unverified in the report.

Then stop the dev server: `lsof -ti :4318 | xargs kill`.

- [ ] **Step 7: Update the README**

In `README.md`, replace:

```markdown
The `password` step prints a new site password once. Keep it, because the dev server asks for it
before it shows anything (see [The site password](#the-site-password) below). Then open the URL the
terminal prints, usually <http://localhost:5173>, and enter the password.
```

with:

```markdown
The `password` step prints a new site password once. Keep it, because the visualizer asks for it
(see [The site password](#the-site-password) below). Then open the URL the terminal prints, usually
<http://localhost:5173>. The landing page opens without the password. "Launch visualizer" opens
<http://localhost:5173/app/>, which asks for it.
```

Replace:

```markdown
The dev server and the preview server both ask for a password before they serve anything: no page,
script, or hot reload connection gets through without it.
```

with:

```markdown
The dev server and the preview server both ask for a password before they serve the visualizer at
`/app/`. The landing page at `/` is public, along with exactly the scripts, styles and fonts it
needs. Everything else (the visualizer, its workers, the samples, the concepts guide, and the hot
reload connection) needs the password. Whatever the landing page imports becomes public, so keep
visualizer code out of `src/landing.tsx` and the components it uses.

For the built site, the list of public files comes from the manifest that `npm run build` writes.
If that manifest is missing, for example when `dist/` predates this layout, nothing is public, and
the preview server says so in the terminal. Run `npm run build` again.
```

Replace:

```markdown
- **`/healthz` is the one open address.** It answers "ok" and nothing else, so an uptime ping or a
  health check gets a success rather than the login page's 401. It shows nothing of the app.
```

with:

```markdown
- **`/healthz` answers without the password.** It says "ok" and nothing else, so an uptime ping or
  a health check gets a success rather than the login page's 401. It shows nothing of the app.
```

In "Project layout", replace:

```
src/
  lib/
```

with:

```
index.html          The public landing page
app/index.html      The visualizer, behind the password
src/
  landing.tsx       Starts the landing page. Everything it imports is public
  main.tsx          Starts the visualizer
  lib/
    siteUrls.ts     Where the two pages live, and old links sent on
```

and replace:

```
server/passwordGate.ts         The password check in front of the dev and preview servers
```

with:

```
server/passwordGate.ts         The password check in front of the dev and preview servers
server/publicPaths.ts          Which files the landing page needs, served without the password
```

- [ ] **Step 8: Final run**

Run: `npx vitest run && npx tsc -b && npx eslint . 2>&1 | tail -3`
Expected: all tests PASS and `tsc` prints nothing. ESLint reports the same 15 errors as before this plan, and no more. Compare the count in the last line (`✖ 15 problems`).

- [ ] **Step 9: Commit**

```bash
git add README.md
# plus server/passwordGate.ts, server/__tests__/passwordGate.test.ts and server/publicPaths.ts
# and publicPaths.test.ts if Step 4 or Step 5 changed them
git commit -m "Describe the public landing page in the readme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
