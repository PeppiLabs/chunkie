import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  /**
   * 'plain' is the default white surface for controls.
   * 'result' tints the panel, marking it as something produced by the panel
   * beside it rather than another thing to fill in.
   */
  tone?: 'plain' | 'result';
  className?: string;
}

const TONES: Record<'plain' | 'result', string> = {
  plain: 'border-ink-200 bg-white',
  result: 'border-brand-200 bg-brand-50/50',
};

/** The standard surface everything sits on. */
export function Panel({ children, tone = 'plain', className = '' }: PanelProps) {
  return (
    <section className={`rounded-2xl border shadow-sm ${TONES[tone]} ${className}`}>
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
  /** Match the panel it sits in, so the rule does not clash with the tint. */
  tone?: 'plain' | 'result';
}

export function PanelHeader({ title, hint, aside, tone = 'plain' }: PanelHeaderProps) {
  return (
    <header
      className={`flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 ${
        tone === 'result' ? 'border-brand-200/70' : 'border-ink-100'
      }`}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-500">{hint}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}
