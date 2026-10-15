import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { posix, resolve } from 'node:path';
import type { Duplex } from 'node:stream';
import type { Connect, Plugin } from 'vite';
import { devPublicCheck, type IsPublic, NOTHING_PUBLIC, previewPublicCheck } from './publicPaths.ts';

/**
 * Password gate middleware.
 *
 * Sits in front of every request the dev and preview servers handle, so no
 * page, script, stylesheet or worker of the visualizer is served until the
 * visitor has entered the site password. WebSocket upgrades, such as the dev
 * server's hot reload socket, never pass through middleware, so they are
 * checked separately before Vite sees them. Two things get through without
 * the password: /healthz, which answers "ok" and nothing else, so an uptime
 * ping or a health check has a page that is not an error, and, only when
 * SITE_PUBLIC_LANDING is "true", the landing page with exactly the files it
 * needs (see publicPaths.ts). Without it, every other page needs the password.
 *
 * The password itself is never stored. SITE_PASSWORD_HASH in .env.local holds
 * a salted scrypt hash of it (see .env.example), so reading that file does not
 * reveal the password. `npm run password -- --write` makes a new 13 character
 * password, prints it once, and saves only the hash. A correct password sets
 * an HttpOnly cookie holding the sign-in time and an HMAC of it keyed by that
 * hash, which says nothing about the password either. The server refuses the
 * cookie three hours after sign-in, even a copy of it, and a new password
 * signs everyone out at once.
 *
 * None of this has a VITE_ prefix, so none of it is exposed to client code.
 */

export const PASSWORD_LENGTH = 13;

/**
 * Format of SITE_PASSWORD_HASH: `scrypt:<salt>:<key>`, both hex. No `$`,
 * because Vite expands `$NAME` inside .env values. The generator script uses
 * the same parameters, and a test checks the two agree.
 */
const HASH_PATTERN = /^scrypt:([0-9a-f]{32}):([0-9a-f]{64})$/;
const KEY_BYTES = 32;
/** About 100 ms and 32 MiB per guess, so even a stolen hash is slow to attack. */
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type StoredHash = { salt: Buffer; key: Buffer };

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, SCRYPT_OPTIONS, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Hashes a password into the SITE_PASSWORD_HASH format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

function parseHash(value: string): StoredHash {
  const match = HASH_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      'SITE_PASSWORD_HASH is missing or malformed (in .env.local). ' +
        'Run `npm run password -- --write` to set a password.',
    );
  }
  return { salt: Buffer.from(match[1], 'hex'), key: Buffer.from(match[2], 'hex') };
}

async function passwordMatches(attempt: string, stored: StoredHash): Promise<boolean> {
  // The length is public, so checking it first gives nothing away and skips
  // the expensive hash for obvious misses.
  if (attempt.length !== PASSWORD_LENGTH) return false;
  return timingSafeEqual(await deriveKey(attempt, stored.salt), stored.key);
}

const COOKIE_NAME = 'chunkie_gate';
/**
 * How long a sign-in lasts. The browser drops the cookie at this point, and
 * the server checks the sign-in time inside it too, so a cookie copied out of
 * a browser stops working at the same moment.
 */
const SESSION_SECONDS = 60 * 60 * 3; // three hours
/** Tolerates the server clock being nudged back a little after a sign-in. */
const CLOCK_SKEW_SECONDS = 60;
/**
 * There is no separate login URL. The form posts back to whatever page the
 * visitor asked for, so the address bar always shows the real page.
 */
const LOGOUT_PATH = '/logout';
/**
 * Answers "ok" without a password. A free Render service sleeps after 15
 * minutes with no traffic, and a ping that keeps it awake needs a 2xx answer:
 * ping services count the login page's 401 as a failure and may stop pinging.
 * It is answered here, never passed on to Vite, so nothing of the app leaks.
 */
const HEALTH_PATH = '/healthz';

/** Failed attempts allowed per client inside the window before it is locked. */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 4 * 1024;

type FailureRecord = { count: number; firstAt: number };

/**
 * A session cookie is `<sign-in time in unix seconds>.<HMAC of that time>`,
 * keyed by the password hash. Changing the time breaks the HMAC, and a new
 * password changes the key.
 */
function signSession(passwordHash: string, issuedAt: number): string {
  const mac = createHmac('sha256', passwordHash)
    .update(`chunkie-gate-session-v3:${issuedAt}`)
    .digest('hex');
  return `${issuedAt}.${mac}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function hasSession(req: IncomingMessage, passwordHash: string): boolean {
  const cookie = readCookie(req, COOKIE_NAME);
  const match = cookie === undefined ? null : /^(\d{1,12})\.[0-9a-f]{64}$/.exec(cookie);
  if (!cookie || !match) return false;

  const issuedAt = Number(match[1]);
  const age = nowSeconds() - issuedAt;
  if (age < -CLOCK_SKEW_SECONDS || age >= SESSION_SECONDS) return false;
  return safeEqual(cookie, signSession(passwordHash, issuedAt));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Only allow redirects back to a path on this same site. */
function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith(LOGOUT_PATH)) {
    return '/';
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export type GateOptions = {
  /**
   * Set when running on Render. Every request there arrives through Cloudflare
   * and Render's proxy, so the socket address is the proxy's, the same for all
   * visitors, and HTTPS has already been handled in front of the app.
   */
  behindRenderProxy?: boolean;
  /**
   * Paths served without a password, asked only for GET and HEAD, and only
   * when the whole request target, query included, is already in canonical
   * form (see isCanonicalTarget). Vite reads the raw target, so anything the
   * gate and Vite could read differently is never public, and asks for the
   * password like any other private page.
   */
  isPublic?: IsPublic;
};

/**
 * Whether the request target the browser sent can only mean one file, so the
 * path the gate checks is the file Vite serves.
 *
 * The target must have no `%`, `\` or `#`, which are decoded, read as a slash
 * or cut off somewhere along the way. It must come out of a plain path
 * normalisation unchanged, so it has no `.` or `..` segment and no `//`
 * anywhere. That backs up Node's URL parser, which does not always resolve dot
 * segments: it keeps the `..` in `/node_modules/.vite/deps/../../../src/App.tsx`
 * because they follow a segment starting with a dot, and Vite then climbs out
 * to src/App.tsx. The query is normalised too, because Vite normalises the
 * whole target and `/src/landing.tsx?/../App.tsx` reaches src/App.tsx. Last,
 * the path before the query must equal the parsed pathname, which catches
 * whatever the parser rewrites on its own (`//app/` becomes `/`).
 */
function isCanonicalTarget(raw: string, pathname: string): boolean {
  if (/[%\\#]/.test(raw)) return false;
  if (posix.normalize(raw) !== raw) return false;
  return raw.split('?')[0] === pathname;
}

function clientKey(req: IncomingMessage, options: GateOptions): string {
  if (options.behindRenderProxy) {
    // Cloudflare writes CF-Connecting-IP on every request to a Render web
    // service and overwrites any value the caller sent, so it cannot be faked.
    // X-Forwarded-For can: the proxy appends to it, so its first entry is
    // whatever the caller chose.
    const ip = req.headers['cf-connecting-ip'];
    if (typeof ip === 'string' && ip) return ip;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function loginPage(error?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Protected | Chunkie</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    color:#e7e9ee;background:radial-gradient(1200px 600px at 20% -10%,#2a2350 0%,transparent 60%),
    radial-gradient(900px 500px at 110% 110%,#123a4a 0%,transparent 55%),#0b0d12}
  main{width:min(380px,92vw);padding:32px;border-radius:18px;
    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);
    backdrop-filter:blur(14px);box-shadow:0 20px 60px rgba(0,0,0,.45);
    animation:rise .45s cubic-bezier(.2,.8,.2,1)}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .lock{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;
    background:linear-gradient(135deg,#7c6cff,#38bdf8);margin-bottom:18px}
  h1{font-size:20px;margin:0 0 6px;font-weight:650;letter-spacing:-.01em}
  p{margin:0 0 22px;color:#9aa3b2;font-size:14px;line-height:1.5}
  label{display:block;font-size:12px;color:#9aa3b2;margin-bottom:8px}
  input{width:100%;padding:12px 14px;border-radius:10px;font-size:15px;color:inherit;
    background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);outline:none;
    transition:border-color .15s,box-shadow .15s}
  input:focus{border-color:#7c6cff;box-shadow:0 0 0 4px rgba(124,108,255,.2)}
  button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:10px;cursor:pointer;
    font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#7c6cff,#4f8cff);
    transition:transform .12s,filter .15s}
  button:hover{filter:brightness(1.08)}
  button:active{transform:scale(.98)}
  .error{margin:0 0 16px;padding:10px 12px;border-radius:10px;font-size:13px;color:#fecaca;
    background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3)}
  .field{position:relative}
  .field input{padding-right:46px}
  .toggle{position:absolute;top:50%;right:6px;transform:translateY(-50%);margin:0;width:34px;
    height:34px;padding:0;display:grid;place-items:center;border-radius:8px;background:transparent;
    color:#9aa3b2;transition:color .15s,background .15s}
  .toggle:hover{color:#e7e9ee;background:rgba(255,255,255,.08);filter:none}
  .toggle:active{transform:translateY(-50%) scale(.92)}
  .toggle:focus-visible{outline:2px solid #7c6cff;outline-offset:1px}
  .toggle .eye-off{display:none}
  .toggle[aria-pressed="true"] .eye{display:none}
  .toggle[aria-pressed="true"] .eye-off{display:block}
</style>
</head>
<body>
<main>
  <div class="lock" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
  </div>
  <h1>This site is protected</h1>
  <p>Enter the access password to continue.</p>
  ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
  <form method="post">
    <label for="gate-password">Password</label>
    <div class="field">
      <input id="gate-password" name="password" type="password" autocomplete="current-password"
        required autofocus />
      <button id="gate-toggle" class="toggle" type="button" aria-controls="gate-password"
        aria-pressed="false" aria-label="Show password" title="Show password">
        <svg class="eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg class="eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/>
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M2 2l20 20"/></svg>
      </button>
    </div>
    <button id="gate-submit" type="submit">Unlock</button>
  </form>
</main>
<script>
  (function () {
    var input = document.getElementById('gate-password');
    var toggle = document.getElementById('gate-toggle');
    toggle.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      var label = show ? 'Hide password' : 'Show password';
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
      input.focus();
    });
    // Never submit with the password visible, so browsers don't save it as plain text.
    input.form.addEventListener('submit', function () { input.type = 'password'; });
  })();
</script>
</body>
</html>`;
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

function redirect(res: ServerResponse, location: string, cookie?: string): void {
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.end();
}

export function createPasswordGate(
  passwordHash: string,
  options: GateOptions = {},
): Connect.NextHandleFunction {
  const stored = parseHash(passwordHash);
  const failures = new Map<string, FailureRecord>();

  const isLocked = (key: string): boolean => {
    const record = failures.get(key);
    if (!record) return false;
    if (Date.now() - record.firstAt > FAILURE_WINDOW_MS) {
      failures.delete(key);
      return false;
    }
    return record.count >= MAX_FAILURES;
  };

  const recordFailure = (key: string): void => {
    const now = Date.now();
    const record = failures.get(key);
    if (!record || now - record.firstAt > FAILURE_WINDOW_MS) {
      failures.set(key, { count: 1, firstAt: now });
    } else {
      record.count += 1;
    }
  };

  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    const target = safeNext(url.pathname + url.search);

    if (url.pathname === HEALTH_PATH && (req.method === 'GET' || req.method === 'HEAD')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.end('ok');
      return;
    }

    if (url.pathname === LOGOUT_PATH) {
      redirect(res, '/', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      return;
    }

    // The visualizer is the page at /app/. Vite's static and HTML handlers
    // serve app/index.html only for /app/, with the slash, so /app alone would
    // be a 404. Send the visitor on. This reveals nothing.
    if (url.pathname === '/app' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.statusCode = 308;
      res.setHeader('Location', `/app/${url.search}`);
      res.setHeader('Cache-Control', 'no-store');
      res.end();
      return;
    }

    if (hasSession(req, passwordHash)) {
      next();
      return;
    }

    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      options.isPublic &&
      isCanonicalTarget(req.url ?? '/', url.pathname) &&
      options.isPublic(url.pathname)
    ) {
      next();
      return;
    }

    // Not signed in. A form POST to any URL is a login attempt for that page.
    const contentType = req.headers['content-type'] ?? '';
    if (req.method === 'POST' && contentType.startsWith('application/x-www-form-urlencoded')) {
      const key = clientKey(req, options);
      readBody(req)
        .then(async (body) => {
          const form = new URLSearchParams(body);

          if (isLocked(key)) {
            sendHtml(res, 429, loginPage('Too many attempts. Try again in 15 minutes.'));
            return;
          }

          // Counted before the (slow, asynchronous) hash runs, so firing many
          // attempts at once cannot slip past the limit while they are checked.
          recordFailure(key);
          const attempt = form.get('password') ?? '';
          if (!(await passwordMatches(attempt, stored))) {
            sendHtml(res, 401, loginPage('Incorrect password.'));
            return;
          }

          failures.delete(key);
          // Render only serves HTTPS, but hands requests on as plain HTTP.
          const https =
            options.behindRenderProxy || (req.socket as { encrypted?: boolean }).encrypted;
          const secure = https ? '; Secure' : '';
          // 303 turns the POST into a GET of the same page, now with the cookie.
          redirect(
            res,
            target,
            `${COOKIE_NAME}=${signSession(passwordHash, nowSeconds())}; Path=/; HttpOnly; ` +
              `SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`,
          );
        })
        .catch(() => sendHtml(res, 400, loginPage('Invalid request.')));
      return;
    }

    // Browsers navigating to a page get the login form, every other request
    // (scripts, styles, workers, fetches) gets a bare 401.
    const accept = req.headers.accept ?? '';
    if (req.method === 'GET' && accept.includes('text/html')) {
      sendHtml(res, 401, loginPage());
      return;
    }
    res.statusCode = 401;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Unauthorized');
  };
}

export type UpgradeGuard = (req: IncomingMessage, socket: Duplex) => void;

/**
 * Closes any WebSocket upgrade that does not carry a valid session cookie.
 *
 * Upgrades go to the HTTP server's 'upgrade' event and skip the middleware
 * stack entirely, so without this the dev server's hot reload socket would be
 * open to anyone. It must run before Vite's own listener: closing the socket
 * first means the WebSocket library refuses to complete the upgrade. Signed in
 * browsers send the SameSite=Strict cookie on a same site WebSocket handshake,
 * so hot reload keeps working for them.
 */
export function createUpgradeGuard(passwordHash: string): UpgradeGuard {
  return (req, socket) => {
    if (hasSession(req, passwordHash)) return;
    if (socket.writable) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    }
    socket.destroy();
  };
}

/**
 * Vite plugin that installs the gate on both `vite` (dev) and `vite preview`.
 * Takes the server side env from loadEnv and reads SITE_PASSWORD_HASH from it,
 * plus RENDER, which Render sets to "true" on every service it runs.
 */
export function passwordGate(env: Record<string, string | undefined>): Plugin {
  // A plain text password on disk is exactly what the hash is there to avoid,
  // so refuse to start rather than quietly ignore it.
  if (env.SITE_PASSWORD) {
    throw new Error(
      'SITE_PASSWORD holds the password in plain text and is no longer read. Delete that line ' +
        'from .env.local and run `npm run password -- --write`, which stores only a hash.',
    );
  }
  const passwordHash = env.SITE_PASSWORD_HASH ?? '';
  // The landing page is public only when asked for in exactly these words.
  // Anything else, a typo included, keeps every page behind the password, so a
  // missing or mistyped setting can only make a site more private. Staging
  // leaves it unset. The live site is plain files and runs no gate at all.
  const publicLanding = env.SITE_PUBLIC_LANDING === 'true';
  // Set once a server starts, when the plugin knows whether it is the dev
  // server or the preview of a build. Until then nothing is public.
  let isPublic: IsPublic = NOTHING_PUBLIC;
  const gate = createPasswordGate(passwordHash, {
    behindRenderProxy: env.RENDER === 'true',
    isPublic: (pathname) => isPublic(pathname),
  });
  const guardUpgrade = createUpgradeGuard(passwordHash);

  return {
    name: 'chunkie-password-gate',
    // Registering directly (not in a returned function) puts the gate in front
    // of Vite's own middlewares, so nothing is served before it runs.
    configureServer(server) {
      // A separate hot reload port or server would get its own listener that
      // the guard below never sees, so refuse to start rather than leave it open.
      // Vite resolves the older server.hmr.port and server.hmr.server into
      // server.ws, so checking server.ws covers both spellings.
      const { ws, port } = server.config.server;
      if (typeof ws === 'object' && (ws.server || (ws.port && ws.port !== port))) {
        throw new Error(
          'The password gate cannot guard a separate hot reload server. Remove ' +
            'server.ws.port and server.ws.server (or server.hmr.port and server.hmr.server).',
        );
      }
      if (publicLanding) isPublic = devPublicCheck(server.config.root);
      server.middlewares.use(gate);
      // Prepended so it runs before Vite's own upgrade listener.
      server.httpServer?.prependListener('upgrade', guardUpgrade);
    },
    configurePreviewServer(server) {
      if (publicLanding) {
        isPublic = previewPublicCheck(resolve(server.config.root, server.config.build.outDir));
      }
      server.middlewares.use(gate);
      server.httpServer.prependListener('upgrade', guardUpgrade);
    },
  };
}
