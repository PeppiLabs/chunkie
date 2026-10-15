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

/**
 * The text of the `(security_headers)` snippet's `header { ... }` block, which
 * the site and its error handler both import. Searching only here means a
 * stray line elsewhere in the file cannot satisfy a header check.
 */
const headerBlock = caddyfile.match(/^\(security_headers\) \{\n\theader \{\n([\s\S]*?)^\t\}$/m)?.[1] ?? '';

/** The value of a header set on every response, from the snippet's `header { ... }` block. */
function header(name: string): string | undefined {
  const match = headerBlock.match(new RegExp(`^\\s+${name} (.+)$`, 'm'));
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
    const stages = dockerfile.split(/^(?=FROM )/m).filter((stage) => stage.startsWith('FROM '));
    expect(stages).toHaveLength(2);
    expect(stages[0]).toMatch(/^FROM node:22-alpine AS build$/m);
    // Building in /app would collide with the visualizer's app/ entry and drop the real index.html.
    expect(dockerfile).toMatch(/^WORKDIR \/site$/m);
    expect(dockerfile).not.toMatch(/^WORKDIR \/app$/m);
    const last = stages[stages.length - 1];
    expect(last.startsWith('FROM caddy:2-alpine')).toBe(true);
    const instructions = last
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    expect(instructions).toEqual([
      'FROM caddy:2-alpine',
      'COPY Caddyfile /etc/caddy/Caddyfile',
      'COPY --from=build /site/dist /srv',
      'ENV PORT=8080',
      'EXPOSE 8080',
    ]);
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

  it('sets the security headers on normal responses', () => {
    expect(caddyfile).toMatch(/^\timport security_headers$/m);
  });

  it('does not announce the server software', () => {
    expect(headerBlock).toMatch(/^\s+-Server$/m);
  });

  it('sets the security headers on error responses too', () => {
    expect(caddyfile).toMatch(/^\s+handle_errors \{$/m);
    const body = caddyfile.match(/^\s+handle_errors \{\n([\s\S]*?)^\t\}$/m)?.[1] ?? '';
    expect(body).toMatch(/^\t\timport security_headers$/m);
  });

  it('does not allow a CDN', () => {
    expect(caddyfile).not.toContain('jsdelivr');
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
    expect(matcherPaths('pages')).toEqual(['/', '/index.html', '/app/', '/app/index.html', '/concepts.html', '/concepts.js']);
    expect(cacheControl('pages')).toBe('no-cache');
  });
});

describe('the dependencies behind the live site', () => {
  it('pins the same onnxruntime-web version transformers.js uses', () => {
    const read = (path: string) =>
      JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as { dependencies: Record<string, string> };
    const root = read('package.json');
    const transformers = read('node_modules/@huggingface/transformers/package.json');
    expect(root.dependencies['onnxruntime-web']).toBe(transformers.dependencies['onnxruntime-web']);
  });
});

describe('the pages the live site serves', () => {
  it('the embedding runtime ships with the build instead of coming from a CDN', () => {
    const worker = readFileSync(join(ROOT, 'src', 'worker', 'embedder.worker.ts'), 'utf8');
    expect(worker).toMatch(/wasmPaths/);
    expect(worker).toMatch(/env\.useWasmCache = false/);
    expect(worker).toMatch(/onnxruntime-web\/ort-wasm-simd-threaded/);
  });

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
