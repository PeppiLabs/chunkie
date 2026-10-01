import type { ChatMessage, Transcript } from '../types';

/**
 * Turns an uploaded file into a transcript or structured document.
 *
 * Supports:
 * - JSON chat transcripts (various schemas, parts arrays, nested objects)
 * - Markdown (.md) documents with heading hierarchies
 * - Plain text (.txt) with paragraph segmentation
 * - CSV and TSV (.csv, .tsv) tables
 * - PDF documents (.pdf) via pdfjs-dist
 * - Word documents (.docx) via mammoth
 * - Source code files (.py, .js, .ts, etc.)
 */

/** Field names we accept for the message body, in priority order. */
const TEXT_KEYS = ['text', 'message', 'content', 'body', 'answer', 'value'];
/** Field names we accept for the author. */
const SPEAKER_KEYS = ['speaker', 'sender', 'author', 'user', 'from', 'name', 'role'];
/** Field names we accept for the time. */
const TIME_KEYS = ['timestamp', 'time', 'date', 'created_at', 'sent_at'];

/** Largest file we will read into memory. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Flattens one field into text. */
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

/** Finds the array of messages inside a parsed JSON value. */
function findMessageArray(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];

  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    for (const key of ['messages', 'conversation', 'chat', 'history', 'data', 'items']) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
    const arrays = Object.values(record).filter(Array.isArray) as unknown[][];
    if (arrays.length > 0) {
      const best = arrays.reduce((a, b) => (countReadable(b) > countReadable(a) ? b : a));
      if (countReadable(best) > 0) return best as Record<string, unknown>[];
      return arrays.reduce((a, b) => (b.length > a.length ? b : a)) as Record<string, unknown>[];
    }
  }

  throw new Error('No list of messages found in this file. Expected a JSON array of messages, or an object containing one.');
}

/** Parses Markdown text by headers and paragraphs. */
export function parseMarkdown(sourceName: string, raw: string): Transcript {
  const lines = raw.split(/\r?\n/);
  const messages: ChatMessage[] = [];
  let currentHeader = 'Introduction';
  let currentBuffer: string[] = [];

  const flush = () => {
    const text = currentBuffer.join('\n').trim();
    if (text) {
      messages.push({
        id: `m${messages.length}`,
        speaker: currentHeader,
        text,
        timestamp: '',
      });
    }
    currentBuffer = [];
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      currentHeader = match[2].trim();
    } else {
      currentBuffer.push(line);
    }
  }
  flush();

  if (messages.length === 0) {
    throw new Error('Could not find any readable paragraphs or sections in this Markdown file.');
  }

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'markdown',
  };
}

/** Parses CSV or TSV text into rows. */
export function parseCSV(sourceName: string, raw: string): Transcript {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        values.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    values.push(cur.trim());
    return values;
  };

  const header = parseLine(lines[0]);
  const messages: ChatMessage[] = [];

  let textIdx = header.findIndex((h) => TEXT_KEYS.includes(h.toLowerCase()));
  let speakerIdx = header.findIndex((h) => SPEAKER_KEYS.includes(h.toLowerCase()));

  const startRow = (textIdx >= 0 || speakerIdx >= 0) ? 1 : 0;
  if (textIdx < 0) textIdx = header.length > 1 ? 1 : 0;
  if (speakerIdx < 0) speakerIdx = textIdx === 0 && header.length > 1 ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const text = cols[textIdx] || '';
    if (!text) continue;

    const speaker = cols[speakerIdx] || `Row ${i + 1}`;
    messages.push({
      id: `m${messages.length}`,
      speaker,
      text,
      timestamp: '',
    });
  }

  if (messages.length === 0) {
    throw new Error('No readable data rows found in this CSV file.');
  }

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'csv',
  };
}

/** Parses an HTML document, stripping tags and grouping content into sections by headings. */
export function parseHTML(sourceName: string, raw: string): Transcript {
  const messages: ChatMessage[] = [];
  let title = 'Document';

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/html');

      const removeElements = doc.querySelectorAll('script, style, noscript, nav, footer, header, svg');
      removeElements.forEach((el) => el.remove());

      title =
        doc.querySelector('title')?.textContent?.trim() ||
        doc.querySelector('h1')?.textContent?.trim() ||
        sourceName.replace(/\.[^.]+$/, '');

      const headingsAndContent = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre');
      let currentHeading = title;
      let currentBuffer: string[] = [];

      const flush = () => {
        const text = currentBuffer.join(' ').replace(/\s+/g, ' ').trim();
        if (text.length > 20) {
          messages.push({
            id: `h_${messages.length}`,
            speaker: currentHeading,
            text,
            timestamp: '',
          });
        }
        currentBuffer = [];
      };

      headingsAndContent.forEach((node) => {
        const tag = node.tagName.toLowerCase();
        const text = node.textContent?.trim();
        if (!text) return;

        if (/^h[1-6]$/.test(tag)) {
          flush();
          currentHeading = text;
        } else {
          currentBuffer.push(text);
          if (currentBuffer.length >= 3) {
            flush();
          }
        }
      });
      flush();
    } catch {
      // Fallback below
    }
  }

  // Fallback if DOMParser unavailable or produced no chunks
  if (messages.length === 0) {
    const clean = raw
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    const paragraphs = clean
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 20);

    if (paragraphs.length === 0) {
      throw new Error('No readable text content found in this HTML document.');
    }

    paragraphs.forEach((p, idx) => {
      messages.push({
        id: `h_${idx}`,
        speaker: title,
        text: p,
        timestamp: '',
      });
    });
  }

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'html',
  };
}

/** Parses an RFC 822 / MIME email (.eml or .msg text) into structured conversation units. */
export function parseEmail(sourceName: string, raw: string): Transcript {
  const lines = raw.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let bodyStartIndex = -1;

  let currentHeaderKey = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      bodyStartIndex = i + 1;
      break;
    }

    if (/^\s+/.test(line) && currentHeaderKey) {
      headers[currentHeaderKey] += ' ' + line.trim();
    } else {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        currentHeaderKey = line.slice(0, colonIdx).trim().toLowerCase();
        headers[currentHeaderKey] = line.slice(colonIdx + 1).trim();
      }
    }
  }

  const rawBody = bodyStartIndex >= 0 ? lines.slice(bodyStartIndex).join('\n') : raw;

  let cleanBody = rawBody
    .replace(/^--[a-zA-Z0-9_-]+(?:--)?$/gm, '')
    .replace(/=\r?\n/g, '')
    .replace(/=20/g, ' ')
    .replace(/=3D/g, '=');

  if (
    headers['content-type']?.includes('text/html') ||
    cleanBody.includes('<html') ||
    cleanBody.includes('</div>')
  ) {
    cleanBody = cleanBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }

  const from = headers['from'] || 'Unknown Sender';
  const to = headers['to'] || '';
  const subject = headers['subject'] || 'No Subject';
  const date = headers['date'] || '';

  const paragraphs = cleanBody
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20 && !p.startsWith('Content-'));

  const messages: ChatMessage[] = [];

  messages.push({
    id: 'eml_head',
    speaker: from,
    text: `Subject: ${subject}` + (to ? ` | To: ${to}` : ''),
    timestamp: date,
  });

  paragraphs.forEach((p, idx) => {
    messages.push({
      id: `eml_${idx + 1}`,
      speaker: from,
      text: p,
      timestamp: date,
    });
  });

  const speakers = [from];
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'email',
  };
}

/** Parses plain text into paragraphs. */
export function parsePlainText(sourceName: string, raw: string, docType: 'text' | 'code' = 'text'): Transcript {
  const paragraphs = raw.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    throw new Error('That document has no readable paragraphs.');
  }

  const messages: ChatMessage[] = paragraphs.map((text, i) => ({
    id: `m${i}`,
    speaker: `Section ${i + 1}`,
    text,
    timestamp: '',
  }));

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType,
  };
}

/** Parses raw file text or JSON into a transcript. */
export function parseTranscript(sourceName: string, raw: string): Transcript {
  const trimmed = raw.trim();
  const lowerName = sourceName.toLowerCase();

  // If Markdown
  if (lowerName.endsWith('.md')) {
    return parseMarkdown(sourceName, trimmed);
  }

  // If CSV or TSV
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    return parseCSV(sourceName, trimmed);
  }

  // If HTML document
  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    trimmed.toLowerCase().startsWith('<!doctype html') ||
    trimmed.toLowerCase().startsWith('<html')
  ) {
    return parseHTML(sourceName, trimmed);
  }

  // If Email
  if (
    lowerName.endsWith('.eml') ||
    lowerName.endsWith('.msg') ||
    /^(from|received|subject|to):/i.test(trimmed)
  ) {
    return parseEmail(sourceName, trimmed);
  }

  // If source code
  const codeExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.rs', '.sql', '.sh', '.css'];
  if (codeExts.some((ext) => lowerName.endsWith(ext))) {
    return parsePlainText(sourceName, trimmed, 'code');
  }

  // If plain text
  if (lowerName.endsWith('.txt')) {
    return parsePlainText(sourceName, trimmed, 'text');
  }

  // If explicitly JSON or looks like JSON
  if (lowerName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('That file is not valid JSON. Try one of the sample files to see the shape we expect.');
    }

    const rows = findMessageArray(parsed);
    const messages: ChatMessage[] = [];
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

    return { sourceName, messages, speakers, skipped, docType: 'chat' };
  }

  // Fallback for markdown-like text
  if (trimmed.includes('# ') || trimmed.includes('## ')) {
    return parseMarkdown(sourceName, trimmed);
  }

  return parsePlainText(sourceName, trimmed, 'text');
}

/** Parses an uploaded File object, supporting binary formats (PDF, DOCX) and text formats. */
export async function parseFile(file: File): Promise<Transcript> {
  const lowerName = file.name.toLowerCase();

  // PDF Document
  if (lowerName.endsWith('.pdf')) {
    try {
      const buffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });
      const pdf = await loadingTask.promise;
      const messages: ChatMessage[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean);
        const text = strings.join(' ').replace(/\s+/g, ' ').trim();
        if (text) {
          const paragraphs = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((p) => p.trim().length > 30);
          if (paragraphs.length > 1) {
            paragraphs.forEach((p, pIdx) => {
              messages.push({
                id: `p${i}_${pIdx}`,
                speaker: `Page ${i}`,
                text: p.trim(),
                timestamp: '',
              });
            });
          } else {
            messages.push({
              id: `p${i}`,
              speaker: `Page ${i}`,
              text,
              timestamp: '',
            });
          }
        }
      }

      if (messages.length === 0) {
        throw new Error('No readable text layer found in this PDF document.');
      }

      const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
      return {
        sourceName: file.name,
        messages,
        speakers,
        skipped: 0,
        docType: 'pdf',
      };
    } catch (err) {
      throw new Error(`Could not parse PDF: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Word DOCX Document
  if (lowerName.endsWith('.docx')) {
    try {
      const buffer = await file.arrayBuffer();
      const mammothModule = await import('mammoth');
      const mammoth = mammothModule.default || mammothModule;
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const rawText = result.value || '';
      const paragraphs = rawText.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);

      if (paragraphs.length === 0) {
        throw new Error('No readable text paragraphs found in this Word document.');
      }

      const messages: ChatMessage[] = paragraphs.map((text, i) => ({
        id: `m${i}`,
        speaker: `Section ${i + 1}`,
        text,
        timestamp: '',
      }));

      const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
      return {
        sourceName: file.name,
        messages,
        speakers,
        skipped: 0,
        docType: 'docx',
      };
    } catch (err) {
      throw new Error(`Could not parse DOCX: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Excel Spreadsheet (.xlsx, .xls)
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    try {
      const buffer = await file.arrayBuffer();
      return await parseExcel(file.name, buffer);
    } catch (err) {
      throw new Error(`Could not parse Excel: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // PowerPoint Presentation (.pptx)
  if (lowerName.endsWith('.pptx')) {
    try {
      const buffer = await file.arrayBuffer();
      return await parsePowerPoint(file.name, buffer);
    } catch (err) {
      throw new Error(`Could not parse PowerPoint: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Email (.eml, .msg)
  if (lowerName.endsWith('.eml') || lowerName.endsWith('.msg')) {
    try {
      const text = await file.text();
      return parseEmail(file.name, text);
    } catch (err) {
      throw new Error(`Could not parse Email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // HTML (.html, .htm)
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    try {
      const text = await file.text();
      return parseHTML(file.name, text);
    } catch (err) {
      throw new Error(`Could not parse HTML: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Text, Markdown, CSV, JSON, Code
  const rawText = await file.text();
  return parseTranscript(file.name, rawText);
}

/** Parses an Excel workbook (.xlsx, .xls) into rows per sheet. */
export async function parseExcel(sourceName: string, buffer: ArrayBuffer): Promise<Transcript> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const messages: ChatMessage[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    if (!rows || rows.length === 0) continue;

    const headerRow = rows[0];
    const headers = Array.isArray(headerRow)
      ? headerRow.map((h, idx) => (h !== undefined && h !== null && String(h).trim() ? String(h).trim() : `Col ${idx + 1}`))
      : [];

    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      if (!Array.isArray(row) || row.length === 0) continue;

      const pairs: string[] = [];
      row.forEach((cellVal, cIdx) => {
        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim()) {
          const colName = headers[cIdx] || `Col ${cIdx + 1}`;
          pairs.push(`${colName}: ${String(cellVal).trim()}`);
        }
      });

      if (pairs.length > 0) {
        messages.push({
          id: `xl_${sheetName}_r${rIdx}`,
          speaker: `${sheetName} (Row ${rIdx + 1})`,
          text: pairs.join(' | '),
          timestamp: '',
        });
      }
    }
  }

  if (messages.length === 0) {
    throw new Error('No readable data rows found in this Excel spreadsheet.');
  }

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'excel',
  };
}

/** Parses a PowerPoint presentation (.pptx) extracting text from each slide. */
export async function parsePowerPoint(sourceName: string, buffer: ArrayBuffer): Promise<Transcript> {
  const JSZipModule = await import('jszip');
  const JSZip = JSZipModule.default || JSZipModule;
  const zip = await JSZip.loadAsync(buffer);

  const messages: ChatMessage[] = [];
  const slidePaths = Object.keys(zip.files).filter((path) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(path),
  );

  slidePaths.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
    return numA - numB;
  });

  for (let idx = 0; idx < slidePaths.length; idx++) {
    const slidePath = slidePaths[idx];
    const xmlText = await zip.files[slidePath].async('text');

    const textMatches = xmlText.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi) || [];
    const textPieces = textMatches
      .map((t) => t.replace(/<\/?a:t(?:\s[^>]*)?>/gi, '').trim())
      .filter(Boolean);

    const slideNumber = idx + 1;
    const slideText = textPieces.join(' ').replace(/\s+/g, ' ').trim();

    if (slideText) {
      const paragraphs = slideText.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((p) => p.trim().length > 25);
      if (paragraphs.length > 1) {
        paragraphs.forEach((p, pIdx) => {
          messages.push({
            id: `ppt_s${slideNumber}_p${pIdx}`,
            speaker: `Slide ${slideNumber}`,
            text: p.trim(),
            timestamp: '',
          });
        });
      } else {
        messages.push({
          id: `ppt_s${slideNumber}`,
          speaker: `Slide ${slideNumber}`,
          text: slideText,
          timestamp: '',
        });
      }
    }
  }

  if (messages.length === 0) {
    throw new Error('No readable text content found in this PowerPoint presentation.');
  }

  const speakers = Array.from(new Set(messages.map((m) => m.speaker)));
  return {
    sourceName,
    messages,
    speakers,
    skipped: 0,
    docType: 'powerpoint',
  };
}
