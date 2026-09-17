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
  /** Format of document if known. */
  docType?: 'chat' | 'pdf' | 'docx' | 'markdown' | 'text' | 'csv' | 'code';
}

/** Strategy families grouping related chunking methods. */
export type ChunkFamily = 'size' | 'structure' | 'meaning' | 'chat';

/** How the document or transcript gets cut into retrievable pieces. */
export type ChunkStrategy =
  // Size
  | 'fixed-window'
  | 'recursive'
  | 'sentence'
  | 'symbol'
  | 'whole'
  // Structure
  | 'section'
  | 'paragraph'
  | 'toc'
  | 'page'
  | 'table-rows'
  | 'code'
  | 'elements'
  // Meaning
  | 'semantic'
  | 'topic'
  // Chat
  | 'per-message'
  | 'per-conversation'
  | 'session'
  | 'day-wise';

export interface ChunkOptions {
  strategy: ChunkStrategy;
  /** Target characters or word pieces per chunk. */
  size: number;
  /** Characters repeated from previous chunk. */
  overlap: number;
  /** Messages or units grouped per chunk. */
  groupSize: number;

  // Strategy-specific options
  /** Characters to split at for the 'symbol' strategy. */
  splitSymbols?: string;
  /** Number of symbol pieces to group into a chunk. */
  piecesPerChunk?: number;
  /** In recursive/sentence, avoid crossing heading boundaries. */
  respectHeadings?: boolean;
  /** In sentence, avoid crossing paragraph breaks. */
  respectParagraphs?: boolean;
  /** In 'whole' or 'page', whether to split chunks that exceed max size. */
  splitLong?: boolean;
  /** Table of contents heading depth (1 = #, 2 = ##, 3 = ###). */
  tocDepth?: number;
  /** Pages per chunk for paged documents. */
  pagesPerChunk?: number;
  /** Rows per chunk for CSV/table documents. */
  rowsPerChunk?: number;
  /** Table row formatting style. */
  rowFormat?: 'pairs' | 'table';
  /** Sensitivity threshold for semantic & topic segmentation. */
  sensitivity?: 'fewer' | 'balanced' | 'more';
  /** Silence gap in minutes to identify conversation sessions. */
  gapMinutes?: number;
  /** Maximum messages in a session. */
  maxMessages?: number;

  // Personalization settings
  /** Put heading breadcrumbs (e.g. "Section > Subsection") in front of chunks. */
  contextHeadingPath?: boolean;
  /** Put document source name in front of chunks. */
  contextTitle?: boolean;
  /** Custom user text prefix to put in front of chunks. */
  contextPrefix?: string;
  /** Automatically merge chunks smaller than this character threshold. */
  minChunkSize?: number;
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
