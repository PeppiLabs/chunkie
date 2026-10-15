import { Logo } from '../brand/Logo';
import { PEPPI_LABS_PROJECTS_URL, PEPPI_LABS_URL } from '../../lib/siteUrls';

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
