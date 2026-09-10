import type { ReactNode } from 'react';

interface ExplainerProps {
  /** Short question a first-time reader would actually ask. */
  question: string;
  children: ReactNode;
}

/**
 * The plain-language answer that sits under each step.
 *
 * The whole point of this project is that someone who has never heard the word
 * embedding can follow along, so every step carries a row of these.
 */
export function Explainer({ question, children }: ExplainerProps) {
  return (
    <div className="h-full rounded-2xl border border-ink-200 bg-white px-5 py-5">
      <h3 className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-ink-900">
        {question}
      </h3>
      <div className="mt-2.5 space-y-2.5 text-[0.8125rem] leading-[1.65] text-ink-600">
        {children}
      </div>
    </div>
  );
}
