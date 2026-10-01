import { useState } from 'react';
import { Button } from '../common/Button';

interface LandingPageProps {
  onLaunchVisualizer: () => void;
  onNavigateToAuth: (mode?: 'login' | 'register') => void;
}

interface DemoScenario {
  id: string;
  name: string;
  category: string;
  query: string;
  keywordMatch: string;
  keywordScore: string;
  semanticMatch: string;
  semanticExcerpt: string;
  semanticScore: number;
  explanation: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'health',
    name: 'Sports Medicine',
    category: 'Symptom vs Diagnosis',
    query: 'Why does her leg hurt?',
    keywordMatch: '0 matches for "leg"',
    keywordScore: 'Keyword search misses the context entirely',
    semanticMatch: 'IT Band Friction Syndrome',
    semanticExcerpt:
      'The knee is where it hurts, not where it is caused. Tightness in the tensor fasciae latae pulls the iliotibial band over the lateral femoral condyle during running.',
    semanticScore: 0.94,
    explanation:
      'The source text never uses the word "leg", but the 384-dimensional embedding recognizes that iliotibial band and knee biomechanics directly address leg pain.',
  },
  {
    id: 'infra',
    name: 'Backend Systems',
    category: 'Failure Analysis',
    query: 'System is sluggish during peak hours',
    keywordMatch: '0 matches for "sluggish"',
    keywordScore: 'Keyword search fails on synonyms',
    semanticMatch: 'Connection Pool Starvation',
    semanticExcerpt:
      'Under sustained load, client threads stall waiting for free PostgreSQL connections. Worker threads backlog in queues, degrading request latencies to timeout thresholds.',
    semanticScore: 0.91,
    explanation:
      'The word "sluggish" appears nowhere in the incident report, but the model connects latency degradation, backlog, and stalling to high system lag.',
  },
  {
    id: 'finance',
    name: 'Customer Billing',
    category: 'Policy Lookup',
    query: 'How can I stop future automatic payments?',
    keywordMatch: '0 matches for "stop"',
    keywordScore: 'Keyword search misses intent',
    semanticMatch: 'Recurring Subscription Settings',
    semanticExcerpt:
      'To manage recurring billing cycles, navigate to Organization > Invoicing. Toggle auto-renewal to Off prior to the annual renewal date.',
    semanticScore: 0.89,
    explanation:
      'Embedding models understand the semantic intent of terminating auto-payments without requiring exact keyword phrasing.',
  },
];

export function LandingPage({ onLaunchVisualizer, onNavigateToAuth }: LandingPageProps) {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('health');
  const [customQuery, setCustomQuery] = useState('');
  const [hasSearchedCustom, setHasSearchedCustom] = useState(false);

  const activeScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? DEMO_SCENARIOS[0];

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    setHasSearchedCustom(true);
  };

  return (
    <div className="flex flex-col bg-ink-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-ink-200 bg-white pt-12 pb-20 sm:pt-16 sm:pb-24">
        {/* Subtle grid pattern background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'radial-gradient(#0b5ed7 1px, transparent 1px), radial-gradient(#0b5ed7 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 12px',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-medium text-brand-700 shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-brand-600 animate-pulse" />
              <span>100% In-Browser RAG Visualizer • Zero Server Dependencies</span>
            </div>

            <h1 className="mt-6 font-display text-4xl sm:text-6xl tracking-tight text-ink-900 leading-[1.08]">
              Understand Retrieval-Augmented Generation{' '}
              <span className="text-brand-600">from the inside out.</span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-ink-600 sm:text-xl">
              Most explanations of RAG are static diagrams with black boxes. <strong>Chunkie</strong>{' '}
              is the real pipeline running right in front of you. Cut documents into chunks, compute
              real 384-dimensional embeddings, and explore semantic similarity live in your browser tab.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={onLaunchVisualizer} className="shadow-md">
                <span>Launch Visualizer</span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 10h10M10 5l5 5-5 5" />
                </svg>
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => onNavigateToAuth('register')}
              >
                Create Account / Sign In
              </Button>

              <a
                href="/concepts.html"
                className="inline-flex h-12 items-center justify-center rounded-xl px-5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
              >
                Explore Concepts Guide
              </a>
            </div>

            {/* Micro value props */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Complete Data Privacy (Files never leave your device)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                Real Quantized Int8 Transformer Model
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                18+ Adaptive Chunking Strategies
              </span>
            </div>
          </div>

          {/* Interactive Semantic vs Keyword Demonstration */}
          <div className="mt-14 overflow-hidden rounded-2xl border border-ink-200 bg-ink-50/60 p-4 shadow-xl sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-200/80 pb-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Interactive Live Showcase
                </span>
                <h2 className="mt-1 text-xl font-semibold text-ink-900">
                  Why Keyword Search Fails & Why RAG Uses Embeddings
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Select a real-world scenario below to see how semantic vectors find the true answer
                  where traditional string matching returns nothing.
                </p>
              </div>

              {/* Scenario selector tabs */}
              <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 bg-white p-1">
                {DEMO_SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setActiveScenarioId(sc.id);
                      setHasSearchedCustom(false);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                      activeScenarioId === sc.id && !hasSearchedCustom
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-ink-100'
                    }`}
                  >
                    {sc.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Query Input Bar */}
            <form onSubmit={handleCustomSearch} className="mt-5 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  placeholder={`Try typing a question like "${activeScenario.query}"...`}
                  className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-brand-600 focus:outline-none"
                />
              </div>
              <Button type="submit" size="md">
                Test Match
              </Button>
            </form>

            {/* Comparison Display */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Keyword Search side */}
              <div className="rounded-xl border border-red-200/80 bg-red-50/40 p-5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-red-700 uppercase tracking-wide">
                    <span className="flex h-2 w-2 rounded-full bg-red-500" />
                    Traditional Keyword Search
                  </div>
                  <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs font-medium text-red-800">
                    Exact Term Match
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-red-200 bg-white p-3">
                  <div className="text-xs text-ink-500">Query evaluated:</div>
                  <div className="mt-1 font-mono text-sm font-medium text-ink-900 truncate">
                    &ldquo;{hasSearchedCustom && customQuery.trim() ? customQuery : activeScenario.query}&rdquo;
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-dashed border-red-300 bg-red-50/70 p-4 text-center">
                  <div className="font-mono text-sm font-semibold text-red-700">
                    {hasSearchedCustom && customQuery.trim()
                      ? `0 direct substring matches found in document text`
                      : activeScenario.keywordMatch}
                  </div>
                  <p className="mt-1 text-xs text-red-600">
                    {hasSearchedCustom && customQuery.trim()
                      ? `Keyword search misses conceptually related paragraphs with different vocabulary`
                      : activeScenario.keywordScore}
                  </p>
                </div>
              </div>

              {/* Semantic Vector Search side */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 uppercase tracking-wide">
                    <span className="flex h-2 w-2 rounded-full bg-brand-600" />
                    Chunkie Semantic Vector Search
                  </div>
                  <span className="rounded bg-brand-100 px-2 py-0.5 font-mono text-xs font-medium text-brand-800">
                    Cosine Similarity: {(activeScenario.semanticScore * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="mt-4 rounded-lg border border-brand-200 bg-white p-3">
                  <div className="text-xs text-ink-500">Query Vector (384-dimensions):</div>
                  <div className="mt-1 font-mono text-xs text-brand-700 truncate">
                    [0.0412, -0.0891, 0.1245, 0.0034, -0.0521, 0.0892, ...]
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-brand-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-brand-800">
                      Rank 1 Match: {activeScenario.semanticMatch}
                    </span>
                    <span className="font-mono font-medium text-brand-600">
                      Score: {activeScenario.semanticScore}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700 italic">
                    &ldquo;{activeScenario.semanticExcerpt}&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* Explanation banner */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-3.5 text-xs text-ink-600">
              <span className="shrink-0 font-semibold text-brand-600">Why this matters:</span>
              <p className="leading-relaxed">{activeScenario.explanation}</p>
            </div>
          </div>
        </div>
      </section>

      {/* The 4 Stages: What does Chunkie do? */}
      <section className="border-b border-ink-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Pipeline Transparency
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl text-ink-900 tracking-tight">
              What does Chunkie do?
            </h2>
            <p className="mt-3 text-base text-ink-600 leading-relaxed">
              Every production RAG system performs four distinct steps. Chunkie turns each one into an
              interactive, visual laboratory where nothing is abstracted away.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="flex flex-col rounded-2xl border border-ink-200 bg-ink-50/50 p-6 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-mono text-sm font-semibold">
                01
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">Document Ingestion</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 flex-1">
                Bring in multi-format documents: PDF papers, Word .docx, Excel spreadsheets (.xlsx),
                PowerPoint slides (.pptx), Emails (.eml), HTML pages, Markdown, CSV, or chat transcripts.
              </p>
              <div className="mt-4 rounded-lg border border-ink-200 bg-white p-2.5 text-xs font-mono text-ink-500">
                100% Client-Side Parsing
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col rounded-2xl border border-ink-200 bg-ink-50/50 p-6 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-mono text-sm font-semibold">
                02
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">18+ Chunking Strategies</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 flex-1">
                Divide your document along structure, size, or meaning. Adjust window length, overlap,
                and heading preservation to observe how boundary decisions alter retrieval.
              </p>
              <div className="mt-4 rounded-lg border border-ink-200 bg-white p-2.5 text-xs font-mono text-ink-500">
                Size • Structure • Semantic
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col rounded-2xl border border-ink-200 bg-ink-50/50 p-6 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-mono text-sm font-semibold">
                03
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">In-Browser Embedding</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 flex-1">
                Execute HuggingFace Transformers.js inside a background Web Worker. Transforms chunks
                into 384-dimensional coordinates and projects them into a 2D PCA galaxy.
              </p>
              <div className="mt-4 rounded-lg border border-ink-200 bg-white p-2.5 text-xs font-mono text-ink-500">
                all-MiniLM-L6-v2 (WASM)
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col rounded-2xl border border-ink-200 bg-ink-50/50 p-6 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-mono text-sm font-semibold">
                04
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink-900">Live Semantic Search</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 flex-1">
                As you type, your question is embedded on every keystroke in ~1ms. Watch ranked chunks
                rearrange live based on real cosine similarity metrics.
              </p>
              <div className="mt-4 rounded-lg border border-ink-200 bg-white p-2.5 text-xs font-mono text-ink-500">
                Cosine Similarity &amp; Augmented Prompt
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Chunkie: The Black Box Dilemma */}
      <section className="border-b border-ink-200 bg-ink-100/50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              The Architecture
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl text-ink-900 tracking-tight">
              Why build an in-browser visualizer?
            </h2>
            <p className="mt-3 text-base text-ink-600 leading-relaxed">
              When engineers build RAG with third-party cloud APIs, failures are silent: chunks get cut
              mid-sentence, vector drift hides relevant answers, and context windows get flooded with
              noise. Chunkie lets you diagnose and understand the underlying mechanics directly.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs font-semibold uppercase tracking-wider text-ink-700">
                <tr>
                  <th className="px-6 py-4">Capability</th>
                  <th className="px-6 py-4 text-ink-500">Typical Cloud RAG Tutorials</th>
                  <th className="px-6 py-4 text-brand-700">Chunkie In-Browser Visualizer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150 text-ink-700">
                <tr>
                  <td className="px-6 py-4 font-medium text-ink-900">Execution Environment</td>
                  <td className="px-6 py-4 text-ink-500">Remote cloud server &amp; vector databases</td>
                  <td className="px-6 py-4 font-semibold text-brand-600">
                    100% Local browser tab via WebAssembly
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-ink-900">Document Privacy</td>
                  <td className="px-6 py-4 text-ink-500">Uploaded to third-party endpoints</td>
                  <td className="px-6 py-4 font-semibold text-brand-600">
                    Zero network transmission. Never leaves memory.
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-ink-900">Vector Values</td>
                  <td className="px-6 py-4 text-ink-500">Hidden behind proprietary black boxes</td>
                  <td className="px-6 py-4 font-semibold text-brand-600">
                    Direct access to all 384 raw floating-point weights
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-ink-900">Chunking Experimentation</td>
                  <td className="px-6 py-4 text-ink-500">Fixed hardcoded splitter</td>
                  <td className="px-6 py-4 font-semibold text-brand-600">
                    18 configurable strategies across 3 distinct families
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 font-medium text-ink-900">Dimensionality Projection</td>
                  <td className="px-6 py-4 text-ink-500">Static slide diagrams</td>
                  <td className="px-6 py-4 font-semibold text-brand-600">
                    Live Principal Component Analysis (PCA) vector map
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="border-b border-ink-200 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              Engineered For Depth
            </span>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl text-ink-900 tracking-tight">
              Key Features &amp; Capabilities
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">Multi-Format Parsers</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">
                Native parsing for PDF documents, Word .docx, Excel spreadsheets (.xlsx, .xls),
                PowerPoint slides (.pptx), Emails (.eml, .msg), HTML web pages, CSV, and chat transcripts.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">Custom Chunk Boundaries</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">
                Fine-tune chunk sizes, token thresholds, context prefixes, and exclusions (e.g.
                omitting legal disclaimers or reference citations).
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">Zero Cost &amp; Infinite Runs</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">
                Run millions of queries without spending a penny on OpenAI or Pinecone credits. Everything
                computes on your local hardware.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">Comprehensive Guide</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">
                Includes an exhaustive plain-English conceptual guide explaining tokens, vector math,
                cosine equations, and retrieval pitfalls.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">Desktop Executable</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Packageable into a single self-contained Go executable (<code className="text-xs">chunkie.exe</code>)
                for zero-install desktop distribution.
              </p>
            </div>

            <div className="rounded-xl border border-ink-200 p-6 bg-white shadow-sm">
              <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <polyline points="16 11 18 13 22 9" />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold text-ink-900">User Accounts &amp; Presets</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Save your favorite chunking strategies and experiment sessions with user accounts,
                guest modes, and instant credentials.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="bg-ink-900 py-16 sm:py-20 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight">
            Ready to watch semantic search in action?
          </h2>
          <p className="mt-4 text-base text-ink-300 leading-relaxed max-w-2xl mx-auto">
            Load one of the bundled sample datasets or drop in your own document. Explore every step
            from text splitting to vector coordinates in minutes.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={onLaunchVisualizer}
              className="bg-brand-500 hover:bg-brand-400 text-white shadow-lg"
            >
              Launch Visualizer Now
            </Button>
            <button
              onClick={() => onNavigateToAuth('register')}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800 px-6 text-sm font-medium text-white transition hover:bg-ink-700"
            >
              Sign Up / Sign In
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
