import { useState, useRef, useEffect } from 'react';
import { Logo } from '../brand/Logo';
import { Button } from '../common/Button';
import { useAuth } from '../../context/AuthContext';

export type AppView = 'landing' | 'pipeline' | 'auth';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: 'landing' | 'pipeline' | 'login' | 'register') => void;
  onReset?: () => void;
}

const REPO_URL = 'https://github.com/PeppiLabs/chunkie';

export function Header({ currentView, onNavigate, onReset }: HeaderProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2.5 rounded-lg focus:outline-none"
            aria-label="Chunkie home page"
          >
            <Logo size={28} />
          </button>

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

        {/* Right side controls & Auth */}
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

          {/* User state */}
          {isAuthenticated && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 py-1 pl-1 pr-2.5 text-xs text-ink-800 transition hover:border-ink-300 hover:bg-ink-100 focus:outline-none"
                aria-expanded={profileOpen}
                aria-label="User account menu"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[0.6875rem] font-bold text-white shadow-xs"
                  style={{ backgroundColor: user.avatarColor || '#0b5ed7' }}
                >
                  {getInitials(user.name)}
                </span>
                <span className="max-w-[120px] truncate font-medium">{user.name}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="text-ink-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Profile Dropdown */}
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-ink-200 bg-white p-2 shadow-xl ring-1 ring-black/5 z-50">
                  <div className="border-b border-ink-150 px-3 py-2">
                    <p className="text-xs font-semibold text-ink-900 truncate">{user.name}</p>
                    <p className="text-[0.6875rem] text-ink-500 truncate">{user.email}</p>
                    {user.isDemo && (
                      <span className="mt-1.5 inline-block rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[0.625rem] font-medium text-brand-700">
                        Demo Account
                      </span>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        onNavigate('pipeline');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-100 text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Open Visualizer
                    </button>

                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('login')}
                className="text-xs"
              >
                Sign In
              </Button>
              <Button
                size="sm"
                onClick={() => onNavigate('register')}
                className="text-xs"
              >
                Create Account
              </Button>
            </div>
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
