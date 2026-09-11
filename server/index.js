/**
 * Backend for the legacy RAG visualizer.
 *
 * The original frontend was written against a Python service that never
 * shipped with it. This is a drop in replacement for the contract that
 * frontend expects: JSON files on disk, an embedding job per file, named
 * collections of vectors, and semantic search over them.
 *
 * Everything lives in one process. The embedding model runs locally through
 * transformers.js, vectors are held in memory, and processed chunk files are
 * written next to the source data so the "Related Chunks" view has something
 * to show. Restarting the server clears the collections; re-run the embedding
 * job to rebuild them.
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pipeline, env } from '@huggingface/transformers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, 'data');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');
const PORT = Number(process.env.PORT) || 5050;

/** Sentence embedding model. Small, and good enough to demonstrate real semantic search. */
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const VECTOR_SIZE = 384;
/** Chunks embedded per forward pass. */
const BATCH_SIZE = 8;

// Cache downloaded weights inside the server folder rather than node_modules,
// so they survive a reinstall and are easy to find and delete.
env.cacheDir = path.join(HERE, '.cache');
env.allowLocalModels = false;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

let extractorPromise = null;

/** Loads the model once and reuses it for every later call. */
function loadModel() {
  if (!extractorPromise) {
    console.log(`[model] loading ${MODEL_ID} (first run downloads about 23 MB)`);
    extractorPromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' }).then((p) => {
      console.log('[model] ready');
      return p;
    });
    // A failed load must not be cached, or every later attempt fails the same way.
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

/** Embeds a list of texts into unit length vectors, in batches. */
async function embedTexts(texts, onBatch) {
  const extractor = await loadModel();
  const vectors = [];

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    const flat = output.data;

    for (let i = 0; i < batch.length; i++) {
      vectors.push(Float32Array.from(flat.subarray(i * VECTOR_SIZE, (i + 1) * VECTOR_SIZE)));
    }
    if (onBatch) onBatch(vectors.length, texts.length);
  }

  return vectors;
}

/** Cosine similarity. Vectors are unit length, so this is just the dot product. */
function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Resolves a client supplied path inside the data directory, refusing anything outside it. */
function resolveDataPath(relative) {
  const resolved = path.resolve(DATA_DIR, relative);
  if (resolved !== DATA_DIR && !resolved.startsWith(DATA_DIR + path.sep)) {
    const error = new Error('Path is outside the data directory.');
    error.status = 400;
    throw error;
  }
  return resolved;
}

/** Reads a JSON file and returns its records as an array. */
async function readRecords(absolutePath) {
  const parsed = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;

  // phpMyAdmin exports wrap rows in a table object. The original frontend
  // handles this shape too, so accept it here for consistency.
  if (parsed && typeof parsed === 'object') {
    for (const value of Object.values(parsed)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [parsed];
}

/** Lists source files and any processed chunk files derived from them. */
async function listFiles() {
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  const files = [];

  for (const name of await fs.readdir(DATA_DIR)) {
    if (!name.endsWith('.json')) continue;
    const absolute = path.join(DATA_DIR, name);
    const stat = await fs.stat(absolute);
    let recordCount = 0;
    try {
      recordCount = (await readRecords(absolute)).length;
    } catch {
      recordCount = 0;
    }
    files.push({
      name,
      path: name,
      size_mb: Number((stat.size / 1024 / 1024).toFixed(3)),
      record_count: recordCount,
      type: 'original',
      parent_file: null,
    });
  }

  for (const name of await fs.readdir(PROCESSED_DIR)) {
    if (!name.endsWith('.json')) continue;
    const absolute = path.join(PROCESSED_DIR, name);
    const stat = await fs.stat(absolute);
    let records = [];
    try {
      records = await readRecords(absolute);
    } catch {
      records = [];
    }
    files.push({
      name,
      // The path deliberately contains "processed": the frontend uses that
      // substring to tell a chunk file from a source file.
      path: `processed/${name}`,
      size_mb: Number((stat.size / 1024 / 1024).toFixed(3)),
      record_count: records.length,
      type: 'processed',
      parent_file: records[0]?.source_file ?? null,
    });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Renders question and answer pairs the way the frontend expects to parse them. */
function renderPairs(pairs) {
  return pairs.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n');
}

function average(values, fallback) {
  const numbers = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (numbers.length === 0) return fallback;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

/**
 * Cuts source records into chunks according to the chosen strategy.
 *
 * A source record is one user on one day, holding that day's question and
 * answer pairs. The three strategies are the ones the frontend offers:
 *   day-wise       one chunk per record, the whole day together
 *   message-wise   one chunk per question and answer pair
 *   message-count  groups of N pairs within a day
 *
 * Each chunk carries both the display fields the collection view renders and
 * the text that actually gets embedded.
 */
function chunkRecords(records, strategy, messageCount) {
  const chunks = [];

  for (const record of records) {
    const pairs = Array.isArray(record.chat_history) ? record.chat_history : [];
    if (pairs.length === 0) continue;

    const userId = record.user_id || record.user_uuid || 'unknown';
    const userName = record.user_name || 'User';
    const date = record.date || (pairs[0].timestamp || '').slice(0, 10) || 'unknown';

    if (strategy === 'message-wise') {
      for (const pair of pairs) {
        chunks.push({
          user_uuid: userId,
          user_name: userName,
          question_text: pair.question || '',
          answer_text: pair.answer || '',
          created_at: pair.timestamp || date,
          metadata: {
            memory_type: pair.memory_type || 'message-wise',
            importance: typeof pair.importance === 'number' ? pair.importance : 0.5,
            emotion: typeof pair.emotion === 'number' ? pair.emotion : 0,
            date,
          },
          embed_text: `${userName} on ${date}. Q: ${pair.question} A: ${pair.answer}`,
        });
      }
      continue;
    }

    // day-wise is one group holding every pair; message-count is groups of N.
    const size = strategy === 'message-count' ? Math.max(1, Math.floor(messageCount) || 3) : pairs.length;
    const groups = [];
    for (let i = 0; i < pairs.length; i += size) groups.push(pairs.slice(i, i + size));

    groups.forEach((group, index) => {
      const label = groups.length > 1 ? `Day Summary: ${date} (part ${index + 1})` : `Day Summary: ${date}`;
      const block = renderPairs(group);
      chunks.push({
        user_uuid: userId,
        user_name: userName,
        question_text: label,
        answer_text: block,
        created_at: group[0].timestamp || date,
        metadata: {
          memory_type: 'day-wise-chunk',
          importance: average(group.map((p) => p.importance), 0.5),
          emotion: average(group.map((p) => p.emotion), 0),
          date,
          message_count: group.length,
        },
        embed_text: `${userName} on ${date}.\n${block}`,
      });
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** name -> { name, chunking_strategy, description, source_file, points } */
const collections = new Map();
/** job_id -> status record */
const jobs = new Map();

const COLLECTION_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Runs one embedding job to completion, updating its status as it goes. */
async function runJob(job, request) {
  try {
    job.status = 'processing';
    const absolute = resolveDataPath(request.file_path);
    const records = await readRecords(absolute);
    const chunks = chunkRecords(records, request.chunking_strategy, request.message_count);

    job.total_records = chunks.length;
    if (chunks.length === 0) throw new Error('No chat_history records found in that file.');

    const vectors = await embedTexts(
      chunks.map((c) => c.embed_text),
      (done, total) => {
        job.processed = done;
        job.progress = Math.round((done / total) * 100);
      },
    );

    const points = chunks.map((chunk, index) => ({
      id: `${request.collection_name}-${index}`,
      user_uuid: chunk.user_uuid,
      user_name: chunk.user_name,
      question_text: chunk.question_text,
      answer_text: chunk.answer_text,
      created_at: chunk.created_at,
      metadata: chunk.metadata,
      vector: vectors[index],
    }));

    collections.set(request.collection_name, {
      name: request.collection_name,
      chunking_strategy: request.chunking_strategy,
      description: `${path.basename(request.file_path)} via ${request.chunking_strategy}`,
      source_file: path.basename(request.file_path),
      points,
    });

    // Write the chunk file the "Related Chunks" view reads. It is derived
    // data, so it is not committed and can be regenerated at any time.
    await fs.mkdir(PROCESSED_DIR, { recursive: true });
    const base = path.basename(request.file_path, '.json');
    const processedName = `${base}.${request.chunking_strategy}.processed.json`;
    const processed = chunks.map((chunk) => ({
      source_file: path.basename(request.file_path),
      user_uuid: chunk.user_uuid,
      user_name: chunk.user_name,
      date: chunk.metadata.date,
      first_timestamp: chunk.created_at,
      chunk_text: chunk.answer_text,
      message_count: chunk.metadata.message_count ?? 1,
      chunking_strategy: request.chunking_strategy,
      importance: chunk.metadata.importance,
    }));
    await fs.writeFile(path.join(PROCESSED_DIR, processedName), JSON.stringify(processed, null, 2));

    job.status = 'completed';
    job.progress = 100;
    job.processed = chunks.length;
    job.collection_name = request.collection_name;
    console.log(`[embed] ${request.collection_name}: ${chunks.length} chunks from ${request.file_path}`);
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    console.error(`[embed] job ${job.job_id} failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/', (_request, response) => {
  response.json({
    ok: true,
    model: MODEL_ID,
    vector_size: VECTOR_SIZE,
    collections: collections.size,
    jobs: jobs.size,
  });
});

app.get('/files/list', async (_request, response) => {
  response.json({ files: await listFiles() });
});

app.get('/files/content', async (request, response) => {
  const relative = String(request.query.path || '');
  if (!relative) return response.status(400).json({ error: 'path is required' });

  const absolute = resolveDataPath(relative);
  const content = await readRecords(absolute);
  response.json({ filename: path.basename(absolute), content, total_records: content.length });
});

app.post('/upload', upload.single('file'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'No file field named "file" in the upload.' });

  // Validate it really is JSON before it lands in the data directory.
  try {
    JSON.parse(request.file.buffer.toString('utf8'));
  } catch {
    return response.status(400).json({ error: 'Uploaded file is not valid JSON.' });
  }

  const safe = path
    .basename(request.file.originalname || 'upload.json')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.json$/i, '') + '.json';

  await fs.writeFile(path.join(DATA_DIR, safe), request.file.buffer);
  response.json({ file_id: safe, message: `Saved as ${safe}` });
});

app.post('/embed/process', async (request, response) => {
  const { file_path, collection_name, chunking_strategy, message_count } = request.body || {};

  if (!file_path) return response.status(400).json({ error: 'file_path is required' });
  if (!COLLECTION_NAME.test(collection_name || '')) {
    return response.status(400).json({ error: 'collection_name must be 1 to 64 letters, digits, dashes or underscores' });
  }
  if (!['day-wise', 'message-wise', 'message-count'].includes(chunking_strategy)) {
    return response.status(400).json({ error: 'chunking_strategy must be day-wise, message-wise or message-count' });
  }

  try {
    await fs.access(resolveDataPath(file_path));
  } catch {
    return response.status(404).json({ error: `No such file: ${file_path}` });
  }

  const job = {
    job_id: randomUUID(),
    status: 'pending',
    progress: 0,
    total_records: 0,
    processed: 0,
    collection_name: undefined,
    error: undefined,
  };
  jobs.set(job.job_id, job);

  // Fire and forget: the frontend polls /embed/status for the outcome.
  runJob(job, { file_path, collection_name, chunking_strategy, message_count });

  response.json({ job_id: job.job_id, message: `Embedding ${file_path} into ${collection_name}` });
});

app.get('/embed/status/:jobId', (request, response) => {
  const job = jobs.get(request.params.jobId);
  if (!job) return response.status(404).json({ error: 'Unknown job' });
  response.json(job);
});

app.get('/collections', (_request, response) => {
  response.json({
    collections: [...collections.values()].map((c) => ({
      name: c.name,
      points_count: c.points.length,
      chunking_strategy: c.chunking_strategy,
      description: c.description,
      vector_size: VECTOR_SIZE,
    })),
  });
});

function getCollection(name, response) {
  const collection = collections.get(name);
  if (!collection) {
    response.status(404).json({ error: `No collection named ${name}. Run an embedding job first.` });
    return null;
  }
  return collection;
}

app.get('/collections/:name/users', (request, response) => {
  const collection = getCollection(request.params.name, response);
  if (!collection) return;

  const seen = new Map();
  for (const point of collection.points) {
    if (!seen.has(point.user_uuid)) seen.set(point.user_uuid, point.user_name);
  }
  response.json({ users: [...seen].map(([user_id, user_name]) => ({ user_id, user_name })) });
});

app.get('/collections/:name/messages', (request, response) => {
  const collection = getCollection(request.params.name, response);
  if (!collection) return;

  const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(request.query.offset) || 0, 0);
  const userUuid = request.query.user_uuid ? String(request.query.user_uuid) : null;

  const filtered = userUuid
    ? collection.points.filter((p) => p.user_uuid === userUuid)
    : collection.points;

  const page = filtered.slice(offset, offset + limit).map(({ vector, ...point }) => point);

  response.json({
    messages: page,
    total: filtered.length,
    collection: collection.name,
    has_more: offset + page.length < filtered.length,
  });
});

app.post('/search', async (request, response) => {
  const { query, collection_name, user_uuid, limit, score_threshold } = request.body || {};

  if (!query || !String(query).trim()) return response.status(400).json({ error: 'query is required' });
  const collection = getCollection(collection_name, response);
  if (!collection) return;

  const [queryVector] = await embedTexts([String(query).trim()]);
  const threshold = typeof score_threshold === 'number' ? score_threshold : 0;
  const top = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const candidates = user_uuid
    ? collection.points.filter((p) => p.user_uuid === user_uuid)
    : collection.points;

  const results = candidates
    .map((point) => ({ point, score: cosine(queryVector, point.vector) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map(({ point, score }) => ({
      score,
      question: point.question_text,
      answer: point.answer_text,
      timestamp: point.created_at,
      user_id: point.user_uuid,
      user_name: point.user_name,
      memory_type: point.metadata.memory_type,
      importance_score: point.metadata.importance,
    }));

  response.json({ query, count: results.length, results });
});

// Errors thrown inside async handlers land here in Express 5.
app.use((error, _request, response, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  response.status(status).json({ error: error.message || 'Internal error' });
});

await fs.mkdir(PROCESSED_DIR, { recursive: true });

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] data directory: ${DATA_DIR}`);
  // Start the download now so the first embedding job does not pay for it.
  loadModel().catch((error) => console.error(`[model] failed to load: ${error.message}`));
});
