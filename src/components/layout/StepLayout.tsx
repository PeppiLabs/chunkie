import type { ReactNode } from 'react';

interface StepLayoutProps {
  /** The working area of the step. */
  children: ReactNode;
  /** The plain-language explainers, shown in a row underneath. */
  explainers: ReactNode;
}

/**
 * The shared shape of every step: work on top, explanation underneath.
 *
 * The explainers used to sit in a right hand column, which pushed the actual
 * panels into a narrow strip and meant reading them was a separate scroll from
 * using them. Along the bottom they stay out of the way of the work, and the
 * divider makes clear they are commentary rather than another control.
 */
export function StepLayout({ children, explainers }: StepLayoutProps) {
  return (
    <div className="space-y-8">
      {children}

      <section aria-label="How this step works" className="border-t border-ink-200 pt-7">
        <div className="grid items-stretch gap-4 md:grid-cols-3">{explainers}</div>
      </section>
    </div>
  );
}
