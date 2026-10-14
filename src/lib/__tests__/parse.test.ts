import { describe, expect, it } from 'vitest';
import { parseTranscript } from '../parse';

const json = (value: unknown) => JSON.stringify(value);

describe('parseTranscript', () => {
  it('reads a bare array of messages', () => {
    const result = parseTranscript(
      'chat.json',
      json([
        { speaker: 'Ana', text: 'Hello there' },
        { speaker: 'Ben', text: 'Hi Ana' },
      ]),
    );
    expect(result.messages).toHaveLength(2);
    expect(result.speakers).toEqual(['Ana', 'Ben']);
  });

  it('reads messages wrapped in an object', () => {
    for (const key of ['messages', 'conversation', 'chat', 'history', 'data', 'items']) {
      const result = parseTranscript('c.json', json({ [key]: [{ text: 'Only line' }] }));
      expect(result.messages, key).toHaveLength(1);
    }
  });

  it('accepts the alternative field names', () => {
    const result = parseTranscript(
      'c.json',
      json([
        { author: 'Ana', content: 'via content', time: '2026-01-01' },
        { from: 'Ben', body: 'via body' },
        { role: 'assistant', message: 'via message' },
      ]),
    );
    expect(result.messages.map((m) => m.text)).toEqual(['via content', 'via body', 'via message']);
    expect(result.messages.map((m) => m.speaker)).toEqual(['Ana', 'Ben', 'assistant']);
  });

  it('falls back to the longest array when no known key is present', () => {
    const result = parseTranscript(
      'c.json',
      json({ meta: [1], log: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }),
    );
    expect(result.messages).toHaveLength(3);
  });

  it('labels a message with no speaker rather than dropping it', () => {
    const result = parseTranscript('c.json', json([{ text: 'anonymous line' }]));
    expect(result.messages[0].speaker).toBe('Unknown');
  });

  it('skips entries with no usable text but keeps the rest', () => {
    const result = parseTranscript(
      'c.json',
      json([{ text: 'keep me' }, { text: '   ' }, null, 42, { note: 'no text field' }, { text: 'keep me too' }]),
    );
    expect(result.messages.map((m) => m.text)).toEqual(['keep me', 'keep me too']);
  });

  it('lists each speaker once, in first-seen order', () => {
    const result = parseTranscript(
      'c.json',
      json([
        { speaker: 'Bo', text: '1' },
        { speaker: 'Ana', text: '2' },
        { speaker: 'Bo', text: '3' },
      ]),
    );
    expect(result.speakers).toEqual(['Bo', 'Ana']);
  });

  it('rejects invalid JSON with a readable message', () => {
    expect(() => parseTranscript('c.json', '{not json')).toThrow(/not valid JSON/i);
  });

  it('rejects a file with no message list', () => {
    expect(() => parseTranscript('c.json', json({ title: 'nothing here' }))).toThrow(
      /No list of messages/i,
    );
  });

  it('rejects a list where nothing has text, naming the fields it wanted', () => {
    expect(() => parseTranscript('c.json', json([{ id: 1 }, { id: 2 }]))).toThrow(/text field/i);
  });

  it('does not treat an empty array as a successful parse', () => {
    expect(() => parseTranscript('c.json', json([]))).toThrow();
  });
});

describe('structured content and honest reporting', () => {
  it('reads the part-array content used by the OpenAI and Anthropic APIs', () => {
    const result = parseTranscript(
      'c.json',
      json([
        { role: 'user', content: [{ type: 'text', text: 'first message' }] },
        { role: 'assistant', content: 'second message' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'split across' },
            { type: 'text', text: 'two parts' },
          ],
        },
      ]),
    );

    expect(result.messages.map((m) => m.text)).toEqual([
      'first message',
      'second message',
      'split across two parts',
    ]);
    expect(result.skipped).toBe(0);
  });

  it('ignores non-text parts such as images', () => {
    const result = parseTranscript(
      'c.json',
      json([
        {
          role: 'user',
          content: [
            { type: 'image', source: { data: 'ignored' } },
            { type: 'text', text: 'the caption' },
          ],
        },
      ]),
    );
    expect(result.messages[0].text).toBe('the caption');
  });

  it('counts entries it could not read instead of hiding them', () => {
    const result = parseTranscript(
      'c.json',
      json([{ text: 'kept' }, { note: 'no text' }, null, { text: '  ' }, { text: 'also kept' }]),
    );
    expect(result.messages).toHaveLength(2);
    expect(result.skipped).toBe(3);
  });

  it('picks the array with the most readable messages, not the longest', () => {
    // A long list of names must not beat the shorter list of actual messages.
    const result = parseTranscript(
      'c.json',
      json({
        users: Array.from({ length: 500 }, (_, i) => ({ id: i, username: `user${i}` })),
        log: [{ text: 'a message' }, { text: 'another message' }],
      }),
    );
    expect(result.messages.map((m) => m.text)).toEqual(['a message', 'another message']);
  });
});

describe('multi-format parsing (Markdown, CSV, TXT)', () => {
  it('parses Markdown documents into sections by heading', () => {
    const md = `# Overview\nThis is the overview.\n\n## Architecture\nHere is how RAG works.`;
    const result = parseTranscript('guide.md', md);
    expect(result.docType).toBe('markdown');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].speaker).toBe('Overview');
    expect(result.messages[0].text).toBe('This is the overview.');
    expect(result.messages[1].speaker).toBe('Architecture');
  });

  it('parses CSV files into rows', () => {
    const csv = `Question,Answer\nWhat is RAG?,Retrieval augmented generation\nWhy chunk?,To fit context`;
    const result = parseTranscript('data.csv', csv);
    expect(result.docType).toBe('csv');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe('Retrieval augmented generation');
  });

  it('parses plain text files into paragraphs', () => {
    const txt = `First paragraph of text.\n\nSecond paragraph of text.`;
    const result = parseTranscript('notes.txt', txt);
    expect(result.docType).toBe('text');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toBe('First paragraph of text.');
    expect(result.messages[1].text).toBe('Second paragraph of text.');
  });

  it('parses HTML documents stripping scripts and styles', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Chunkie User Guide</title><style>.hidden { display: none; }</style></head>
        <body>
          <nav><a>Home</a></nav>
          <h1>Introduction to RAG</h1>
          <p>Retrieval-Augmented Generation connects vector search with language models.</p>
          <h2>Chunking Strategies</h2>
          <p>Dividing text accurately ensures high semantic precision during search.</p>
          <script>console.log('secret');</script>
        </body>
      </html>
    `;
    const result = parseTranscript('guide.html', html);
    expect(result.docType).toBe('html');
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.messages.some((m) => m.text.includes('Retrieval-Augmented Generation'))).toBe(true);
    expect(result.messages.some((m) => m.text.includes('console.log'))).toBe(false);
  });

  it('parses Email (.eml) transcripts with headers and body', () => {
    const email = `From: alice@example.com
To: bob@example.com
Subject: Project Update on RAG Visualizer
Date: Wed, 30 Sep 2026 10:00:00 -0400

Hi Bob,

We have added support for Excels, PowerPoints, and Emails into Chunkie.

Let me know what you think about the chunking strategies!`;
    const result = parseTranscript('update.eml', email);
    expect(result.docType).toBe('email');
    expect(result.speakers).toContain('alice@example.com');
    expect(result.messages.some((m) => m.text.includes('Subject: Project Update'))).toBe(true);
    expect(result.messages.some((m) => m.text.includes('We have added support'))).toBe(true);
  });

  it('parses Excel spreadsheets (.xlsx) into rows with column headers', async () => {
    const { parseExcel } = await import('../parse');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Product', 'Category', 'Price'],
      ['Laptop', 'Electronics', '$1200'],
      ['Desk Chair', 'Furniture', '$350'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcel('inventory.xlsx', u8);
    expect(result.docType).toBe('excel');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].text).toContain('Product: Laptop');
    expect(result.messages[0].text).toContain('Price: $1200');
    expect(result.messages[1].text).toContain('Product: Desk Chair');
  });

  it('parses PowerPoint presentations (.pptx) extracting slide texts', async () => {
    const { parsePowerPoint } = await import('../parse');
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default || JSZipModule;
    const zip = new JSZip();

    const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Introduction to Vector Search in Presentation Slides</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;
    zip.file('ppt/slides/slide1.xml', slide1);

    const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld>
        <p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Cosine Similarity and Dimensionality Reduction Deep Dive</a:t></a:r></a:p></p:txBody></p:sp>
        </p:spTree>
      </p:cSld>
    </p:sld>`;
    zip.file('ppt/slides/slide2.xml', slide2);

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const result = await parsePowerPoint('deck.pptx', buffer);
    expect(result.docType).toBe('powerpoint');
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].speaker).toBe('Slide 1');
    expect(result.messages[0].text).toContain('Introduction to Vector Search');
    expect(result.messages[1].speaker).toBe('Slide 2');
    expect(result.messages[1].text).toContain('Cosine Similarity');
  });
});
