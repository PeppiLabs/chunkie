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
    // /@vite/client imports it.
    '/node_modules/vite/dist/client/env.mjs',
    '/src/landing.tsx',
    '/src/components/pages/LandingPage.tsx',
  ])('serves %s without a password', (path) => {
    expect(devPublicCheck(dir)(path)).toBe(true);
  });

  it.each([
    '/src/App.tsx',
    '/src/main.tsx',
    '/app/',
    '/concepts.html',
    '/samples/x.json',
    '/@fs/etc/passwd',
    '/@id/x',
    // node_modules holds more than packages, and only two parts of it are public.
    '/node_modules/.package-lock.json',
    '/node_modules/.tmp/tsconfig.app.tsbuildinfo',
    '/node_modules/.vite/vitest/results.json',
    '/node_modules/react/package.json',
    '/node_modules/vite/package.json',
  ])(
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
