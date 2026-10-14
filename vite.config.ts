import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordGate } from './server/passwordGate.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Headers that make the page cross origin isolated.
 *
 * The WASM runtime uses its faster multi threaded backend only when the page
 * is cross origin isolated, and that needs these two headers. Without them the
 * model still runs, just on a slower single threaded path.
 *
 * They are set for both `dev` and `preview` so the app behaves the same
 * whichever one you use.
 */
const CROSS_ORIGIN_ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  // Empty prefix loads every variable, but only here on the server. Nothing
  // without the VITE_ prefix ever reaches client code.
  const env = loadEnv(mode, process.cwd(), '');

  // The gate guards `vite` and `vite preview`. Builds and the test runner do
  // not serve anything over HTTP, so they run without needing the password.
  const serving = command === 'serve' && mode !== 'test' && !process.env.VITEST;

  // Render sets RENDER=true, PORT, and the service's onrender.com hostname.
  // There `npm start` (vite preview) must listen on every interface, on the
  // port Render gives it, and accept requests addressed to that hostname.
  // Locally none of these are set, so preview stays on localhost.
  const onRender = env.RENDER === 'true';

  return {
  // Two pages: the public landing page (index.html) and the visualizer behind
  // the password (app/index.html). 'mpa' turns off the fallback that answers
  // unknown paths with index.html, so a wrong URL is a 404, not the landing page.
  appType: 'mpa',
  plugins: [...(serving ? [passwordGate(env)] : []), react()],
  server: {
    headers: CROSS_ORIGIN_ISOLATION,
    // The app makes no cross origin requests to its own server, and Vite's
    // CORS middleware runs before the password gate, answering OPTIONS itself
    // and letting other local sites read files the gate serves. So it is off.
    cors: false,
  },
  preview: {
    headers: CROSS_ORIGIN_ISOLATION,
    // Off for the same reason as on the dev server.
    cors: false,
    ...(onRender && {
      host: true,
      port: Number(env.PORT) || 10000,
      strictPort: true,
      allowedHosts: env.RENDER_EXTERNAL_HOSTNAME ? [env.RENDER_EXTERNAL_HOSTNAME] : [],
    }),
  },
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
  worker: {
    // The worker imports ES modules, so it cannot be bundled as a classic script.
    format: 'es',
  },
  optimizeDeps: {
    // Pre-bundling the runtime here breaks its wasm resolution in dev.
    exclude: ['@huggingface/transformers'],
  },
  };
});
