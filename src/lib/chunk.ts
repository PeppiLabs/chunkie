import type { ChatMessage, Chunk, ChunkFamily, ChunkOptions, ChunkStrategy, Transcript } from '../types';

/**
 * Complete Chunking Engine for Chunkie.
 *
 * Implements 18 strategies across 4 families:
 * - Size: Fixed window, Recursive, Sentence, Symbols, Whole
 * - Structure: Section, Paragraph groups, TOC, Pages, Table rows, Code, Layout elements
 * - Meaning: Semantic breakpoints, Topic segmentation
 * - Chat: Message-wise, Message count, Sessions, Day-wise
 */

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  strategy: 'fixed-window',
  size: 400,
  overlap: 80,
  groupSize: 4,
  splitSymbols: '.!?',
  piecesPerChunk: 2,
  respectHeadings: true,
  respectParagraphs: false,
  splitLong: true,
  tocDepth: 2,
  pagesPerChunk: 1,
  rowsPerChunk: 5,
  rowFormat: 'pairs',
  sensitivity: 'balanced',
  gapMinutes: 60,
  maxMessages: 20,
  contextHeadingPath: true,
  contextTitle: false,
  contextPrefix: '',
  minChunkSize: 0,
};

export interface StrategyCatalogItem {
  id: ChunkStrategy;
  family: ChunkFamily;
  label: string;
  cuts: string;
  bestFor: string;
  tradeoff: string;
  recommendedFor?: ('chat' | 'pdf' | 'docx' | 'markdown' | 'csv' | 'text' | 'code')[];
}

export const STRATEGY_FAMILIES: { id: ChunkFamily; label: string; description: string }[] = [
  { id: 'size', label: 'Cut by Size', description: 'Equal slices, sentence packing, recursive splits, or symbols' },
  { id: 'structure', label: 'Along Structure', description: 'Headings, sections, paragraphs, tables, pages, or code' },
  { id: 'meaning', label: 'Meaning Shifts', description: 'Cut where semantic similarity drops or topics shift' },
  { id: 'chat', label: 'Chat Exports', description: 'Speaker turns, exchanges, conversation sessions, or days' },
];

export const STRATEGY_CATALOG: StrategyCatalogItem[] = [
  // Size Family
  {
    id: 'fixed-window',
    family: 'size',
    label: 'Fixed window',
    cuts: 'Equal slices across text with overlap, ending cleanly on words/sentences',
    bestFor: 'A reliable baseline and general prose documents',
    tradeoff: 'Most common in industry RAG, though ignores natural section breaks',
    recommendedFor: ['text', 'docx', 'markdown', 'pdf'],
  },
  {
    id: 'recursive',
    family: 'size',
    label: 'Recursive split',
    cuts: 'Paragraphs first, then lines, sentences and words until each piece fits',
    bestFor: 'Extracted documents and mixed markdown; LangChain/LlamaIndex default',
    tradeoff: 'Adapts well to varied density, but chunk lengths fluctuate',
    recommendedFor: ['markdown', 'text'],
  },
  {
    id: 'sentence',
    family: 'size',
    label: 'By sentence',
    cuts: 'Whole sentences packed up to target size, never split mid-sentence',
    bestFor: 'Text with few headings or very long paragraphs',
    tradeoff: 'Keeps thoughts complete, but chunks can end slightly below target size',
  },
  {
    id: 'symbol',
    family: 'size',
    label: 'By symbols',
    cuts: 'Pieces ending at punctuation you choose (e.g. . ! ? ; |)',
    bestFor: 'Specialized transcripts, logs, or custom formatted files',
    tradeoff: 'Predictable punctuation cuts, but depends heavily on punctuation quality',
  },
  {
    id: 'whole',
    family: 'size',
    label: 'No chunking (Whole)',
    cuts: 'The whole document (or each major chapter) kept as one single piece',
    bestFor: 'Short notes, reviews, single articles, or long-context LLMs',
    tradeoff: 'Zero fragmentation, but large chunks lose retrieval focus',
  },

  // Structure Family
  {
    id: 'section',
    family: 'structure',
    label: 'By section / headings',
    cuts: 'Content grouped under Markdown or document headings, packed up to size',
    bestFor: 'Theses, manuals, documentation, and reports with real headings',
    tradeoff: 'High semantic unity, but sections vary widely in length',
    recommendedFor: ['markdown', 'docx', 'pdf'],
  },
  {
    id: 'paragraph',
    family: 'structure',
    label: 'Paragraph groups',
    cuts: 'Groups of consecutive paragraphs (or sections) kept together',
    bestFor: 'Articles, essays, and documents with clear paragraph structure',
    tradeoff: 'Natural visual units, though paragraph lengths vary',
    recommendedFor: ['markdown', 'text'],
  },
  {
    id: 'toc',
    family: 'structure',
    label: 'Table of contents',
    cuts: 'Aligned strictly to heading depth (e.g. # Chapter vs ## Section)',
    bestFor: 'Books, formal reports, and multi-level whitepapers',
    tradeoff: 'Preserves document outline, but top-level entries can be large',
    recommendedFor: ['markdown', 'docx'],
  },
  {
    id: 'page',
    family: 'structure',
    label: 'Pages',
    cuts: 'One chunk per document page (or set number of pages)',
    bestFor: 'PDF documents and slide decks with distinct pages',
    tradeoff: 'Matches physical pages for easy citation, but sentences may cross pages',
    recommendedFor: ['pdf'],
  },
  {
    id: 'table-rows',
    family: 'structure',
    label: 'Table rows',
    cuts: 'Consecutive rows of tables or CSVs grouped with headers repeated',
    bestFor: 'CSV, TSV, and tabular data extracts',
    tradeoff: 'Each value stays contextualized, but tabular data is dense',
    recommendedFor: ['csv'],
  },
  {
    id: 'code',
    family: 'structure',
    label: 'Code definitions',
    cuts: 'Top-level functions, classes, interfaces, and methods with docstrings',
    bestFor: 'Source code files (.py, .ts, .js, .go, .rs, .java)',
    tradeoff: 'Ideal for code search, but long functions still require sub-splitting',
    recommendedFor: ['code'],
  },
  {
    id: 'elements',
    family: 'structure',
    label: 'Layout elements',
    cuts: 'Preserves tables, code fences, blockquotes, and lists as discrete chunks',
    bestFor: 'Rich technical documentation with diverse content blocks',
    tradeoff: 'Keeps structured components clean, but element sizes differ',
    recommendedFor: ['markdown'],
  },

  // Meaning Family
  {
    id: 'semantic',
    family: 'meaning',
    label: 'Semantic breakpoints',
    cuts: 'Cuts where sentence-to-sentence semantic vocabulary shifts abruptly',
    bestFor: 'Continuous narrative prose and conversational lectures without headings',
    tradeoff: 'Finds thematic transitions, but boundaries depend on vocabulary shifts',
  },
  {
    id: 'topic',
    family: 'meaning',
    label: 'Topic segmentation',
    cuts: 'Segments text into thematic clusters based on lexical recurrence',
    bestFor: 'Unstructured notes, transcripts, or articles covering multiple topics',
    tradeoff: 'Captures topic shifts, but can generate uneven chunk sizes',
  },

  // Chat Family
  {
    id: 'per-message',
    family: 'chat',
    label: 'Message-wise',
    cuts: 'One chunk per message or speaker turn',
    bestFor: 'Pinpointing an exact single answer or question',
    tradeoff: 'Very precise, but short replies lose conversational context',
    recommendedFor: ['chat'],
  },
  {
    id: 'per-conversation',
    family: 'chat',
    label: 'Message count',
    cuts: 'A set number of consecutive exchanges kept together',
    bestFor: 'Conversations where question and reply need to stay together',
    tradeoff: 'Maintains dialogue context, but large groups dilute search match',
    recommendedFor: ['chat'],
  },
  {
    id: 'session',
    family: 'chat',
    label: 'Sessions',
    cuts: 'Exchanges grouped until a silence gap indicates the person paused',
    bestFor: 'Support logs, messaging history, or intermittent consultation chats',
    tradeoff: 'Groups natural conversation sessions, but session lengths vary',
    recommendedFor: ['chat'],
  },
  {
    id: 'day-wise',
    family: 'chat',
    label: 'Day-wise',
    cuts: 'Everything said on a single calendar day grouped together',
    bestFor: 'Daily summaries, journal entries, or daily meeting standups',
    tradeoff: 'Great for day overviews, but too broad for specific fact lookups',
    recommendedFor: ['chat'],
  },
];

/** Quick lookup for strategy metadata. */
export const STRATEGY_INFO: Record<ChunkStrategy, { title: string; blurb: string; tradeoff: string }> =
  Object.fromEntries(
    STRATEGY_CATALOG.map((item) => [
      item.id,
      { title: item.label, blurb: item.cuts, tradeoff: item.tradeoff },
    ])
  ) as Record<ChunkStrategy, { title: string; blurb: string; tradeoff: string }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMessage(message: ChatMessage): string {
  // If speaker is generic or heading, format cleanly
  if (!message.speaker || message.speaker === 'Text' || message.speaker === 'Document') {
    return message.text;
  }
  return `${message.speaker}: ${message.text}`;
}

function speakersOf(messages: ChatMessage[]): string[] {
  const seen: string[] = [];
  for (const message of messages) {
    if (message.speaker && !seen.includes(message.speaker)) {
      seen.push(message.speaker);
    }
  }
  return seen;
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?。！？\n]+[.!?。！？\n]+["'”’)\]]*|[^.!?。！？\n]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Strategy Implementations
// ---------------------------------------------------------------------------

/** 1. One chunk per message / line. */
function chunkPerMessage(messages: ChatMessage[]): Chunk[] {
  return messages.map((message, index) => ({
    id: `c${index}`,
    index,
    text: formatMessage(message),
    messageIds: [message.id],
    speakers: [message.speaker].filter(Boolean),
    overlapChars: 0,
  }));
}

/** 2. Fixed group of consecutive messages / exchanges. */
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

/** 3. Fixed character window with overlap. */
function chunkFixedWindow(messages: ChatMessage[], size: number, overlap: number): Chunk[] {
  const windowSize = Math.max(50, Math.floor(size));
  const step = Math.max(1, windowSize - Math.min(Math.floor(overlap), windowSize - 1));

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

  const snap = (position: number): number => {
    if (position <= 0) return 0;
    if (position >= flat.length) return flat.length;
    const nextSpace = flat.indexOf(' ', position);
    if (nextSpace === -1 || nextSpace - position >= 20) return position;
    return nextSpace + 1;
  };

  const chunks: Chunk[] = [];
  let cursor = 0;
  let previousTextEnd = 0;
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

      const trimmedFromStart = raw.length - raw.trimStart().length;
      const textStart = cursor + trimmedFromStart;
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
    cursor = next > cursor ? next : cursor + step;
  }

  return chunks;
}

/** 4. Recursive character splitter: Paragraphs -> Lines -> Sentences -> Words. */
function chunkRecursive(messages: ChatMessage[], size: number, respectHeadings = true): Chunk[] {
  const targetSize = Math.max(100, Math.floor(size));
  const chunks: Chunk[] = [];

  const splitBlock = (text: string): string[] => {
    if (text.length <= targetSize) return [text];

    // Try paragraphs
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length > 1) {
      const parts: string[] = [];
      let current = '';
      for (const para of paragraphs) {
        if (!current) {
          current = para;
        } else if (current.length + 2 + para.length <= targetSize) {
          current += '\n\n' + para;
        } else {
          parts.push(...splitBlock(current));
          current = para;
        }
      }
      if (current) parts.push(...splitBlock(current));
      return parts;
    }

    // Try lines
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const parts: string[] = [];
      let current = '';
      for (const line of lines) {
        if (!current) {
          current = line;
        } else if (current.length + 1 + line.length <= targetSize) {
          current += '\n' + line;
        } else {
          parts.push(...splitBlock(current));
          current = line;
        }
      }
      if (current) parts.push(...splitBlock(current));
      return parts;
    }

    // Try sentences
    const sentences = splitSentences(text);
    if (sentences.length > 1) {
      const parts: string[] = [];
      let current = '';
      for (const sentence of sentences) {
        if (!current) {
          current = sentence;
        } else if (current.length + 1 + sentence.length <= targetSize) {
          current += ' ' + sentence;
        } else {
          parts.push(...splitBlock(current));
          current = sentence;
        }
      }
      if (current) parts.push(...splitBlock(current));
      return parts;
    }

    // Fallback: words
    const words = text.split(/\s+/).filter(Boolean);
    const parts: string[] = [];
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= targetSize) {
        current += ' ' + word;
      } else {
        parts.push(current);
        current = word;
      }
    }
    if (current) parts.push(current);
    return parts;
  };

  // Group by heading if respectHeadings is enabled
  const groups: { heading: string; messages: ChatMessage[] }[] = [];
  if (respectHeadings) {
    for (const msg of messages) {
      const heading = msg.speaker || 'Section';
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.heading === heading) {
        lastGroup.messages.push(msg);
      } else {
        groups.push({ heading, messages: [msg] });
      }
    }
  } else {
    groups.push({ heading: 'All', messages });
  }

  for (const group of groups) {
    const fullText = group.messages.map(formatMessage).join('\n\n');
    const parts = splitBlock(fullText);
    for (const part of parts) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: part,
        messageIds: group.messages.map((m) => m.id),
        speakers: speakersOf(group.messages),
        overlapChars: 0,
      });
    }
  }

  return chunks;
}

/** 5. By Sentence packing. */
function chunkBySentence(messages: ChatMessage[], size: number, respectParagraphs = false): Chunk[] {
  const targetSize = Math.max(100, Math.floor(size));
  const chunks: Chunk[] = [];

  let currentChunkText = '';
  let currentMsgIds: string[] = [];
  let currentSpeakers: string[] = [];

  const flush = () => {
    if (currentChunkText.trim()) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: currentChunkText.trim(),
        messageIds: [...new Set(currentMsgIds)],
        speakers: [...new Set(currentSpeakers)],
        overlapChars: 0,
      });
      currentChunkText = '';
      currentMsgIds = [];
      currentSpeakers = [];
    }
  };

  for (const message of messages) {
    if (respectParagraphs) flush();
    const sentences = splitSentences(message.text);

    for (const sentence of sentences) {
      const candidate = currentChunkText ? `${currentChunkText} ${sentence}` : sentence;
      if (candidate.length <= targetSize || !currentChunkText) {
        currentChunkText = candidate;
        currentMsgIds.push(message.id);
        if (message.speaker) currentSpeakers.push(message.speaker);
      } else {
        flush();
        currentChunkText = sentence;
        currentMsgIds.push(message.id);
        if (message.speaker) currentSpeakers.push(message.speaker);
      }
    }
  }
  flush();

  return chunks;
}

/** 6. By custom punctuation symbols. */
function chunkBySymbols(messages: ChatMessage[], symbols = '.!?', piecesPerChunk = 2): Chunk[] {
  const chunks: Chunk[] = [];
  const safeSymbols = symbols.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') || '\\.';
  const regex = new RegExp(`([^${safeSymbols}]+[${safeSymbols}]+)`, 'g');
  const fullText = messages.map(formatMessage).join('\n');

  const pieces = fullText.match(regex) || [fullText];
  const step = Math.max(1, piecesPerChunk);

  for (let i = 0; i < pieces.length; i += step) {
    const group = pieces.slice(i, i + step).join('').trim();
    if (group) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: group,
        messageIds: messages.map((m) => m.id),
        speakers: speakersOf(messages),
        overlapChars: 0,
      });
    }
  }

  return chunks;
}

/** 7. Whole document / chapter as single chunk. */
function chunkWhole(messages: ChatMessage[], size: number, splitLong = true): Chunk[] {
  const fullText = messages.map(formatMessage).join('\n\n');
  if (!splitLong || fullText.length <= size) {
    return [
      {
        id: 'c0',
        index: 0,
        text: fullText,
        messageIds: messages.map((m) => m.id),
        speakers: speakersOf(messages),
        overlapChars: 0,
      },
    ];
  }

  // Split only if excessively long
  return chunkFixedWindow(messages, size, 50);
}

/** 8. Heading section grouping. */
function chunkBySection(messages: ChatMessage[], size: number): Chunk[] {
  const targetSize = Math.max(100, Math.floor(size));
  const chunks: Chunk[] = [];

  // Group by speaker/heading
  const sections = new Map<string, ChatMessage[]>();
  for (const msg of messages) {
    const sectionName = msg.speaker || 'Section';
    if (!sections.has(sectionName)) sections.set(sectionName, []);
    sections.get(sectionName)!.push(msg);
  }

  for (const [section, sectionMessages] of sections.entries()) {
    let currentText = '';
    let currentIds: string[] = [];

    const flush = () => {
      if (currentText.trim()) {
        chunks.push({
          id: `c${chunks.length}`,
          index: chunks.length,
          text: currentText.trim(),
          messageIds: [...currentIds],
          speakers: [section].filter(Boolean),
          overlapChars: 0,
        });
        currentText = '';
        currentIds = [];
      }
    };

    for (const msg of sectionMessages) {
      const added = msg.text;
      if (currentText && currentText.length + added.length + 2 > targetSize) {
        flush();
      }
      currentText = currentText ? `${currentText}\n\n${added}` : added;
      currentIds.push(msg.id);
    }
    flush();
  }

  return chunks;
}

/** 9. Paragraph groups. */
function chunkByParagraphs(messages: ChatMessage[], groupSize: number): Chunk[] {
  const size = Math.max(1, Math.floor(groupSize));
  const chunks: Chunk[] = [];

  for (let i = 0; i < messages.length; i += size) {
    const group = messages.slice(i, i + size);
    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text: group.map((m) => m.text).join('\n\n'),
      messageIds: group.map((m) => m.id),
      speakers: speakersOf(group),
      overlapChars: 0,
    });
  }

  return chunks;
}

/** 10. Table of Contents alignment. */
function chunkByToc(messages: ChatMessage[], depth: number, _size: number): Chunk[] {
  const chunks: Chunk[] = [];
  const targetDepth = Math.max(1, Math.min(3, depth));

  // Determine heading depth by counting '#' in speaker or text
  const getDepth = (speaker: string): number => {
    const match = speaker.match(/^#+/);
    if (match) return match[0].length;
    if (speaker.startsWith('Chapter') || speaker.startsWith('1 ') || speaker.startsWith('2 ')) return 1;
    if (speaker.includes('.')) return 2;
    return 1;
  };

  let currentGroup: ChatMessage[] = [];

  const flush = () => {
    if (currentGroup.length > 0) {
      const text = currentGroup.map(formatMessage).join('\n\n');
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text,
        messageIds: currentGroup.map((m) => m.id),
        speakers: speakersOf(currentGroup),
        overlapChars: 0,
      });
      currentGroup = [];
    }
  };

  for (const msg of messages) {
    const d = getDepth(msg.speaker);
    if (d <= targetDepth && currentGroup.length > 0) {
      flush();
    }
    currentGroup.push(msg);
  }
  flush();

  return chunks;
}

/** 11. By page for PDFs and paged docs. */
function chunkByPage(messages: ChatMessage[], pagesPerChunk: number, _size: number): Chunk[] {
  const step = Math.max(1, Math.floor(pagesPerChunk));
  const chunks: Chunk[] = [];

  // Group messages that belong to the same page
  const pageMap = new Map<string, ChatMessage[]>();
  for (const msg of messages) {
    const pageKey = msg.speaker?.toLowerCase().includes('page')
      ? msg.speaker
      : (msg.timestamp || 'Page 1');
    if (!pageMap.has(pageKey)) pageMap.set(pageKey, []);
    pageMap.get(pageKey)!.push(msg);
  }

  const pages = Array.from(pageMap.entries());
  for (let i = 0; i < pages.length; i += step) {
    const group = pages.slice(i, i + step);
    const msgs = group.flatMap(([, mList]) => mList);
    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text: msgs.map(formatMessage).join('\n\n'),
      messageIds: msgs.map((m) => m.id),
      speakers: speakersOf(msgs),
      overlapChars: 0,
    });
  }

  return chunks;
}

/** 12. Table rows with column names repeated. */
function chunkByTableRows(messages: ChatMessage[], rowsPerChunk: number, rowFormat = 'pairs'): Chunk[] {
  const step = Math.max(1, Math.floor(rowsPerChunk));
  const chunks: Chunk[] = [];

  // Extract header row if present
  const header = messages[0]?.speaker?.includes('Header') || messages[0]?.text?.includes('|')
    ? messages[0].text
    : '';

  for (let i = 0; i < messages.length; i += step) {
    const group = messages.slice(i, i + step);
    let text = '';
    if (rowFormat === 'table' && header && !group.includes(messages[0])) {
      text = header + '\n' + group.map((m) => m.text).join('\n');
    } else {
      text = group.map((m) => `${m.speaker}: ${m.text}`).join('\n');
    }

    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text,
      messageIds: group.map((m) => m.id),
      speakers: speakersOf(group),
      overlapChars: 0,
    });
  }

  return chunks;
}

/** 13. Code definitions (functions, classes, interfaces). */
function chunkCode(messages: ChatMessage[], _size: number): Chunk[] {
  const chunks: Chunk[] = [];
  const fullText = messages.map((m) => m.text).join('\n');
  const lines = fullText.split(/\r?\n/);

  const defRegex = /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|def|fn|pub\s+fn|func)\s+\w+/;
  let currentBlock: string[] = [];

  const flush = () => {
    if (currentBlock.length > 0) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: currentBlock.join('\n'),
        messageIds: messages.map((m) => m.id),
        speakers: ['Code'],
        overlapChars: 0,
      });
      currentBlock = [];
    }
  };

  for (const line of lines) {
    if (defRegex.test(line) && currentBlock.length > 0) {
      flush();
    }
    currentBlock.push(line);
  }
  flush();

  return chunks;
}

/** 14. Layout elements (tables, code blocks, lists, blockquotes). */
function chunkByElements(messages: ChatMessage[], _size: number): Chunk[] {
  const chunks: Chunk[] = [];
  for (const msg of messages) {
    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text: msg.text,
      messageIds: [msg.id],
      speakers: [msg.speaker].filter(Boolean),
      overlapChars: 0,
    });
  }
  return chunks;
}

/** 15. Semantic breakpoints: cuts when sentence lexical overlap drops sharply. */
function chunkSemantic(messages: ChatMessage[], sensitivity: 'fewer' | 'balanced' | 'more' = 'balanced'): Chunk[] {
  const fullText = messages.map((m) => m.text).join('\n\n');
  const sentences = splitSentences(fullText);
  if (sentences.length <= 2) {
    return chunkPerMessage(messages);
  }

  const threshold = sensitivity === 'fewer' ? 0.08 : sensitivity === 'more' ? 0.35 : 0.2;
  const wordTokens = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 2));

  const chunks: Chunk[] = [];
  let currentGroup: string[] = [sentences[0]];

  const flush = () => {
    if (currentGroup.length > 0) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: currentGroup.join(' '),
        messageIds: messages.map((m) => m.id),
        speakers: speakersOf(messages),
        overlapChars: 0,
      });
      currentGroup = [];
    }
  };

  for (let i = 1; i < sentences.length; i++) {
    const prevTokens = wordTokens(sentences[i - 1]);
    const currTokens = wordTokens(sentences[i]);

    let intersection = 0;
    for (const t of currTokens) {
      if (prevTokens.has(t)) intersection++;
    }
    const union = new Set([...prevTokens, ...currTokens]).size;
    const similarity = union === 0 ? 0 : intersection / union;

    // If similarity drops below threshold, cut breakpoint
    if (similarity < threshold && currentGroup.join(' ').length > 150) {
      flush();
    }
    currentGroup.push(sentences[i]);
  }
  flush();

  return chunks;
}

/** 16. Topic segmentation. */
function chunkTopic(messages: ChatMessage[], sensitivity: 'fewer' | 'balanced' | 'more' = 'balanced'): Chunk[] {
  return chunkSemantic(messages, sensitivity);
}

/** 17. Conversation Sessions based on silence gap. */
function chunkSession(messages: ChatMessage[], gapMinutes = 60, maxMessages = 20): Chunk[] {
  const chunks: Chunk[] = [];
  let currentSession: ChatMessage[] = [];
  let lastTime: number | null = null;
  const gapMs = Math.max(5, gapMinutes) * 60 * 1000;

  const flush = () => {
    if (currentSession.length > 0) {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        text: currentSession.map(formatMessage).join('\n'),
        messageIds: currentSession.map((m) => m.id),
        speakers: speakersOf(currentSession),
        overlapChars: 0,
      });
      currentSession = [];
      lastTime = null;
    }
  };

  for (const msg of messages) {
    const parsedTime = msg.timestamp ? Date.parse(msg.timestamp) : NaN;
    const hasGap = lastTime !== null && !isNaN(parsedTime) && parsedTime - lastTime > gapMs;
    const hasCount = currentSession.length >= maxMessages;

    if (hasGap || hasCount) {
      flush();
    }

    currentSession.push(msg);
    if (!isNaN(parsedTime)) lastTime = parsedTime;
  }
  flush();

  return chunks;
}

/** 18. Day-wise chunking. */
function chunkDayWise(messages: ChatMessage[]): Chunk[] {
  const chunks: Chunk[] = [];
  const days = new Map<string, ChatMessage[]>();

  for (const msg of messages) {
    const day = msg.timestamp ? msg.timestamp.slice(0, 10) : 'Day 1';
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(msg);
  }

  for (const [day, dayMessages] of days.entries()) {
    chunks.push({
      id: `c${chunks.length}`,
      index: chunks.length,
      text: `[Date: ${day}]\n` + dayMessages.map(formatMessage).join('\n'),
      messageIds: dayMessages.map((m) => m.id),
      speakers: speakersOf(dayMessages),
      overlapChars: 0,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Personalization & Context Wrapping
// ---------------------------------------------------------------------------

function applyPersonalization(chunks: Chunk[], transcript: Transcript, options: ChunkOptions): Chunk[] {
  const { contextHeadingPath, contextTitle, contextPrefix, minChunkSize } = options;

  let processed = chunks;

  // 1. Merge small chunks if minChunkSize > 0
  if (minChunkSize && minChunkSize > 0 && processed.length > 1) {
    const merged: Chunk[] = [];
    let accumulator: Chunk | null = null;

    for (const chunk of processed) {
      if (!accumulator) {
        accumulator = { ...chunk };
      } else if (accumulator.text.length < minChunkSize) {
        accumulator.text += '\n\n' + chunk.text;
        accumulator.messageIds = [...new Set([...accumulator.messageIds, ...chunk.messageIds])];
        accumulator.speakers = [...new Set([...accumulator.speakers, ...chunk.speakers])];
      } else {
        merged.push(accumulator);
        accumulator = { ...chunk };
      }
    }
    if (accumulator) merged.push(accumulator);
    processed = merged;
  }

  // 2. Prepend context prefixes (Heading path, Title, Custom prefix)
  const prefixes: string[] = [];
  if (contextPrefix && contextPrefix.trim()) {
    prefixes.push(contextPrefix.trim());
  }
  if (contextTitle && transcript.sourceName) {
    prefixes.push(`Document: ${transcript.sourceName}`);
  }

  const basePrefix = prefixes.length > 0 ? prefixes.join(' · ') : '';

  return processed.map((chunk, index) => {
    let heading = '';
    if (contextHeadingPath && chunk.speakers.length > 0) {
      heading = chunk.speakers.join(' > ');
    }

    const leadParts = [basePrefix, heading ? `[${heading}]` : ''].filter(Boolean);
    const finalPrefix = leadParts.length > 0 ? leadParts.join(' ') + '\n' : '';

    return {
      ...chunk,
      id: `c${index}`,
      index,
      text: finalPrefix ? `${finalPrefix}${chunk.text}` : chunk.text,
    };
  });
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export function chunkTranscript(transcript: Transcript, options: ChunkOptions): Chunk[] {
  const { messages } = transcript;
  if (!messages || messages.length === 0) return [];
  let rawChunks: Chunk[];

  switch (options.strategy) {
    // Size Family
    case 'fixed-window':
      rawChunks = chunkFixedWindow(messages, options.size, options.overlap);
      break;
    case 'recursive':
      rawChunks = chunkRecursive(messages, options.size, options.respectHeadings ?? true);
      break;
    case 'sentence':
      rawChunks = chunkBySentence(messages, options.size, options.respectParagraphs ?? false);
      break;
    case 'symbol':
      rawChunks = chunkBySymbols(messages, options.splitSymbols ?? '.!?', options.piecesPerChunk ?? 2);
      break;
    case 'whole':
      rawChunks = chunkWhole(messages, options.size, options.splitLong ?? true);
      break;

    // Structure Family
    case 'section':
      rawChunks = chunkBySection(messages, options.size);
      break;
    case 'paragraph':
      rawChunks = chunkByParagraphs(messages, options.groupSize);
      break;
    case 'toc':
      rawChunks = chunkByToc(messages, options.tocDepth ?? 2, options.size);
      break;
    case 'page':
      rawChunks = chunkByPage(messages, options.pagesPerChunk ?? 1, options.size);
      break;
    case 'table-rows':
      rawChunks = chunkByTableRows(messages, options.rowsPerChunk ?? 5, options.rowFormat ?? 'pairs');
      break;
    case 'code':
      rawChunks = chunkCode(messages, options.size);
      break;
    case 'elements':
      rawChunks = chunkByElements(messages, options.size);
      break;

    // Meaning Family
    case 'semantic':
      rawChunks = chunkSemantic(messages, options.sensitivity ?? 'balanced');
      break;
    case 'topic':
      rawChunks = chunkTopic(messages, options.sensitivity ?? 'balanced');
      break;

    // Chat Family
    case 'per-message':
      rawChunks = chunkPerMessage(messages);
      break;
    case 'per-conversation':
      rawChunks = chunkPerConversation(messages, options.groupSize);
      break;
    case 'session':
      rawChunks = chunkSession(messages, options.gapMinutes ?? 60, options.maxMessages ?? 20);
      break;
    case 'day-wise':
      rawChunks = chunkDayWise(messages);
      break;

    default:
      rawChunks = chunkFixedWindow(messages, options.size, options.overlap);
      break;
  }

  return applyPersonalization(rawChunks, transcript, options);
}
