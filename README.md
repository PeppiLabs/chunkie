<div align="center">

<img src="public/favicon.svg" width="64" height="64" alt="Peppi Labs" />

# Chunkie

**See how retrieval augmented generation actually works.**

Clone it, run it, and watch a chat transcript get chunked, turned into vectors, and searched by
meaning. Every step is visible, nothing is hidden, and no jargon is assumed.

[![License: MIT](https://img.shields.io/badge/License-MIT-0b5ed7.svg)](LICENSE)
[![Built with React](https://img.shields.io/badge/React-19-0b5ed7.svg)](https://react.dev)
[![Runs in the browser](https://img.shields.io/badge/backend-none-0b5ed7.svg)](#how-it-works)

A [Peppi Labs](https://github.com/PeppiLabs) open source project.

</div>

---

## What this is

Most explanations of RAG are diagrams. This one is the real thing, running in front of you.

You load a chat transcript, and the app walks through the four stages every RAG system performs:

| Stage | What happens | What you can see |
| --- | --- | --- |
| **1. Load** | A JSON transcript is parsed into messages | The raw chat, exactly as the system sees it |
| **2. Chunk** | The chat is cut into retrievable pieces | Chunk boundaries, sizes, and the overlap between them |
| **3. Embed** | Each chunk becomes 384 numbers | The actual vector values, and a 2D map of the vector space |
| **4. Search** | Your question is compared to every chunk | Cosine scores, ranked results, and the context an LLM would receive |

The point most people miss is stage 4. Ask the support transcript "how long before I am
reimbursed" and the passage it returns is "we process the refund within two days of the parcel
reaching our warehouse, then your bank takes another three to five days". The question and the
answer share no words at all, so a keyword search finds nothing. That gap is the entire reason RAG
systems bother with embeddings, and you can watch it happen.

## Try it

Clone the repository and run it (see [Running it](#running-it) below). Three transcripts are
bundled, so there is nothing to find first, and you can drop in your own JSON file at any point.

## How it works

**There is no backend.** The embedding model runs inside your browser tab via
[transformers.js](https://github.com/huggingface/transformers.js), and the vector search is plain
cosine similarity over an in-memory array.

That is a deliberate design choice, not a shortcut:

- **Your data never leaves your machine.** Files are read by the browser and stay in the tab.
- **No account, no database, no server process.** Just a dev server serving static files.
- **No API keys and no paid services.** Nothing to sign up for before it works.
- **The numbers on screen are real.** They are the model's actual output, not a simulation.

```
Your browser
  transcript.json
        |
        v
  parse  ->  chunk  ->  embed (WASM, in a Web Worker)  ->  vectors in memory
                                                                |
  your question  ->  embed  ->  cosine similarity vs every chunk  ->  ranked results
```

| Piece | Choice | Why |
| --- | --- | --- |
| Embedding model | `Xenova/all-MiniLM-L6-v2`, 384 dimensions, int8 quantised | Around 23 MB, small enough to download once and good enough to demonstrate real semantic behaviour |
| Runtime | ONNX Runtime Web (WASM) | Runs the model in a Web Worker so the interface never freezes |
| Vector store | A JavaScript array | With a few hundred chunks, an exhaustive scan is instant. A real system would use a vector database, and the app says so |
| 2D projection | Principal component analysis, implemented in `src/lib/vector.ts` | The two axes are the directions the chunks differ along most, so on-screen distance reflects real distance |

## Running it

Requires Node.js 20.19 or newer. Check with `node -v`.

```bash
git clone https://github.com/PeppiLabs/chunkie.git
cd chunkie
npm install
npm run dev
```

Then open the URL the terminal prints, usually <http://localhost:5173>.

The first time you reach the Embed step, the browser downloads the embedding model, roughly 23 MB.
That happens once and your browser caches it, so every later run starts immediately. It needs an
internet connection for that first download only; everything after it is local.

| Command | Does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type check and build to `dist/` |
| `npm run preview` | Serve the built site locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type check without emitting |

### About the cross origin headers

`vite.config.ts` sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` for both the
dev server and the preview server. They make the page cross origin isolated, which is what lets the
WASM runtime use its faster multi threaded backend.

If you ever serve the built output some other way, without those two headers the model still runs,
just on a slower single threaded path.

## Bringing your own transcript

Any JSON file up to 5 MB. The parser accepts an array of messages, or an object containing one
(it looks for `messages`, `conversation`, `chat`, `history`, `data`, or `items`, and otherwise
falls back to the longest array it finds).

Each message needs a text field. These names are recognised:

- **Text** (required): `text`, `message`, `content`, `body`, `answer`, `value`
- **Speaker**: `speaker`, `sender`, `author`, `user`, `from`, `name`, `role`
- **Timestamp**: `timestamp`, `time`, `date`, `created_at`, `sent_at`

```json
[
  { "speaker": "Priya", "timestamp": "2026-03-02T09:14:00Z", "text": "My package still has not turned up." },
  { "speaker": "Support", "timestamp": "2026-03-02T09:15:10Z", "text": "Sorry about that, can you give me the order number?" }
]
```

The three bundled samples live in [`public/samples/`](public/samples) and are entirely synthetic.
They contain no real people and no personal data.

## Project layout

```
src/
  lib/
    parse.ts        Turns an uploaded file into messages
    chunk.ts        The three chunking strategies
    vector.ts       Cosine similarity and the PCA projection
    embedder.ts     Main thread client for the worker
  worker/
    embedder.worker.ts   Loads and runs the model off the main thread
  hooks/
    useRagPipeline.ts    Owns the pipeline state end to end
  components/
    steps/          One component per stage
    viz/            Vector strip, 2D map, score bars, chunk cards
    common/         Buttons, panels, the explainer callouts
    layout/         Header, footer, step navigation
public/samples/     The three bundled transcripts
```

## A note on `npm audit`

`npm audit` reports advisories in `sharp` and `onnxruntime-node`. Both arrive as dependencies of
`@huggingface/transformers`, and both are **Node.js only**: `sharp` handles server side image
processing and `onnxruntime-node` is the native inference backend. This app is a browser build that
uses `onnxruntime-web`, so neither package is ever bundled or shipped.

You can verify that yourself:

```bash
npm run build
grep -r "onnxruntime-node" dist/    # no matches
grep -r "sharp" dist/               # no matches
```

They are install time dependencies of the toolchain, not part of what visitors download.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

The most useful contributions are the ones that make a concept clearer to somebody encountering it
for the first time. If a sentence in the app confused you, that is a bug worth reporting.

## License

[MIT](LICENSE). Copyright 2026 Peppi Labs.
