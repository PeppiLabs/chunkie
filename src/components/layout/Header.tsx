import { Logo } from '../brand/Logo';
import { Button } from '../common/Button';

interface HeaderProps {
  /** Clears everything and returns to the first step. */
  onReset: () => void;
}

const REPO_URL = 'https://github.com/PeppiLabs/chunkie';

export function Header({ onReset }: HeaderProps) {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3.5 sm:px-6">
        <Logo />

        <span className="hidden text-sm text-ink-500 sm:inline">Chunkie</span>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Start over
          </Button>
          <a
            href="/concepts.html"
            className="rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Guide
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg px-3 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Source
          </a>
        </div>
      </div>
    </header>
  );
}
