import type { ChatMessage, Transcript } from '../types';

/**
 * Turns an uploaded file into a transcript.
 *
 * Visitors bring files from very different exports, so rather than demand one
 * schema we look for the field names people actually use. Anything we cannot
 * recognise raises an error with a readable message instead of silently
 * producing an empty transcript.
 */

/** Field names we accept for the message body, in priority order. */
const TEXT_KEYS = ['text', 'message', 'content', 'body', 'answer', 'value'];
/** Field names we accept for the author. */
const SPEAKER_KEYS = ['speaker', 'sender', 'author', 'user', 'from', 'name', 'role'];
/** Field names we accept for the time. */
const TIME_KEYS = ['timestamp', 'time', 'date', 'created_at', 'sent_at'];

/** Largest file we will read, to keep a mistaken upload from freezing the tab. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Flattens one field into text.
 *
 * A plain string is the common case. The array form is the structured content
 * used by both the OpenAI and Anthropic message APIs, where a message body is
 * a list of parts. Reading only strings silently dropped every message in that
 * shape, which is half a transcript for anyone exporting from either.
 */
function readValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const part of value) {
      if (typeof part === 'string') {
        parts.push(part.trim());
      } else if (part && typeof part === 'object') {
        const text = (part as Record<string, unknown>).text;
        if (typeof text === 'string' && text.trim()) parts.push(text.trim());
      }
    }
    return parts.join(' ').trim();
  }

  return '';
}

/** Reads the first matching key off a record and returns it as a trimmed string. */
function pick(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = readValue(record[key]);
    if (text) return text;
  }
  return '';
}

/** How many entries of a candidate array actually yield a message. */
function countReadable(rows: unknown[]): number {
  let readable = 0;
  for (const row of rows) {
    if (row && typeof row === 'object' && pick(row as Record<string, unknown>, TEXT_KEYS)) {
      readable++;
    }
  }
  return readable;
}

/**
 * Finds the array of messages inside a parsed JSON value.
 *
 * Exports wrap their messages in all sorts of envelopes, so we accept a bare
 * array or an object with one obvious array property.
 */
function findMessageArray(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    for (const key of ['messages', 'conversation', 'chat', 'history', 'data', 'items']) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
    // Fall back to whichever array holds the most readable messages. Picking
    // the longest array instead lets a long list of names beat the actual log,
    // and the error that follows then blames the file for having no messages
    // when it had them all along.
    const arrays = Object.values(record).filter(Array.isArray) as unknown[][];
    if (arrays.length > 0) {
      const best = arrays.reduce((a, b) => (countReadable(b) > countReadable(a) ? b : a));
      if (countReadable(best) > 0) return best as Record<string, unknown>[];
      return arrays.reduce((a, b) => (b.length > a.length ? b : a)) as Record<string, unknown>[];
    }
  }

  throw new Error('No list of messages found in this file. Expected a JSON array of messages, or an object containing one.');
}

/** Parses raw file text into a transcript, or throws with a readable reason. */
export function parseTranscript(sourceName: string, raw: string): Transcript {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON. Try one of the sample files to see the shape we expect.');
  }

  const rows = findMessageArray(parsed);
  const messages: ChatMessage[] = [];
  // Entries we could not read. Counted rather than ignored, so the upload step
  // can say so instead of quietly presenting a shorter transcript.
  let skipped = 0;

  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') {
      skipped++;
      return;
    }

    const text = pick(row, TEXT_KEYS);
    if (!text) {
      skipped++;
      return;
    }

    messages.push({
      id: `m${index}`,
      speaker: pick(row, SPEAKER_KEYS) || 'Unknown',
      text,
      timestamp: pick(row, TIME_KEYS),
    });
  });

  if (messages.length === 0) {
    throw new Error(
      'No readable messages in this file. Each message needs a text field (one of: ' +
        TEXT_KEYS.join(', ') +
        ').',
    );
  }

  const speakers: string[] = [];
  for (const message of messages) {
    if (!speakers.includes(message.speaker)) speakers.push(message.speaker);
  }

  return { sourceName, messages, speakers, skipped };
}
