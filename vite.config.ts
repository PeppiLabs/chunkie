import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
export default defineConfig({
  plugins: [react()],
  server: {
    headers: CROSS_ORIGIN_ISOLATION,
  },
  preview: {
    headers: CROSS_ORIGIN_ISOLATION,
  },
  build: {
    // The embedding runtime is large and loads in a worker, so the warning
    // about chunk size is expected rather than something to act on.
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    // The worker imports ES modules, so it cannot be bundled as a classic script.
    format: 'es',
  },
  optimizeDeps: {
    // Pre-bundling the runtime here breaks its wasm resolution in dev.
    exclude: ['@huggingface/transformers'],
  },
});
