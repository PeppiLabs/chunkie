<div align="center">

<img src="public/favicon.svg" width="56" height="56" alt="Peppi Labs" />

# Chunkie, legacy edition

**The original three panel RAG visualizer, kept runnable.**

Browse a chat memory collection, embed a JSON export into it with one of three chunking
strategies, and run semantic search over the result.

[![License: MIT](https://img.shields.io/badge/License-MIT-0b5ed7.svg)](LICENSE)
[![Branch](https://img.shields.io/badge/branch-legacy-0b5ed7.svg)](#about-this-branch)

A [Peppi Labs](https://github.com/PeppiLabs) open source project.

</div>

---

## About this branch

This is the first version of the tool, preserved on the `legacy` branch because some people
prefer its dashboard layout: a configuration panel on the left, a grid of conversation cards in
the middle, and a detail panel on the right.

The current version lives on [`main`](https://github.com/PeppiLabs/chunkie). It is a step by step
teaching tool that runs entirely in the browser. This branch is a different shape of the same idea
and is maintained only so that it keeps running.

The original frontend was written against a backend service that was never published with it.
This branch ships a small replacement backend that implements exactly the contract the frontend
expects, so the whole thing runs locally with no external services, no API keys and no database.

## Running it

Requires Node.js 20.19 or newer. Two processes: the backend and the frontend.

```bash
git clone --branch legacy https://github.com/PeppiLabs/chunkie.git chunkie-legacy
cd chunkie-legacy
npm install
```

Terminal one, the backend:

```bash
npm run server
```

The first start downloads the embedding model, roughly 23 MB, into `server/.cache`. Later starts
are instant. Wait for `[model] ready` before running an embedding job.

Terminal two, the frontend:

```bash
npm run dev
```

Open the URL it prints, usually <http://localhost:5173>.

### Ports

The backend listens on **127.0.0.1:5050**, this machine only. The original code used port 5000,
which on macOS is taken by the AirPlay Receiver, so it was moved. Everything is configurable
through `.env` (see `.env.example`): `PORT` and `HOST` for the backend, `VITE_API_URL` for where
the frontend looks, and `ALLOWED_ORIGINS` if a browser on another origin needs access. Any port
on `localhost` is always allowed, so the frontend keeps working if Vite picks a different one.

## Using it

The left panel walks through three stages.

1. **Source JSON.** Pick a file from `server/data/` and load it. The grid shows the raw
   conversations grouped by person and day. A sample file, `buddy_chats.json`, is included.
2. **Related chunks.** Once a file has been embedded, the chunk file the job wrote appears here.
   Selecting it shows how the source was cut up.
3. **Final collection.** Choose an embedded collection, optionally filter to one person, and load
   it into the grid. With a person selected, the search bar at the top runs semantic search over
   their records.

Switch the panel to **New** to embed a file: choose the source, name the collection, pick a
chunking strategy, and start the job. The page polls until it finishes, then opens the collection.

| Strategy | What one chunk holds |
| --- | --- |
| `day-wise` | Every question and answer from one person on one day |
| `message-wise` | A single question and its answer |
| `message-count` | A fixed number of consecutive pairs from one day |

Collections live in the backend's memory. Restart it and they are gone; the embedding job rebuilds
them in seconds.

## Data format

Source files are a JSON array. Each record is one person on one day:

```json
[
  {
    "user_id": "u-3f9a1c2e-marcus",
    "user_name": "Marcus",
    "date": "2026-05-04",
    "chat_history": [
      {
        "question": "I want to start running. Where do I begin?",
        "answer": "Start smaller than feels necessary. Three sessions this week.",
        "timestamp": "2026-05-04T08:14:00",
        "memory_type": "goal",
        "importance": 0.85,
        "emotion": 0.4
      }
    ]
  }
]
```

`memory_type`, `importance` and `emotion` are optional and only affect what the detail panel
shows. Drop your own file into `server/data/`, or upload it through the API, which stores it in
`server/data/uploads/` and never overwrites an existing file. Restart nothing: the file list is
read fresh on every request.

The bundled sample is synthetic. It contains no real people and no real data.

## The backend

One file, [`server/index.js`](server/index.js), about 530 lines.

| Endpoint | Purpose |
| --- | --- |
| `GET /files/list` | Source files and processed chunk files |
| `GET /files/content?path=` | Contents of one file |
| `POST /upload` | Add a JSON file, multipart field `file` |
| `POST /embed/process` | Start an embedding job |
| `GET /embed/status/:jobId` | Poll a job |
| `GET /collections` | Embedded collections |
| `GET /collections/:name/users` | People in a collection |
| `GET /collections/:name/messages` | Paged records, optionally per person |
| `POST /search` | Semantic search over a collection |

The embedding model is `Xenova/all-MiniLM-L6-v2` at 8 bit precision, 384 dimensions, run
through [transformers.js](https://github.com/huggingface/transformers.js). Search is exhaustive
cosine similarity over the collection, which is instant at this scale.

## Commands

| Command | Does |
| --- | --- |
| `npm run server` | Start the backend on port 5050 |
| `npm run dev` | Start the frontend with hot reload |
| `npm run build` | Type check and build the frontend to `dist/` |
| `npm run lint` | Run ESLint |

## A note on `npm audit`

`npm audit` reports advisories in `sharp` and `onnxruntime-node`, which arrive with
`@huggingface/transformers`. `sharp` is for image inputs this project never uses. Unlike the
browser only version on `main`, this branch does run `onnxruntime-node`, because the backend
embeds on the server side. It binds to 127.0.0.1 only, accepts browser requests only from
localhost origins, and is intended for local use.

## License

[MIT](LICENSE). Copyright 2026 Peppi Labs.
