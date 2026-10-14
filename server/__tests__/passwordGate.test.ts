import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Connect } from 'vite';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPasswordGate,
  createUpgradeGuard,
  type GateOptions,
  hashPassword,
  PASSWORD_LENGTH,
  passwordGate,
} from '../passwordGate';
import { BUILD_MANIFEST, LANDING_BUILD_PATHS } from './manifestFixture';

const PASSWORD = 'test-pass-13c';
let HASH: string;

beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

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

function postPassword(
  base: string,
  password: string,
  path = '/',
  headers: Record<string, string> = {},
) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ password }).toString(),
    redirect: 'manual',
  });
}

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

describe('passwordGate', () => {
  it('requires a 13 character password', () => {
    expect(PASSWORD_LENGTH).toBe(13);
  });

  it('stores the password only as a salted hash', async () => {
    expect(HASH).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(HASH).not.toContain(PASSWORD);
    // A fresh salt every time, so the same password never gives the same hash.
    expect(await hashPassword(PASSWORD)).not.toBe(HASH);
  });

  it('starts with a valid hash', () => {
    expect(() => passwordGate({ SITE_PASSWORD_HASH: HASH })).not.toThrow();
  });

  it.each([undefined, '', PASSWORD, 'scrypt:abc:def'])('refuses to start with the hash %j', (value) => {
    expect(() => passwordGate({ SITE_PASSWORD_HASH: value })).toThrow(/SITE_PASSWORD_HASH/);
  });

  it('refuses to start while a plain text password is still set', () => {
    expect(() => passwordGate({ SITE_PASSWORD: PASSWORD, SITE_PASSWORD_HASH: HASH })).toThrow(
      /plain text/,
    );
  });
});

describe('npm run password -- --write', () => {
  let dir: string;
  const script = resolve(__dirname, '../../scripts/generate-password.mjs');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chunkie-password-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves a hash the gate accepts, and never the password itself', async () => {
    writeFileSync(
      join(dir, '.env.local'),
      '# Site access password (exactly 13 characters). Never commit this file.\n' +
        'SITE_PASSWORD="old-password1"\nOTHER=kept\n',
    );

    const password = execFileSync('node', [script, '--write'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    expect(password).toHaveLength(PASSWORD_LENGTH);

    const file = join(dir, '.env.local');
    const env = readFileSync(file, 'utf8');
    expect(env).not.toContain(password);
    expect(env).not.toContain('old-password1');
    expect(env).not.toMatch(/^SITE_PASSWORD=/m);
    expect(env).toContain('OTHER=kept');
    // Readable and writable by the owner only.
    expect(statSync(file).mode & 0o777).toBe(0o600);

    const hash = /^SITE_PASSWORD_HASH=(.*)$/m.exec(env)?.[1] ?? '';
    const site = await serveGate(hash);
    try {
      expect((await postPassword(site.base, password)).status).toBe(303);
      expect((await postPassword(site.base, PASSWORD)).status).toBe(401);
    } finally {
      await site.stop();
    }
  });
});

describe('createPasswordGate', () => {
  let site: Awaited<ReturnType<typeof serveGate>>;
  let base: string;

  beforeEach(async () => {
    site = await serveGate(HASH);
    base = site.base;
  });

  afterEach(async () => {
    await site.stop();
  });

  const login = (password: string, path = '/') => postPassword(base, password, path);

  it('shows the login form instead of a page', async () => {
    const res = await fetch(`${base}/concepts.html`, { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toContain('This site is protected');
    expect(body).not.toContain('the real page');
  });

  it('blocks scripts and other assets', async () => {
    const res = await fetch(`${base}/src/main.tsx`);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('answers /healthz without a password, with "ok" and nothing from the app', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect((await fetch(`${base}/healthz`, { method: 'HEAD' })).status).toBe(200);
  });

  it.each(['/healthz/', '/healthz/x', '/healthz/../src/main.tsx', '/HEALTHZ', '/healthzz', '/%68ealthz'])(
    'keeps %s behind the password',
    async (path) => {
      expect((await fetch(base + path)).status).toBe(401);
    },
  );

  it('treats a POST to /healthz as a login attempt, not a health check', async () => {
    const res = await login('test-pass-13x', '/healthz');
    expect(res.status).toBe(401);
    expect(await res.text()).not.toBe('ok');
  });

  it('rejects a wrong password', async () => {
    const res = await login('test-pass-13x');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('lets the visitor in after the right password', async () => {
    const res = await login(PASSWORD, '/concepts.html?x=1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/concepts.html?x=1');

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=10800');
    // Plain HTTP locally, so the cookie must not demand HTTPS.
    expect(cookie).not.toContain('Secure');
    // The cookie carries neither the password nor the stored hash.
    expect(cookie).not.toContain(encodeURIComponent(PASSWORD));
    expect(cookie).not.toContain(HASH.split(':')[2]);

    const page = await fetch(`${base}/concepts.html`, { headers: { Cookie: cookie.split(';')[0] } });
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('the real page');
  });

  it('does not accept a made up cookie', async () => {
    const res = await fetch(base, { headers: { Cookie: 'chunkie_gate=forged' } });
    expect(res.status).toBe(401);
  });

  it('locks a client out after 5 wrong attempts, even with the right password', async () => {
    for (let i = 0; i < 5; i++) await login('wrong-password');
    const res = await login(PASSWORD);
    expect(res.status).toBe(429);
  });

  it('counts guesses sent all at once, so the limit still holds', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => login('test-pass-13x').then((res) => res.status)),
    );
    expect(results.filter((status) => status === 401)).toHaveLength(5);
    expect(results.filter((status) => status === 429)).toHaveLength(15);
  });
});

describe('session lifetime', () => {
  const start = new Date('2026-10-13T12:00:00Z').getTime();
  const HOURS = 60 * 60 * 1000;
  let site: Awaited<ReturnType<typeof serveGate>>;

  beforeEach(async () => {
    // Only the clock is faked, so the real server and fetch keep working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    site = await serveGate(HASH);
  });

  afterEach(async () => {
    await site.stop();
    vi.useRealTimers();
  });

  const signIn = async () =>
    ((await postPassword(site.base, PASSWORD)).headers.get('set-cookie') ?? '').split(';')[0];
  const open = async (cookie: string) =>
    (await fetch(site.base, { headers: { Cookie: cookie, Accept: 'text/html' } })).status;

  it('still lets you in just before three hours', async () => {
    const cookie = await signIn();
    vi.setSystemTime(start + 3 * HOURS - 1000);
    expect(await open(cookie)).toBe(200);
  });

  it('is refused by the server at three hours, even if the browser kept it', async () => {
    const cookie = await signIn();
    vi.setSystemTime(start + 3 * HOURS);
    expect(await open(cookie)).toBe(401);
  });

  it('cannot be stretched by editing the sign-in time in the cookie', async () => {
    const cookie = await signIn();
    vi.setSystemTime(start + 4 * HOURS);
    const [name, value] = cookie.split('=');
    const mac = value.split('.')[1];
    expect(await open(`${name}=${Math.floor(Date.now() / 1000)}.${mac}`)).toBe(401);
  });

  it('no longer accepts the old never-expiring cookie', async () => {
    const old = createHmac('sha256', HASH).update('chunkie-gate-session-v2').digest('hex');
    expect(await open(`chunkie_gate=${old}`)).toBe(401);
  });

  it('closes the WebSocket at the same moment as the pages', async () => {
    const cookie = await signIn();
    const guard = createUpgradeGuard(HASH);
    const closedAt = (when: number) => {
      vi.setSystemTime(when);
      let closed = false;
      const socket = { writable: false, destroy: () => (closed = true) };
      guard({ headers: { cookie } } as never, socket as never);
      return closed;
    };
    expect(closedAt(start + 3 * HOURS - 1000)).toBe(false);
    expect(closedAt(start + 3 * HOURS)).toBe(true);
  });
});

describe('createPasswordGate behind Render', () => {
  let site: Awaited<ReturnType<typeof serveGate>>;

  beforeEach(async () => {
    site = await serveGate(HASH, { behindRenderProxy: true });
  });

  afterEach(async () => {
    await site.stop();
  });

  const loginFrom = (ip: string, password: string, headers: Record<string, string> = {}) =>
    postPassword(site.base, password, '/', { 'CF-Connecting-IP': ip, ...headers });

  it('marks the cookie Secure, since Render only serves HTTPS', async () => {
    const res = await loginFrom('203.0.113.7', PASSWORD);
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('locks out one visitor without locking out everyone behind the proxy', async () => {
    for (let i = 0; i < 5; i++) await loginFrom('203.0.113.7', 'test-pass-13x');
    expect((await loginFrom('203.0.113.7', PASSWORD)).status).toBe(429);
    expect((await loginFrom('198.51.100.4', PASSWORD)).status).toBe(303);
  });

  it('ignores a faked X-Forwarded-For when counting attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await loginFrom('203.0.113.7', 'test-pass-13x', { 'X-Forwarded-For': `10.0.0.${i}` });
    }
    const res = await loginFrom('203.0.113.7', PASSWORD, { 'X-Forwarded-For': '10.0.0.99' });
    expect(res.status).toBe(429);
  });
});

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

  it('serves a public file asked for with a plain query, such as a cache buster', async () => {
    const res = await fetch(`${base}/assets/landing.js?v=abc123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('the real page');
  });

  it.each(['/app/', '/assets/app.js', '/concepts.html', '/samples/friends-chat.json'])(
    'keeps %s behind the password',
    async (path) => {
      const res = await fetch(base + path, { headers: { Accept: 'text/html' } });
      expect(res.status).toBe(401);
      expect(await res.text()).toContain('This site is protected');
    },
  );

  it('sends /app on to /app/, keeping the query', async () => {
    const res = await fetch(`${base}/app?x=1`, { redirect: 'manual' });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/app/?x=1');
  });

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
    '//app/',
    '//concepts.html',
    '//x/node_modules/a.js',
    '/assets\\landing.js',
    // Node's URL parser leaves these `..` in place, after a segment starting with a dot.
    '/node_modules/.vite/deps/../../../src/App.tsx',
    '/node_modules/.v/../x.js',
    // Vite normalises the query along with the path.
    '/assets/landing.js?/../app.js',
    '/assets/landing.js?x=/./y',
    '/node_modules//a.js',
    '/assets/landing.js#x',
  ])('refuses the disguised path %s', async (path) => {
    expect(await rawGet(base, path)).toBe(401);
  });
});

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
  async function startPreview(extraEnv: Record<string, string> = {}) {
    let installed: Connect.NextHandleFunction | undefined;
    const plugin = passwordGate({ SITE_PASSWORD_HASH: HASH, ...extraEnv });
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
    const base = await startPreview({ SITE_PUBLIC_LANDING: 'true' });

    for (const path of LANDING_BUILD_PATHS) {
      expect((await fetch(base + path)).status, path).toBe(200);
    }
    for (const path of ['/app/', '/assets/app-EEEE.js', '/assets/embedder.worker-GGGG.js']) {
      expect((await fetch(base + path)).status, path).toBe(401);
    }
  });

  it('keeps everything behind the password when the build has no manifest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const base = await startPreview({ SITE_PUBLIC_LANDING: 'true' });
    expect((await fetch(`${base}/`)).status).toBe(401);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

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
});

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

describe('createUpgradeGuard', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    server = createServer();
    // Stands in for Vite's hot reload listener. Like the WebSocket library it
    // uses, it only completes an upgrade on a socket that is still open.
    server.on('upgrade', (_req, socket) => {
      if (!socket.readable || !socket.writable) return;
      socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    });
    server.prependListener('upgrade', createUpgradeGuard(HASH));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  /** Resolves with the handshake's status code. */
  const upgrade = (cookie?: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(base, {
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      req.on('upgrade', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });

  const signIn = async () => {
    const site = await serveGate(HASH);
    const res = await postPassword(site.base, PASSWORD);
    await site.stop();
    return (res.headers.get('set-cookie') ?? '').split(';')[0];
  };

  it('refuses a WebSocket upgrade without a session', async () => {
    expect(await upgrade()).toBe(401);
  });

  it('refuses a WebSocket upgrade with a made up cookie', async () => {
    expect(await upgrade('chunkie_gate=forged')).toBe(401);
  });

  it('lets a signed in browser open the WebSocket', async () => {
    expect(await upgrade(await signIn())).toBe(101);
  });
});
