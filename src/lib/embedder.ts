import type { EmbedProgress } from '../types';

/**
 * Main-thread client for the embedding worker.
 *
 * Wraps the message passing in a promise per request, so callers can await a
 * list of vectors and follow progress along the way.
 */

/** Sentence embedding model, kept in step with the worker. */
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
/** Values per embedding for this model. */
export const VECTOR_DIMS = 384;

/**
 * How long a single request may run before we give up on it.
 *
 * Without this, a worker that stalls leaves its promise pending forever, the
 * caller's finally block never runs, and the button stays disabled until the
 * visitor reloads the page. Generous enough for a slow first download of the
 * model on a poor connection.
 */
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

type ProgressListener = (progress: EmbedProgress) => void;

interface PendingRequest {
  resolve: (vectors: Float32Array[]) => void;
  reject: (error: Error) => void;
  /** Progress for this request only, so concurrent runs cannot cross wires. */
  onProgress?: ProgressListener;
  timer: ReturnType<typeof setTimeout>;
}

export class Embedder {
  private worker: Worker;
  private pending = new Map<number, PendingRequest>();
  /** Listeners for events not tied to a request, notably the model download. */
  private modelListeners = new Set<ProgressListener>();
  private nextRequestId = 1;

  constructor() {
    this.worker = new Worker(new URL('../worker/embedder.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = this.handleMessage;
    this.worker.onerror = (event) => this.failAll(event.message || 'The embedding worker crashed.');
  }

  /**
   * Subscribes to model level progress, such as the download.
   *
   * Returns a function that unsubscribes. Per request progress does not come
   * through here: pass a callback to embed instead.
   */
  onModelProgress(listener: ProgressListener): () => void {
    this.modelListeners.add(listener);
    return () => this.modelListeners.delete(listener);
  }

  private emitModel(progress: EmbedProgress) {
    for (const listener of this.modelListeners) listener(progress);
  }

  /** Starts downloading the model before anyone asks for a vector. */
  warm() {
    this.worker.postMessage({ type: 'warm' });
  }

  /** Embeds a list of texts and resolves with one vector per text. */
  embed(texts: string[], onProgress?: ProgressListener): Promise<Float32Array[]> {
    if (texts.length === 0) return Promise.resolve([]);

    const requestId = this.nextRequestId++;

    return new Promise<Float32Array[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            'The model took too long to respond. Reload the page and try again, or try a smaller file.',
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, onProgress, timer });
      this.worker.postMessage({ type: 'embed', requestId, texts });
    });
  }

  /** Tears the worker down, used when the app unmounts. */
  dispose() {
    this.failAll('The embedder was shut down.');
    this.modelListeners.clear();
    this.worker.terminate();
  }

  /** Rejects every in-flight request, so no caller is left waiting forever. */
  private failAll(reason: string) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
    }
    this.pending.clear();
    this.emitModel({ phase: 'error', ratio: 0, label: reason });
  }

  /** Settles one request and clears its timeout. */
  private settle(requestId: number): PendingRequest | undefined {
    const request = this.pending.get(requestId);
    if (!request) return undefined;

    clearTimeout(request.timer);
    this.pending.delete(requestId);
    return request;
  }

  private handleMessage = (event: MessageEvent) => {
    const message = event.data;

    switch (message.type) {
      case 'model-progress':
        this.emitModel({ phase: 'loading-model', ratio: message.ratio, label: message.label });
        break;

      case 'model-ready':
        this.emitModel({ phase: 'ready', ratio: 1, label: 'Model ready' });
        break;

      case 'embed-progress': {
        // Routed to the request that asked for it, never broadcast. Two runs
        // can overlap, and one reporting "1 of 1" over the other's bar reads
        // as finished when it is not.
        const request = this.pending.get(message.requestId);
        const ratio = message.total === 0 ? 1 : message.done / message.total;
        request?.onProgress?.({
          phase: 'embedding',
          ratio,
          label: `Embedded ${message.done} of ${message.total} chunks`,
        });
        break;
      }

      case 'embed-result': {
        const request = this.settle(message.requestId);
        if (!request) break;

        const flat = new Float32Array(message.buffer);
        const vectors: Float32Array[] = [];
        for (let i = 0; i < message.count; i++) {
          vectors.push(flat.slice(i * message.dims, (i + 1) * message.dims));
        }

        request.onProgress?.({ phase: 'ready', ratio: 1, label: 'Vectors ready' });
        request.resolve(vectors);
        break;
      }

      case 'error': {
        // A failure with no request id came from loading the model itself, so
        // it affects everything, including a warm up nobody is awaiting.
        if (message.requestId === null) {
          this.failAll(message.message);
          break;
        }

        const request = this.settle(message.requestId);
        request?.onProgress?.({ phase: 'error', ratio: 0, label: message.message });
        request?.reject(new Error(message.message));
        break;
      }
    }
  };
}
