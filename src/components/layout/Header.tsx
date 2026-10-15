import { useState } from 'react';
import { Logo } from '../brand/Logo';
import { Button } from '../common/Button';
import { PEPPI_LABS_URL } from '../../lib/siteUrls';

export type AppView = 'landing' | 'pipeline';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onReset?: () => void;
}

const REPO_URL = 'https://github.com/PeppiLabs/chunkie';

export function Header({ currentView, onNavigate, onReset }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-6">
          {/* The Peppi Labs logo goes to peppilabs.net; "What is Chunkie?" is the way home. */}
          <a
            href={PEPPI_LABS_URL}
            className="flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Peppi Labs home page"
          >
            <Logo size={28} />
          </a>

          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onNavigate('landing')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                currentView === 'landing'
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              What is Chunkie?
            </button>

            <button
              onClick={() => onNavigate('pipeline')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                currentView === 'pipeline'
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              }`}
            >
              Visualizer
            </button>

            <a
              href="/concepts.html"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
            >
              Guide
            </a>

            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
            >
              Source
            </a>
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Start over button, only on visualizer */}
          {currentView === 'pipeline' && onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="hidden sm:inline-flex text-xs"
            >
              Start over
            </Button>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-ink-600 hover:text-ink-900 rounded-lg hover:bg-ink-100"
            aria-label="Toggle navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-ink-200 bg-white px-4 py-3 space-y-1">
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onNavigate('landing');
            }}
            className={`block w-full text-left rounded-lg px-3 py-2 text-sm font-medium ${
              currentView === 'landing' ? 'bg-brand-50 text-brand-700' : 'text-ink-700'
            }`}
          >
            What is Chunkie?
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onNavigate('pipeline');
            }}
            className={`block w-full text-left rounded-lg px-3 py-2 text-sm font-medium ${
              currentView === 'pipeline' ? 'bg-brand-50 text-brand-700' : 'text-ink-700'
            }`}
          >
            Visualizer
          </button>
          <a
            href="/concepts.html"
            className="block w-full rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Guide
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="block w-full rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Source on GitHub
          </a>
        </div>
      )}
    </header>
  );
}
