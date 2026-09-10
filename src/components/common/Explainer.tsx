import type { ReactNode } from 'react';

interface ExplainerProps {
  /** Short question a first-time reader would actually ask. */
  question: string;
  children: ReactNode;
}

/**
 * The plain-language answer that sits beside each step.
 *
 * The whole point of this project is that someone who has never heard the word
 * embedding can follow along, so every step carries one of these.
 */
export function Explainer({ question, children }: ExplainerProps) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 px-5 py-4">
      <h3 className="text-sm font-semibold text-brand-800">{question}</h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-ink-700">{children}</div>
    </div>
  );
}
