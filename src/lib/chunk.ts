import type { ChatMessage, Chunk, ChunkOptions, Transcript } from '../types';

/**
 * Chunking: cutting a transcript into the pieces that get embedded and searched.
 *
 * Chunk size is the trade-off at the heart of RAG. Cut too small and a chunk
 * loses the context that made it meaningful. Cut too large and the useful
 * sentence gets averaged away by everything around it. The three strategies
 * here let a visitor feel that trade-off rather than read about it.
 */

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  strategy: 'per-message',
  size: 400,
  overlap: 80,
  groupSize: 4,
};

/** Renders one message the way it appears inside a chunk. */
function formatMessage(message: ChatMessage): string {
  return `${message.speaker}: ${message.text}`;
}

/** Distinct speakers across a set of messages, in first-seen order. */
function speakersOf(messages: ChatMessage[]): string[] {
  const seen: string[] = [];
  for (const message of messages) {
    if (!seen.includes(message.speaker)) seen.push(message.speaker);
  }
  return seen;
}

/** One chunk per message. Precise, but each chunk knows nothing of its neighbours. */
function chunkPerMessage(messages: ChatMessage[]): Chunk[] {
  return messages.map((message, index) => ({
    id: `c${index}`,
    index,
    text: formatMessage(message),
    messageIds: [message.id],
    speakers: [message.speaker],
    overlapChars: 0,
  }));
}

/** One chunk per fixed group of consecutive messages, keeping exchanges together. */
function chunkPerConversation(messages: ChatMessage[], groupSize: number): Chunk[] {
  const size = Math.max(1, Math.floor(groupSize));
  const chunks: Chunk[] = [];

  for (let start = 0; start < messages.length; start += size) {
    const group = messages.slice(start, start + size);
    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text: group.map(formatMessage).join('\n'),
      messageIds: group.map((m) => m.id),
      speakers: speakersOf(group),
      overlapChars: 0,
    });
  }

  return chunks;
}

/**
 * Fixed character windows with overlap.
 *
 * The transcript becomes one long string, then we slide a window across it.
 * The overlap matters: without it, a sentence that straddles a boundary is
 * split across two chunks and neither one retrieves well. We also nudge each
 * cut to the nearest space so chunks do not end mid-word.
 */
function chunkFixedWindow(messages: ChatMessage[], size: number, overlap: number): Chunk[] {
  const windowSize = Math.max(50, Math.floor(size));
  // Overlap has to stay below the window, otherwise the window never advances.
  const step = Math.max(1, windowSize - Math.min(Math.floor(overlap), windowSize - 1));

  // Build the flat text, recording which message owns each character range.
  const spans: { start: number; end: number; id: string }[] = [];
  const messageById = new Map<string, ChatMessage>();
  let flat = '';
  for (const message of messages) {
    messageById.set(message.id, message);
    const rendered = formatMessage(message);
    const start = flat.length;
    flat += rendered + '\n';
    spans.push({ start, end: start + rendered.length, id: message.id });
  }
  flat = flat.trimEnd();

  /**
   * Moves a cut point to the nearest following space, so words stay whole.
   *
   * Both ends of a window get snapped. Snapping only the end would leave every
   * later chunk starting mid-word, which looks like a bug to anyone reading
   * the chunk list.
   */
  const snap = (position: number): number => {
    if (position <= 0) return 0;
    if (position >= flat.length) return flat.length;

    const nextSpace = flat.indexOf(' ', position);
    // Only snap when a space is close by, otherwise honour the requested size.
    if (nextSpace === -1 || nextSpace - position >= 20) return position;
    // Land after the space rather than on it, so chunks do not start blank.
    return nextSpace + 1;
  };

  const chunks: Chunk[] = [];
  let cursor = 0;
  // Where the previous chunk's stored text actually ends in the flat string.
  let previousTextEnd = 0;
  // Sweep pointer into spans. The window only moves forward, so a span that
  // ends before the cursor can never be reached again. Advancing this rather
  // than filtering the whole list keeps the pass linear instead of quadratic,
  // which matters because this runs synchronously on every slider tick.
  let firstSpan = 0;

  while (cursor < flat.length) {
    const end = snap(Math.min(cursor + windowSize, flat.length));
    const raw = flat.slice(cursor, end);
    const text = raw.trim();

    if (text) {
      while (firstSpan < spans.length && spans[firstSpan].end <= cursor) firstSpan++;

      let lastSpan = firstSpan;
      while (lastSpan < spans.length && spans[lastSpan].start < end) lastSpan++;

      const covered = spans.slice(firstSpan, lastSpan);
      const coveredMessages: ChatMessage[] = [];
      for (const span of covered) {
        const message = messageById.get(span.id);
        if (message) coveredMessages.push(message);
      }

      // Leading whitespace is trimmed off the text, so the stored text starts
      // here rather than at the cursor.
      const trimmedFromStart = raw.length - raw.trimStart().length;
      const textStart = cursor + trimmedFromStart;
      // How much of this chunk's stored text also appears in the previous one.
      // Both sides must be measured on the trimmed text, or the count includes
      // a trailing space that was never stored and the highlight runs one
      // character long.
      const shared = chunks.length === 0 ? 0 : Math.max(0, previousTextEnd - textStart);

      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text,
        messageIds: covered.map((span) => span.id),
        speakers: speakersOf(coveredMessages),
        overlapChars: Math.min(shared, text.length),
      });

      previousTextEnd = textStart + text.length;
    }

    if (end >= flat.length) break;

    const next = snap(cursor + step);
    // Snapping must never stall the window, or this loop would not terminate.
    cursor = next > cursor ? next : cursor + step;
  }

  return chunks;
}

/** Cuts a transcript into chunks using the chosen strategy. */
export function chunkTranscript(transcript: Transcript, options: ChunkOptions): Chunk[] {
  const { messages } = transcript;

  switch (options.strategy) {
    case 'fixed-window':
      return chunkFixedWindow(messages, options.size, options.overlap);
    case 'per-conversation':
      return chunkPerConversation(messages, options.groupSize);
    case 'per-message':
    default:
      return chunkPerMessage(messages);
  }
}

/** Plain-language description of each strategy, shown beside the picker. */
export const STRATEGY_INFO: Record<
  ChunkStrategyKey,
  { title: string; blurb: string; tradeoff: string }
> = {
  'per-message': {
    title: 'One chunk per message',
    blurb: 'Every single message becomes its own searchable piece.',
    tradeoff: 'Very precise, but a short reply like "yes, do that" loses the question it was answering.',
  },
  'fixed-window': {
    title: 'Fixed windows with overlap',
    blurb: 'The whole chat becomes one long text, then gets sliced every few hundred characters.',
    tradeoff: 'The most common approach in real systems. Overlap keeps sentences from being cut in half.',
  },
  'per-conversation': {
    title: 'Groups of messages',
    blurb: 'Consecutive messages are kept together so a question and its answer stay in one piece.',
    tradeoff: 'Keeps context intact, but a large group can bury one useful line among many.',
  },
};

type ChunkStrategyKey = ChunkOptions['strategy'];
