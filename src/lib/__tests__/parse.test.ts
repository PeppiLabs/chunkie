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
