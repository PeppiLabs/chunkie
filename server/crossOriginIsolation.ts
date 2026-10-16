import type { Connect, Plugin } from 'vite';

/**
 * Headers that make the visualizer cross origin isolated.
 *
 * The WASM runtime uses its faster multi threaded backend only when the page
 * is cross origin isolated, and that needs these two headers. Without them the
 * model still runs, just on a slower single threaded path.
 *
 * The landing page is the exception. It runs no model, and it embeds the demo
 * video from YouTube, whose player sends no Cross-Origin-Embedder-Policy of its
 * own, so the browser would refuse to show it inside an isolated page. The
 * landing page gets the opener policy only. The Caddyfile does the same on the
 * live site, and a test checks the two agree.
 */
export const LANDING_PAGES = ['/', '/index.html'];

export function crossOriginHeaders(pathname: string): Record<string, string> {
  return LANDING_PAGES.includes(pathname)
    ? { 'Cross-Origin-Opener-Policy': 'same-origin' }
    : { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
}

/** Sets the headers for both `dev` and `preview`, so the app behaves the same whichever one you use. */
export function crossOriginIsolation(): Plugin {
  const setHeaders: Connect.NextHandleFunction = (req, res, next) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    for (const [name, value] of Object.entries(crossOriginHeaders(pathname))) res.setHeader(name, value);
    next();
  };
  return {
    name: 'chunkie-cross-origin-isolation',
    configureServer(server) {
      server.middlewares.use(setHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(setHeaders);
    },
  };
}
