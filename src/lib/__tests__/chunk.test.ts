import { describe, expect, it } from 'vitest';
import { chunkTranscript, DEFAULT_CHUNK_OPTIONS } from '../chunk';
import type { ChunkOptions, Transcript } from '../../types';

function transcriptOf(texts: string[]): Transcript {
  return {
    sourceName: 'test.json',
    messages: texts.map((text, index) => ({
      id: `m${index}`,
      speaker: index % 2 === 0 ? 'Ana' : 'Ben',
      text,
      timestamp: '',
    })),
    speakers: ['Ana', 'Ben'],
    skipped: 0,
  };
}

const LONG = transcriptOf(
  Array.from({ length: 40 }, (_, i) => `Message number ${i} with enough words in it to matter.`),
);

describe('per-message chunking', () => {
  it('produces exactly one chunk per message', () => {
    const chunks = chunkTranscript(LONG, { ...DEFAULT_CHUNK_OPTIONS, strategy: 'per-message' });
    expect(chunks).toHaveLength(40);
  });

  it('carries no overlap', () => {
    const chunks = chunkTranscript(LONG, { ...DEFAULT_CHUNK_OPTIONS, strategy: 'per-message' });
    expect(chunks.every((chunk) => chunk.overlapChars === 0)).toBe(true);
  });
});

describe('per-conversation chunking', () => {
  it('groups consecutive messages', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'per-conversation',
      groupSize: 4,
    });
    expect(chunks).toHaveLength(10);
    expect(chunks[0].messageIds).toEqual(['m0', 'm1', 'm2', 'm3']);
  });

  it('keeps every message exactly once', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'per-conversation',
      groupSize: 7,
    });
    const seen = chunks.flatMap((chunk) => chunk.messageIds);
    expect(seen).toHaveLength(40);
    expect(new Set(seen).size).toBe(40);
  });
});

describe('fixed-window chunking', () => {
  it('terminates for every setting the sliders allow', () => {
    // The UI exposes size 100..1200 step 50 and overlap 0..size-50 step 20.
    // A window that never advances would hang the tab, so prove it cannot.
    for (let size = 100; size <= 1200; size += 50) {
      for (let overlap = 0; overlap <= size - 50; overlap += 20) {
        const chunks = chunkTranscript(LONG, {
          ...DEFAULT_CHUNK_OPTIONS,
          strategy: 'fixed-window',
          size,
          overlap,
        });
        expect(chunks.length).toBeGreaterThan(0);
        // Every chunk must be indexed in order, with no gaps.
        chunks.forEach((chunk, index) => expect(chunk.index).toBe(index));
      }
    }
  });

  it('covers the whole transcript', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'fixed-window',
      size: 300,
      overlap: 60,
    });
    const joined = chunks.map((chunk) => chunk.text).join(' ');
    expect(joined).toContain('Message number 0');
    expect(joined).toContain('Message number 39');
  });

  it('reports overlap that is exactly the tail of the previous chunk', () => {
    // The tinted span in the chunk card is text.slice(0, overlapChars), so the
    // count has to be exact. An earlier version was one too high on most
    // chunks because it measured against the untrimmed window end.
    for (const [size, overlap] of [
      [400, 100],
      [100, 20],
      [250, 60],
      [1200, 400],
      [150, 100],
    ]) {
      const chunks = chunkTranscript(LONG, {
        ...DEFAULT_CHUNK_OPTIONS,
        strategy: 'fixed-window',
        size,
        overlap,
      });

      expect(chunks[0].overlapChars).toBe(0);

      for (let i = 1; i < chunks.length; i++) {
        const carried = chunks[i].text.slice(0, chunks[i].overlapChars);
        if (carried.length === 0) continue;
        // What we tint as carried over must be exactly how the previous chunk ended.
        expect(
          chunks[i - 1].text.endsWith(carried),
          `size=${size} overlap=${overlap} chunk ${i}: ` +
            `carried ${JSON.stringify(carried)} vs previous tail ` +
            JSON.stringify(chunks[i - 1].text.slice(-carried.length)),
        ).toBe(true);
      }
    }
  });

  it('stays linear as the transcript grows', () => {
    // This runs synchronously inside a useMemo on every slider tick, so a
    // quadratic scan froze the tab on a large file.
    //
    // An earlier version compared the time for a small and a large input. The
    // small run took about a millisecond, so dividing by it magnified any
    // hiccup on a shared CI machine into a failure. One large input against a
    // fixed budget avoids that: noise can only slow a run down, and the gap is
    // wide. On a laptop the linear pass takes about 60 ms, and under 700 ms
    // with every core busy. A quadratic scan takes about 17 seconds.
    const transcript = transcriptOf(
      Array.from({ length: 50_000 }, (_, i) => `Message ${i} with a reasonable amount of text in it.`),
    );
    const options: ChunkOptions = {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'fixed-window',
      size: 100,
      overlap: 40,
    };
    const budgetMs = 3000;

    // A few tries, so one badly timed pause on a busy machine is not a failure.
    let fastest = Infinity;
    for (let run = 0; run < 3 && fastest >= budgetMs; run++) {
      const start = performance.now();
      chunkTranscript(transcript, options);
      fastest = Math.min(fastest, performance.now() - start);
    }

    expect(fastest).toBeLessThan(budgetMs);
  }, 60_000);

  it('never reports more overlap than the chunk has text', () => {
    for (const size of [100, 250, 600, 1200]) {
      const chunks = chunkTranscript(LONG, {
        ...DEFAULT_CHUNK_OPTIONS,
        strategy: 'fixed-window',
        size,
        overlap: size - 50,
      });
      for (const chunk of chunks) {
        expect(chunk.overlapChars).toBeLessThanOrEqual(chunk.text.length);
        expect(chunk.overlapChars).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('does not start a chunk in the middle of a word', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'fixed-window',
      size: 350,
      overlap: 80,
    });
    // Every chunk after the first should begin at a word, not a fragment.
    const words = new Set(LONG.messages.flatMap((m) => `Ana: ${m.text}`.split(/\s+/)));
    for (const chunk of chunks.slice(1)) {
      const firstWord = chunk.text.split(/\s+/)[0];
      const known = [...words].some((w) => w === firstWord || w.startsWith(firstWord));
      expect(known, `chunk ${chunk.index} starts with "${firstWord}"`).toBe(true);
    }
  });
});

describe('edge cases', () => {
  const single = transcriptOf(['Only one message here.']);
  const strategies: ChunkOptions['strategy'][] = [
    'per-message',
    'fixed-window',
    'per-conversation',
  ];

  it('handles a single message under every strategy', () => {
    for (const strategy of strategies) {
      const chunks = chunkTranscript(single, { ...DEFAULT_CHUNK_OPTIONS, strategy });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].overlapChars).toBe(0);
    }
  });

  it('handles an empty transcript without throwing', () => {
    const empty: Transcript = { sourceName: 'e.json', messages: [], speakers: [], skipped: 0 };
    for (const strategy of strategies) {
      expect(chunkTranscript(empty, { ...DEFAULT_CHUNK_OPTIONS, strategy })).toEqual([]);
    }
  });
});
