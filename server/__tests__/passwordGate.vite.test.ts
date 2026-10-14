import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, passwordGate } from '../passwordGate';

/**
 * The gate in front of a real Vite dev server, not a stand-in.
 *
 * Vite resolves `..` and reads the query in ways a stub server does not, so a
 * path the gate thinks is public can still reach a private file. These tests
 * send raw request targets, exactly as written, and check that the visualizer's
 * source never comes back to a visitor without the password.
 */

const SECRET = 'visualizer-secret-7731';

/**
 * The smallest project the gate understands. The plugin follows imports from
 * src/landing.tsx, so the entry keeps that name, with plain TypeScript inside.
 */
const FILES: Record<string, string> = {
  'index.html':
    '<!doctype html><html><body><script type="module" src="/src/landing.tsx"></script></body></html>',
  'src/landing.tsx': "import { greeting } from './shared';\nconsole.log(greeting);\n",
  'src/shared.ts': "export const greeting = 'hello from shared';\n",
  'src/App.tsx': `const SECRET = '${SECRET}';\nexport default SECRET;\n`,
  'node_modules/.package-lock.json': `{ "name": "fixture", "note": "${SECRET}" }\n`,
};

/** Sends a GET with the path exactly as written, and returns the status and body. */
function rawGet(base: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    const req = request(base, { path }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', fail);
    req.end();
  });
}

describe('passwordGate on a real Vite dev server', () => {
  let root: string;
  let vite: ViteDevServer;
  let http: Server;
  let base: string;

  beforeAll(async () => {
    // realpath, since the temp folder on macOS sits behind a symlink and Vite
    // compares real paths when it decides which files it may serve.
    root = realpathSync(mkdtempSync(join(tmpdir(), 'chunkie-vite-gate-')));
    for (const [path, content] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }

    vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'mpa',
      server: { middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        passwordGate({
          SITE_PASSWORD_HASH: await hashPassword('test-pass-13v'),
          SITE_PUBLIC_LANDING: 'true',
        }),
      ],
    });
    http = createHttpServer(vite.middlewares);
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    await vite?.close();
    await new Promise((done) => (http ? http.close(done) : done(undefined)));
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('serves the landing page and the files it imports without a password', async () => {
    const entry = await rawGet(base, '/src/landing.tsx');
    expect(entry.status).toBe(200);
    expect(entry.body).toContain('/src/shared.ts');

    const shared = await rawGet(base, '/src/shared.ts');
    expect(shared.status).toBe(200);
    expect(shared.body).toContain('hello from shared');
  });

  it.each([
    '/src/App.tsx',
    // Node's URL parser keeps these `..`, so the pathname looked like a package.
    '/node_modules/.vite/deps/../../../src/App.tsx',
    // Vite normalises the query along with the path, and lands on src/App.tsx.
    '/src/landing.tsx?/../App.tsx',
    '/node_modules/.package-lock.json',
  ])('keeps %s behind the password', async (path) => {
    const res = await rawGet(base, path);
    expect(res.status).toBe(401);
    expect(res.body).not.toContain(SECRET);
  });
});
