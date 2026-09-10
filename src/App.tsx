import { useEffect, useRef } from 'react';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { StepNav } from './components/layout/StepNav';
import { ChunkStep } from './components/steps/ChunkStep';
import { EmbedStep } from './components/steps/EmbedStep';
import { SearchStep } from './components/steps/SearchStep';
import { UploadStep } from './components/steps/UploadStep';
import { useRagPipeline, STEPS, type Step } from './hooks/useRagPipeline';

/**
 * The heading for each stage.
 *
 * Every stage needs its own h1. Without one, three of the four screens had no
 * top level heading at all, and the explainer h3s in the sidebar read as
 * children of whichever panel heading happened to come before them.
 */
const STEP_HEADINGS: Record<Step, { title: string; blurb: string }> = {
  upload: {
    title: 'See how RAG actually works',
    blurb:
      'When a chatbot answers questions about your documents, four things happen behind the scenes. Load a chat below and watch each one, with nothing hidden and no jargon assumed.',
  },
  chunk: {
    title: 'Cut the chat into chunks',
    blurb:
      'A search can only point at a whole piece, so the transcript has to be divided first. How you divide it changes what the search can find.',
  },
  embed: {
    title: 'Turn the chunks into numbers',
    blurb:
      'A small language model reads each chunk and describes its meaning as a list of numbers. Similar meanings get similar numbers.',
  },
  search: {
    title: 'Search by meaning',
    blurb:
      'Your question becomes numbers the same way, then gets compared against every chunk. Matching happens on meaning, not on words.',
  },
};

/**
 * RAG Visualizer.
 *
 * Four stages, in order: load a chat, cut it into chunks, turn the chunks into
 * vectors, then search those vectors by meaning. Every stage runs in the
 * browser and carries a plain-language explanation of what just happened.
 */
export default function App() {
  const pipeline = useRagPipeline();
  const {
    step,
    setStep,
    canVisit,
    transcript,
    chunks,
    chunkOptions,
    setChunkOptions,
    embedded,
    embedding,
    streamed,
    progress,
    error,
    setError,
    query,
    setQuery,
    queryVector,
    queryPoint,
    hits,
    loadFile,
    loadSample,
    runEmbedding,
    runSearch,
    reset,
  } = pipeline;

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Tracks the step the heading was last moved for. Comparing against the
  // current step is safe under StrictMode, which invokes effects twice: a
  // simple "first render" flag gets flipped by the first pass and then focuses
  // on the second, putting a ring on the heading before anyone has clicked.
  const focusedForStep = useRef(step);

  /**
   * Moves focus to the new stage heading and returns to the top of the page.
   *
   * Clicking a button that swaps the whole screen used to drop focus onto the
   * body, so a keyboard user restarted from the top of the document with
   * nothing announcing that anything had changed.
   */
  useEffect(() => {
    if (focusedForStep.current === step) return;
    focusedForStep.current = step;

    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const heading = STEP_HEADINGS[step];
  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <div className="flex min-h-screen flex-col">
      <Header onReset={reset} />
      <StepNav current={step} onSelect={setStep} canVisit={canVisit} />

      {/* Announces stage changes and search results, which are otherwise
          silent for anyone not watching the screen. */}
      <p aria-live="polite" className="sr-only">
        {hits
          ? `${hits.length} results found for ${query}`
          : `Step ${stepNumber} of ${STEPS.length}, ${heading.title}`}
      </p>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className={step === 'upload' ? 'mb-9 max-w-2xl' : 'mb-7 max-w-2xl'}>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={`font-display text-ink-900 outline-none focus-visible:outline-none ${
              step === 'upload' ? 'text-[2.75rem] sm:text-6xl' : 'text-4xl sm:text-[2.75rem]'
            }`}
          >
            {heading.title}
          </h1>
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink-600">
            {heading.blurb}
          </p>
          {step === 'upload' && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-600">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              Runs entirely in your browser. No sign up, no upload, no server.
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss this message"
              className="shrink-0 rounded px-2 text-sm text-red-600 hover:text-red-900"
            >
              Close
            </button>
          </div>
        )}

        {step === 'upload' && (
          <UploadStep
            transcript={transcript}
            onFile={loadFile}
            onSample={loadSample}
            onContinue={() => setStep('chunk')}
          />
        )}

        {step === 'chunk' && transcript && (
          <ChunkStep
            transcript={transcript}
            chunks={chunks}
            options={chunkOptions}
            onOptionsChange={setChunkOptions}
            onContinue={() => setStep('embed')}
          />
        )}

        {step === 'embed' && (
          <EmbedStep
            chunks={chunks}
            embedded={embedded}
            embedding={embedding}
            streamed={streamed}
            progress={progress}
            onRun={runEmbedding}
            onContinue={() => setStep('search')}
          />
        )}

        {step === 'search' && embedded && transcript && (
          <SearchStep
            embedded={embedded}
            query={query}
            onQueryChange={setQuery}
            onSearch={runSearch}
            hits={hits}
            queryVector={queryVector}
            queryPoint={queryPoint}
            sourceName={transcript.sourceName}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
