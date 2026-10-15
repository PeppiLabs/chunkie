import { Logo } from '../brand/Logo';
import {
  PEPPI_LABS_LINKEDIN_URL,
  PEPPI_LABS_PROJECTS_URL,
  PEPPI_LABS_URL,
  PEPPI_LABS_X_URL,
} from '../../lib/siteUrls';

const REPO_URL = 'https://github.com/PeppiLabs/chunkie';
const YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <a href={PEPPI_LABS_URL} aria-label="Peppi Labs home page" className="rounded-lg">
            <Logo size={22} />
          </a>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
            <a href="/concepts.html" className="font-medium text-brand-700 hover:text-brand-800">
              How RAG works, explained
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink-900">
              GitHub
            </a>
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-ink-900"
            >
              MIT License
            </a>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-ink-900"
            >
              Report an issue
            </a>
            <a href={PEPPI_LABS_PROJECTS_URL} className="hover:text-ink-900">
              More from Peppi Labs
            </a>
            <span className="flex items-center gap-3">
              <a
                href={PEPPI_LABS_X_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Peppi Labs on X"
                title="Peppi Labs on X"
                className="hover:text-ink-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                </svg>
              </a>
              <a
                href={PEPPI_LABS_LINKEDIN_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Peppi Labs on LinkedIn"
                title="Peppi Labs on LinkedIn"
                className="hover:text-ink-900"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </span>
          </nav>
        </div>

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-500">
          Everything on this page runs in your browser. Files you load are never uploaded, and no
          account is needed. Built as an open source teaching tool by{' '}
          <a href={PEPPI_LABS_URL} className="font-medium text-brand-700 hover:text-brand-800">
            Peppi Labs
          </a>
          .
        </p>

        <p className="mt-3 text-xs text-ink-500">
          Copyright {YEAR} Peppi Labs. Released under the MIT License.
        </p>
      </div>
    </footer>
  );
}
