import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPasswordGate,
  createUpgradeGuard,
  type GateOptions,
  hashPassword,
  PASSWORD_LENGTH,
  passwordGate,
} from '../passwordGate';

const PASSWORD = 'test-pass-13c';
let HASH: string;

beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

/** Starts a server running the gate and returns its base URL and a stop function. */
async function serveGate(passwordHash: string, options?: GateOptions) {
  const gate = createPasswordGate(passwordHash, options);
  const server = createServer((req, res) => gate(req, res, () => res.end('the real page')));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: () => new Promise((done) => server.close(done)),
  };
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
