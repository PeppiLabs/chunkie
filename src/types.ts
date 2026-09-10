/**
 * Shared types for the RAG pipeline.
 *
 * The whole pipeline runs in the browser, so these types describe data that
 * lives in memory for the length of a visit and is never sent anywhere.
 */

/** One line of a chat transcript, after parsing an uploaded file. */
export interface ChatMessage {
  /** Stable id assigned at parse time, used as a React key. */
  id: string;
  /** Display name of whoever wrote the line. */
  speaker: string;
  /** The message body. */
  text: string;
  /** ISO timestamp when available, otherwise an empty string. */
  timestamp: string;
}

/** A parsed transcript plus the metadata we show on the upload step. */
export interface Transcript {
  /** File name the messages came from. */
  sourceName: string;
  messages: ChatMessage[];
  /** Distinct speaker names, in first-seen order. */
  speakers: string[];
  /** Entries in the file we could not read, reported rather than hidden. */
  skipped: number;
}

/** How the transcript gets cut into retrievable pieces. */
export type ChunkStrategy = 'per-message' | 'fixed-window' | 'per-conversation';

export interface ChunkOptions {
  strategy: ChunkStrategy;
  /** Target characters per chunk, used by fixed-window. */
  size: number;
  /** Characters repeated from the previous chunk, used by fixed-window. */
  overlap: number;
  /** Messages grouped per chunk, used by per-conversation. */
  groupSize: number;
}

/** One retrievable piece of the transcript. */
export interface Chunk {
  id: string;
  /** Position in the chunk list, starting at 0. */
  index: number;
  /** The text that actually gets embedded and searched. */
  text: string;
  /** Ids of the messages this chunk covers. */
  messageIds: string[];
  /** Speakers appearing in this chunk, for the chunk card header. */
  speakers: string[];
  /** Characters carried over from the previous chunk, 0 when there is none. */
  overlapChars: number;
}

/** A chunk once it has been turned into numbers. */
export interface EmbeddedChunk extends Chunk {
  /** Unit-length embedding, 384 values for the model we ship. */
  vector: Float32Array;
  /** Position on the 2D map, filled in after the projection runs. */
  point: { x: number; y: number };
}

/** One row of the search results table. */
export interface SearchHit {
  chunk: EmbeddedChunk;
  /** Cosine similarity against the query, in the range -1 to 1. */
  score: number;
  /** Rank starting at 1, by descending score. */
  rank: number;
}

/** Progress reported while the model loads and while chunks are embedded. */
export interface EmbedProgress {
  phase: 'idle' | 'loading-model' | 'embedding' | 'ready' | 'error';
  /** 0 to 1. */
  ratio: number;
  /** Human readable status for the progress label. */
  label: string;
}
