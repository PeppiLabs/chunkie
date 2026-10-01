import { useState, useEffect, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Header, type AppView } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { StepNav } from './components/layout/StepNav';
import { ChunkStep } from './components/steps/ChunkStep';
import { EmbedStep } from './components/steps/EmbedStep';
import { SearchStep } from './components/steps/SearchStep';
import { UploadStep } from './components/steps/UploadStep';
import { LandingPage } from './components/pages/LandingPage';
import { AuthPage } from './components/pages/AuthPage';
import { useRagPipeline, STEPS, type Step } from './hooks/useRagPipeline';
import type { AuthMode } from './types/auth';

/**
 * The heading for each visualizer pipeline stage.
 */
const STEP_HEADINGS: Record<Step, { title: string; blurb: string }> = {
  upload: {
    title: 'See how RAG actually works',
    blurb:
      'When a chatbot answers questions about your documents, four things happen behind the scenes. Load a chat or document below and watch each one, with nothing hidden and no jargon assumed.',
  },
  chunk: {
    title: 'Cut the document into chunks',
    blurb:
      'A search can only point at a whole piece, so the transcript or document has to be divided first. How you divide it changes what the search can find.',
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

function ChunkieApp() {
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

  // View state: landing (initial page), pipeline (visualizer), or auth (login/register)
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedForStep = useRef(step);

  // Sync state with URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#login') {
        setCurrentView('auth');
        setAuthMode('login');
      } else if (hash === '#register' || hash === '#signup') {
        setCurrentView('auth');
        setAuthMode('register');
      } else if (hash === '#forgot-password' || hash === '#reset') {
        setCurrentView('auth');
        setAuthMode('forgot-password');
      } else if (hash === '#visualizer' || hash === '#pipeline' || hash === '#app') {
        setCurrentView('pipeline');
      } else if (hash === '#overview' || hash === '#landing' || hash === '#home') {
        setCurrentView('landing');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  /**
   * Moves focus to the new stage heading when pipeline step changes.
   */
  useEffect(() => {
    if (currentView !== 'pipeline') return;
    if (focusedForStep.current === step) return;
    focusedForStep.current = step;

    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, currentView]);

  const handleNavigate = (view: 'landing' | 'pipeline' | 'login' | 'register') => {
    if (view === 'login') {
      window.location.hash = '#login';
      setCurrentView('auth');
      setAuthMode('login');
    } else if (view === 'register') {
      window.location.hash = '#register';
      setCurrentView('auth');
      setAuthMode('register');
    } else if (view === 'pipeline') {
      window.location.hash = '#visualizer';
      setCurrentView('pipeline');
    } else {
      window.location.hash = '#overview';
      setCurrentView('landing');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLaunchVisualizer = () => {
    window.location.hash = '#visualizer';
    setCurrentView('pipeline');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const heading = STEP_HEADINGS[step];
  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        onReset={reset}
      />

      {/* VIEW 1: LANDING / INITIAL EXPLAINER PAGE */}
      {currentView === 'landing' && (
        <LandingPage
          onLaunchVisualizer={handleLaunchVisualizer}
          onNavigateToAuth={(mode) => handleNavigate(mode || 'login')}
        />
      )}

      {/* VIEW 2: AUTH PORTAL (LOGIN / REGISTER / FORGOT PASSWORD) */}
      {currentView === 'auth' && (
        <AuthPage
          initialMode={authMode}
          onSuccess={handleLaunchVisualizer}
          onBackToApp={() => handleNavigate('landing')}
        />
      )}

      {/* VIEW 3: PIPELINE VISUALIZER (LOAD -> CHUNK -> EMBED -> SEARCH) */}
      {currentView === 'pipeline' && (
        <>
          <StepNav current={step} onSelect={setStep} canVisit={canVisit} />

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
        </>
      )}

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ChunkieApp />
    </AuthProvider>
  );
}
