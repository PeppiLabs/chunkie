import { useEffect, useState } from 'react';
import type { Step } from '../../hooks/useRagPipeline';
import { LockIcon } from '../common/LockIcon';

interface StepNavProps {
  current: Step;
  onSelect: (step: Step) => void;
  canVisit: (step: Step) => boolean;
}

const LABELS: Record<Step, { title: string; caption: string }> = {
  upload: { title: 'Load', caption: 'Bring in a chat' },
  chunk: { title: 'Chunk', caption: 'Cut it into pieces' },
  embed: { title: 'Embed', caption: 'Turn pieces into numbers' },
  search: { title: 'Search', caption: 'Find by meaning' },
};

/**
 * What opens each locked stage, kept in step with canVisit in useRagPipeline.
 *
 * The short form replaces the caption on the tab itself. The sentence appears
 * when a locked tab is clicked, because a click that does nothing reads as a
 * broken link rather than a step that is not ready yet. Load is always open.
 */
const UNLOCK: Record<Exclude<Step, 'upload'>, { short: string; sentence: string }> = {
  chunk: { short: 'Pick a chat first', sentence: 'Chunk opens once you pick a chat in step 1.' },
  embed: { short: 'Pick a chat first', sentence: 'Embed opens once you pick a chat in step 1.' },
  search: {
    short: 'Generate the vectors first',
    sentence: 'Search opens once you generate the vectors in step 3.',
  },
};

/** How long the explanation stays up after clicking a locked tab. */
const NOTICE_MS = 4000;

const ORDER: Step[] = ['upload', 'chunk', 'embed', 'search'];

/** The four stage tabs. A stage unlocks once the one before it has produced something. */
export function StepNav({ current, onSelect, canVisit }: StepNavProps) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <nav aria-label="Pipeline stages" className="relative border-b border-ink-200 bg-white">
      <ol className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ORDER.map((step, index) => {
          const enabled = canVisit(step);
          const active = current === step;
          const unlock = step === 'upload' ? null : UNLOCK[step];
          const locked = !enabled && unlock !== null;

          return (
            <li key={step} className="shrink-0">
              <button
                onClick={() => {
                  if (enabled) {
                    setNotice(null);
                    onSelect(step);
                  } else if (unlock) {
                    setNotice(unlock.sentence);
                  }
                }}
                // aria-disabled rather than disabled: a locked step is still
                // worth reading, because it tells the visitor what is coming.
                aria-disabled={!enabled}
                aria-current={active ? 'step' : undefined}
                // State is carried by the underline, the weight and the lock,
                // not by colour alone. Even an unreachable step stays readable,
                // since it tells the visitor what is coming next.
                className={`flex items-baseline gap-2 border-b-2 px-3 py-3.5 text-left transition-colors sm:px-4 ${
                  active
                    ? 'border-brand-600 font-medium text-ink-900'
                    : enabled
                      ? 'cursor-pointer border-transparent text-ink-600 hover:text-ink-900'
                      : 'cursor-not-allowed border-transparent text-ink-500'
                }`}
              >
                <span className="font-mono text-[0.6875rem] tabular-nums opacity-50">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-[0.8125rem] font-medium tracking-[-0.005em]">
                  {LABELS[step].title}
                </span>
                {locked && (
                  <span className="self-center text-ink-400">
                    <LockIcon />
                  </span>
                )}
                <span className="hidden text-[0.75rem] text-ink-500 md:inline">
                  {locked ? unlock.short : LABELS[step].caption}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Always mounted so screen readers announce the message when it appears.
          It sits over the page rather than in the flow, so nothing jumps. */}
      <div role="status" className="absolute inset-x-0 top-full z-10">
        {notice && (
          <p className="border-b border-brand-100 bg-brand-50">
            <span className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-[0.8125rem] text-ink-700 sm:px-6">
              <LockIcon size={13} />
              {notice}
            </span>
          </p>
        )}
      </div>
    </nav>
  );
}
