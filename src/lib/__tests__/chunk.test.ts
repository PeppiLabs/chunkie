import { describe, expect, it } from 'vitest';
import { chunkTranscript, DEFAULT_CHUNK_OPTIONS, STRATEGY_CATALOG } from '../chunk';
import type { Transcript } from '../../types';

function transcriptOf(texts: string[]): Transcript {
  return {
    sourceName: 'test.json',
    messages: texts.map((text, index) => ({
      id: `m${index}`,
      speaker: index % 2 === 0 ? 'Ana' : 'Ben',
      text,
      timestamp: '2026-09-17T10:00:00Z',
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
    for (let size = 100; size <= 1200; size += 100) {
      for (let overlap = 0; overlap <= size - 50; overlap += 50) {
        const chunks = chunkTranscript(LONG, {
          ...DEFAULT_CHUNK_OPTIONS,
          strategy: 'fixed-window',
          size,
          overlap,
        });
        expect(chunks.length).toBeGreaterThan(0);
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
});

describe('all 18 strategies execute successfully', () => {
  it('has 18 strategies cataloged', () => {
    expect(STRATEGY_CATALOG).toHaveLength(18);
  });

  it('generates chunks for every strategy without error', () => {
    for (const item of STRATEGY_CATALOG) {
      const chunks = chunkTranscript(LONG, {
        ...DEFAULT_CHUNK_OPTIONS,
        strategy: item.id,
      });
      expect(chunks.length, `Strategy ${item.id} produced chunks`).toBeGreaterThan(0);
      expect(chunks[0].text.length).toBeGreaterThan(0);
    }
  });

  it('handles recursive splitting with target size', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'recursive',
      size: 250,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles sentence packing', () => {
    const chunks = chunkTranscript(LONG, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'sentence',
      size: 300,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles custom punctuation symbols', () => {
    const sample = transcriptOf(['Hello world. How are you? Fine, thanks!']);
    const chunks = chunkTranscript(sample, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'symbol',
      splitSymbols: '.!?',
      piecesPerChunk: 1,
    });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('handles whole document strategy', () => {
    const sample = transcriptOf(['Short note 1.', 'Short note 2.']);
    const chunks = chunkTranscript(sample, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'whole',
      splitLong: false,
    });
    expect(chunks).toHaveLength(1);
  });

  it('handles section grouping', () => {
    const doc: Transcript = {
      sourceName: 'doc.md',
      messages: [
        { id: 'm1', speaker: 'Introduction', text: 'Intro paragraph 1', timestamp: '' },
        { id: 'm2', speaker: 'Introduction', text: 'Intro paragraph 2', timestamp: '' },
        { id: 'm3', speaker: 'Methods', text: 'Methods paragraph 1', timestamp: '' },
      ],
      speakers: ['Introduction', 'Methods'],
      skipped: 0,
    };
    const chunks = chunkTranscript(doc, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'section',
    });
    expect(chunks).toHaveLength(2);
  });

  it('handles table rows grouping', () => {
    const doc: Transcript = {
      sourceName: 'data.csv',
      messages: [
        { id: 'm1', speaker: 'Header', text: 'Name,Age,Role', timestamp: '' },
        { id: 'm2', speaker: 'Row 1', text: 'Alice,30,Engineer', timestamp: '' },
        { id: 'm3', speaker: 'Row 2', text: 'Bob,25,Designer', timestamp: '' },
      ],
      speakers: ['Header', 'Row 1', 'Row 2'],
      skipped: 0,
      docType: 'csv',
    };
    const chunks = chunkTranscript(doc, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'table-rows',
      rowsPerChunk: 2,
    });
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe('personalization & context prefixing', () => {
  it('prepends document title when contextTitle is enabled', () => {
    const sample = transcriptOf(['Hello']);
    const chunks = chunkTranscript(sample, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'per-message',
      contextTitle: true,
    });
    expect(chunks[0].text).toContain('Document: test.json');
  });

  it('prepends custom prefix when contextPrefix is set', () => {
    const sample = transcriptOf(['Hello']);
    const chunks = chunkTranscript(sample, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'per-message',
      contextPrefix: 'CustomPrefix',
    });
    expect(chunks[0].text).toContain('CustomPrefix');
  });

  it('merges small chunks when minChunkSize is specified', () => {
    const sample = transcriptOf(['Hi', 'Hey', 'Third line with sufficient length']);
    const chunks = chunkTranscript(sample, {
      ...DEFAULT_CHUNK_OPTIONS,
      strategy: 'per-message',
      minChunkSize: 50,
    });
    expect(chunks.length).toBeLessThan(3);
  });
});

describe('edge cases', () => {
  const single = transcriptOf(['Only one message here.']);

  it('handles a single message under every strategy', () => {
    for (const item of STRATEGY_CATALOG) {
      const chunks = chunkTranscript(single, { ...DEFAULT_CHUNK_OPTIONS, strategy: item.id });
      expect(chunks.length, `Strategy ${item.id} handles single message`).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles an empty transcript without throwing', () => {
    const empty: Transcript = { sourceName: 'e.json', messages: [], speakers: [], skipped: 0 };
    for (const item of STRATEGY_CATALOG) {
      expect(chunkTranscript(empty, { ...DEFAULT_CHUNK_OPTIONS, strategy: item.id })).toEqual([]);
    }
  });
});
