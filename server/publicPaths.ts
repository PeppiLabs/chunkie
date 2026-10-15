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

/**
 * The only parts of node_modules the dev server serves without a password.
 * The rest of it holds more than published packages, such as the lockfile
 * copy, TypeScript build info and test results, so it stays private.
 */
const DEV_PACKAGE_PREFIXES = [
  // Vite's pre-bundled packages, such as React.
  '/node_modules/.vite/deps/',
  // The fonts the landing page imports.
  '/node_modules/@fontsource-variable/',
  // Vite's client runtime files, since /@vite/client imports env.mjs from here.
  '/node_modules/vite/dist/client/',
];

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
    if (DEV_PACKAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
    if (pathname.startsWith('/src/')) return landingSourcePaths(root).has(pathname);
    return false;
  };
}
