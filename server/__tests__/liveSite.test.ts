/**
 * Guards the public live site's configuration: the Dockerfile that builds it,
 * the Caddyfile that serves it, and the pages it serves. Live has no password,
 * so its safety rests on these headers and on the image holding nothing but
 * built files. These tests fail if any of that quietly changes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

const caddyfile = readFileSync(join(ROOT, 'Caddyfile'), 'utf8');
const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
const dockerignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8').split('\n');
const railway = JSON.parse(readFileSync(join(ROOT, 'railway.json'), 'utf8')) as {
  build?: { builder?: string };
  deploy?: { healthcheckPath?: string };
};

const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1');

/** The value of a header set on every response, from the Caddyfile's unmatched `header { ... }` block. */
function header(name: string): string | undefined {
  const match = caddyfile.match(new RegExp(`^\\s+${name} (.+)$`, 'm'));
  return match ? unquote(match[1]) : undefined;
}

/** The paths a named matcher covers, from its `@name path ...` line. */
function matcherPaths(matcher: string): string[] {
  const match = caddyfile.match(new RegExp(`^\\s*@${matcher} path (.+)$`, 'm'));
  return match ? match[1].trim().split(/\s+/) : [];
}

/** The Cache-Control value a `header @matcher Cache-Control ...` line sets. */
function cacheControl(matcher: string): string | undefined {
  const match = caddyfile.match(new RegExp(`^\\s*header @${matcher} Cache-Control (.+)$`, 'm'));
  return match ? unquote(match[1]) : undefined;
}

/** The CSP as a map of directive name to its list of sources. */
function cspDirectives(): Map<string, string[]> {
  const value = header('Content-Security-Policy') ?? '';
  return new Map(
    value
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((words) => words[0])
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe('the live image', () => {
  it('builds with Node and serves with Caddy, nothing else', () => {
    expect(dockerfile).toMatch(/^FROM node:22-alpine AS build$/m);
    expect(dockerfile).toMatch(/^FROM caddy:2-alpine$/m);
    expect(dockerfile).toMatch(/^COPY Caddyfile \/etc\/caddy\/Caddyfile$/m);
    expect(dockerfile).toMatch(/^COPY --from=build \/app\/dist \/srv$/m);
  });

  it('drops the build manifest, which only the staging password gate needs', () => {
    expect(dockerfile).toMatch(/^RUN npm run build && rm -rf dist\/\.vite$/m);
  });

  it('carries no password gate and no secret', () => {
    expect(dockerfile).not.toMatch(/vite preview|npm start|SITE_/);
    for (const name of ['.env*', '.renderMCP', 'server/.cache', 'server/data/processed', 'node_modules', '.git']) {
      expect(dockerignore, name).toContain(name);
    }
  });

  it('tells Railway to build the Dockerfile and to check /healthz', () => {
    expect(railway.build?.builder).toBe('DOCKERFILE');
    expect(railway.deploy?.healthcheckPath).toBe('/healthz');
  });
});

describe('the live server', () => {
  it('listens on the port Railway gives it, behind Railway TLS', () => {
    expect(caddyfile).toMatch(/^:\{\$PORT:8080\} \{$/m);
    expect(caddyfile).toMatch(/^\s+auto_https off$/m);
    expect(caddyfile).toMatch(/^\s+admin off$/m);
  });

  it('serves the built files from /srv', () => {
    expect(caddyfile).toMatch(/^\s+root \* \/srv$/m);
    expect(caddyfile).toMatch(/^\s+file_server$/m);
  });

  it('sends /app on to /app/, answers the health check, and hides the manifest', () => {
    expect(caddyfile).toMatch(/^\s+redir \/app \/app\/ permanent$/m);
    expect(caddyfile).toMatch(/^\s+respond \/healthz "ok" 200$/m);
    expect(matcherPaths('hidden')).toEqual(['/.vite/*']);
    expect(caddyfile).toMatch(/^\s+respond @hidden 404$/m);
  });

  it.each([
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Cross-Origin-Embedder-Policy', 'require-corp'],
    ['Strict-Transport-Security', 'max-age=31536000'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ])('sends %s: %s on every response', (name, value) => {
    expect(header(name)).toBe(value);
  });

  it('does not announce the server software', () => {
    expect(caddyfile).toMatch(/^\s+-Server$/m);
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
    expect(matcherPaths('assets')).toEqual(['/assets/*']);
    expect(cacheControl('assets')).toBe('public, max-age=31536000, immutable');
    expect(matcherPaths('pages')).toEqual(['/', '/index.html', '/app/', '/app/index.html', '/concepts.html']);
    expect(cacheControl('pages')).toBe('no-cache');
  });
});

describe('the pages the live site serves', () => {
  it('have no inline script, which the content security policy would block', () => {
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

  it('load the concepts guide script from its own file', () => {
    expect(existsSync(join(ROOT, 'public', 'concepts.js'))).toBe(true);
    expect(readFileSync(join(ROOT, 'public', 'concepts.html'), 'utf8')).toContain('<script src="concepts.js"></script>');
  });
});
