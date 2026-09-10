import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chunkTranscript, DEFAULT_CHUNK_OPTIONS } from '../lib/chunk';
import { Embedder } from '../lib/embedder';
import { cosineSimilarity, projectTo2D, type Projection } from '../lib/vector';
import { parseTranscript, MAX_FILE_BYTES } from '../lib/parse';
import type {
  ChunkOptions,
  EmbedProgress,
  EmbeddedChunk,
  SearchHit,
  Transcript,
} from '../types';

/** The four stages a visitor walks through. */
export type Step = 'upload' | 'chunk' | 'embed' | 'search';
export const STEPS: Step[] = ['upload', 'chunk', 'embed', 'search'];

/** Results shown for a query, kept small so the ranking stays readable. */
const TOP_K = 5;

/**
 * Owns the whole pipeline: transcript in, chunks, vectors, and search results out.
 *
 * Everything lives in React state for the length of the visit. Nothing is
 * written to a server, and nothing survives a page refresh.
 */
export function useRagPipeline() {
  const [step, setStep] = useState<Step>('upload');
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [chunkOptions, setChunkOptions] = useState<ChunkOptions>(DEFAULT_CHUNK_OPTIONS);
  const [embedded, setEmbedded] = useState<EmbeddedChunk[] | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [progress, setProgress] = useState<EmbedProgress>({
    phase: 'idle',
    ratio: 0,
    label: '',
  });
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [queryVector, setQueryVector] = useState<Float32Array | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  /**
   * True only while a run the visitor started is in flight.
   *
   * Progress also reports the background model download, which begins as soon
   * as a transcript loads. Deriving "busy" from progress alone would disable
   * the button before anyone had pressed it, so the two are tracked apart.
   */
  const [embedding, setEmbedding] = useState(false);

  const embedderRef = useRef<Embedder | null>(null);
  /**
   * Bumped whenever the chunk set changes.
   *
   * Embedding and searching are both asynchronous, so a run started against one
   * set of chunks can finish after the visitor has already changed the chunking.
   * Every run captures this counter and discards its own result if the counter
   * has moved on, which stops a stale result from overwriting fresh state.
   */
  const generationRef = useRef(0);

  // One embedder for the life of the component, torn down on unmount.
  useEffect(() => {
    const embedder = new Embedder();
    embedderRef.current = embedder;

    /**
     * Model level progress, which includes the background download.
     *
     * The download starts as soon as a transcript loads, long before anyone
     * presses Generate. If it fails there, nothing else in the app is waiting
     * on a promise to reject, so this is the only place the failure can be
     * turned into something the visitor actually sees.
     */
    const unsubscribe = embedder.onModelProgress((update) => {
      setProgress(update);
      if (update.phase === 'error') setError(update.label);
    });

    return () => {
      // Unsubscribe first: disposing reports a shutdown that is not a failure
      // the visitor needs to hear about.
      unsubscribe();
      embedder.dispose();
      embedderRef.current = null;
    };
  }, []);

  /** Chunks are cheap to compute, so they follow the options directly. */
  const chunks = useMemo(
    () => (transcript ? chunkTranscript(transcript, chunkOptions) : []),
    [transcript, chunkOptions],
  );

  /**
   * Vectors describe a specific set of chunks, so any change to the chunking
   * invalidates them. Dropping them here is what stops the search step from
   * quietly scoring a query against a stale set.
   */
  useEffect(() => {
    generationRef.current += 1;
    setEmbedded(null);
    setProjection(null);
    setHits(null);
    setQueryVector(null);
    setProgress({ phase: 'idle', ratio: 0, label: '' });
  }, [chunks]);

  /** Parses a file and moves to the chunking step. */
  const loadFile = useCallback(async (file: File) => {
    setError(null);

    if (file.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep it under ${
          MAX_FILE_BYTES / 1024 / 1024
        } MB so everything stays fast in the browser.`,
      );
      return;
    }

    try {
      const raw = await file.text();
      setTranscript(parseTranscript(file.name, raw));
      // Stay on this step so the visitor can read the transcript before chunking.
      // The model download starts now regardless, so it is ready when they need it.
      embedderRef.current?.warm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That file could not be read.');
    }
  }, []);

  /** Loads one of the bundled sample transcripts by URL. */
  const loadSample = useCallback(async (path: string, label: string) => {
    setError(null);

    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Could not load the ${label} sample (${response.status}).`);

      setTranscript(parseTranscript(label, await response.text()));
      embedderRef.current?.warm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That sample could not be loaded.');
    }
  }, []);

  /** Embeds every chunk, then lays them out on the 2D map. */
  const runEmbedding = useCallback(async () => {
    const embedder = embedderRef.current;
    if (!embedder || chunks.length === 0) return;

    const generation = generationRef.current;
    setError(null);
    setEmbedding(true);
    setProgress({ phase: 'loading-model', ratio: 0, label: 'Starting the model' });

    try {
      const vectors = await embedder.embed(chunks.map((chunk) => chunk.text), (update) => {
        // Late progress from a superseded run must not drive the bar.
        if (generationRef.current === generation) setProgress(update);
      });
      // The chunking changed while this ran, so these vectors describe nothing
      // the visitor is looking at any more.
      if (generationRef.current !== generation) return;

      const layout = projectTo2D(vectors);

      setEmbedded(
        chunks.map((chunk, index) => ({
          ...chunk,
          vector: vectors[index],
          point: layout.points[index],
        })),
      );
      setProjection(layout);
      setProgress({ phase: 'ready', ratio: 1, label: `${chunks.length} vectors ready` });
    } catch (cause) {
      if (generationRef.current !== generation) return;
      const message = cause instanceof Error ? cause.message : 'Embedding failed.';
      setError(message);
      setProgress({ phase: 'error', ratio: 0, label: message });
    } finally {
      // The flag belongs to this run either way, so it always has to come back down.
      setEmbedding(false);
    }
  }, [chunks]);

  /** Embeds the query and ranks every chunk against it. */
  const runSearch = useCallback(
    async (rawQuery: string) => {
      const embedder = embedderRef.current;
      const text = rawQuery.trim();

      if (!embedder || !embedded || !projection || !text) return;

      const generation = generationRef.current;
      setError(null);
      setSearching(true);

      try {
        const [vector] = await embedder.embed([text]);
        // Same guard as embedding: the chunks may have changed underneath us.
        if (generationRef.current !== generation) return;

        const ranked = embedded
          .map((chunk) => ({ chunk, score: cosineSimilarity(vector, chunk.vector) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, TOP_K)
          .map((hit, index) => ({ ...hit, rank: index + 1 }));

        setQueryVector(vector);
        setHits(ranked);
      } catch (cause) {
        if (generationRef.current !== generation) return;
        setError(cause instanceof Error ? cause.message : 'That search could not be run.');
      } finally {
        setSearching(false);
      }
    },
    [embedded, projection],
  );

  /** Where the query lands on the same 2D map as the chunks. */
  const queryPoint = useMemo(
    () => (queryVector && projection ? projection.project(queryVector) : null),
    [queryVector, projection],
  );

  /** Clears everything and returns to the upload step. */
  const reset = useCallback(() => {
    setTranscript(null);
    setChunkOptions(DEFAULT_CHUNK_OPTIONS);
    setQuery('');
    setError(null);
    setStep('upload');
  }, []);

  /** A step is reachable only once the step before it has produced something. */
  const canVisit = useCallback(
    (target: Step) => {
      switch (target) {
        case 'upload':
          return true;
        case 'chunk':
          return transcript !== null;
        case 'embed':
          return chunks.length > 0;
        case 'search':
          return embedded !== null;
      }
    },
    [transcript, chunks.length, embedded],
  );

  return {
    step,
    setStep,
    canVisit,
    transcript,
    chunks,
    chunkOptions,
    setChunkOptions,
    embedded,
    embedding,
    progress,
    error,
    setError,
    query,
    setQuery,
    queryVector,
    queryPoint,
    hits,
    searching,
    loadFile,
    loadSample,
    runEmbedding,
    runSearch,
    reset,
  };
}
