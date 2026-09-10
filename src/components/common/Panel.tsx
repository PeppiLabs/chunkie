import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
}

/** The standard white surface everything sits on. */
export function Panel({ children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-2xl border border-ink-200 bg-white shadow-sm ${className}`}>
      {children}
    </section>
  );
}

interface PanelHeaderProps {
  title: string;
  /** Optional supporting line under the title. */
  hint?: string;
  /** Controls or counts aligned to the right. */
  aside?: ReactNode;
}

export function PanelHeader({ title, hint, aside }: PanelHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-500">{hint}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}
