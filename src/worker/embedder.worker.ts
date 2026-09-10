/// <reference lib="webworker" />
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Runs the embedding model off the main thread.
 *
 * The model is a few tens of megabytes and each batch takes real CPU time, so
 * doing this on the UI thread would freeze the page. The worker owns the model
 * for the life of the tab and streams progress back as it goes.
 */

// Nothing here needs the local model cache that a bundler would try to resolve.
env.allowLocalModels = false;

/** Sentence embedding model: small enough to download quickly, good enough to teach with. */
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
/** Chunks embedded per forward pass. Small batches keep progress smooth. */
const BATCH_SIZE = 8;

type Incoming =
  | { type: 'warm' }
  | { type: 'embed'; requestId: number; texts: string[] };

type Outgoing =
  | { type: 'model-progress'; ratio: number; label: string }
  | { type: 'model-ready' }
  | { type: 'embed-progress'; requestId: number; done: number; total: number }
  | { type: 'embed-result'; requestId: number; buffer: ArrayBuffer; count: number; dims: number }
  | { type: 'error'; requestId: number | null; message: string };

const post = (message: Outgoing, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

/**
 * Turns a runtime failure into something a visitor can act on.
 *
 * The raw errors here are things like "Failed to fetch", which tells a
 * non-technical reader nothing about what went wrong or what to do next.
 */
function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/fetch|network|load model|Unauthorized|Failed to load/i.test(raw)) {
    return 'The model could not be downloaded. Check your internet connection and try again.';
  }
  if (/memory|allocation|out of memory/i.test(raw)) {
    return 'The browser ran out of memory while running the model. Try a smaller file, or larger chunks so there are fewer of them.';
  }
  if (/wasm|WebAssembly|backend/i.test(raw)) {
    return 'This browser could not start the model runtime. It needs a recent version of Chrome, Firefox, Edge, or Safari.';
  }

  return `The model failed to run: ${raw}`;
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;

/** Loads the model once, reusing the same promise for every later call. */
function loadModel(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;

  extractor = pipeline('feature-extraction', MODEL_ID, {
    // Quantised weights: roughly a quarter of the download, no visible quality loss here.
    dtype: 'q8',
    progress_callback: (event: { status?: string; progress?: number; file?: string }) => {
      if (event.status === 'progress' && typeof event.progress === 'number') {
        post({
          type: 'model-progress',
          ratio: Math.min(1, event.progress / 100),
          label: `Downloading the model (${Math.round(event.progress)}%)`,
        });
      } else if (event.status === 'ready' || event.status === 'done') {
        post({ type: 'model-progress', ratio: 1, label: 'Model ready' });
      }
    },
  }) as Promise<FeatureExtractionPipeline>;

  // A failed load must not be cached, or every later attempt fails the same way.
  extractor.catch(() => {
    extractor = null;
  });

  return extractor;
}

/** Embeds every text, reporting progress after each batch. */
async function embedAll(requestId: number, texts: string[]) {
  const model = await loadModel();
  post({ type: 'model-ready' });

  const dims = 384;
  const flat = new Float32Array(texts.length * dims);
  let written = 0;

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const output = await model(batch, { pooling: 'mean', normalize: true });
    const values = output.data as Float32Array;

    flat.set(values.subarray(0, batch.length * dims), written * dims);
    written += batch.length;

    post({ type: 'embed-progress', requestId, done: written, total: texts.length });
  }

  // Hand the buffer over rather than copying it back across the boundary.
  post(
    { type: 'embed-result', requestId, buffer: flat.buffer, count: texts.length, dims },
    [flat.buffer],
  );
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const message = event.data;

  try {
    if (message.type === 'warm') {
      await loadModel();
      post({ type: 'model-ready' });
      return;
    }

    if (message.type === 'embed') {
      await embedAll(message.requestId, message.texts);
    }
  } catch (error) {
    const requestId = message.type === 'embed' ? message.requestId : null;
    post({ type: 'error', requestId, message: readableError(error) });
  }
};
