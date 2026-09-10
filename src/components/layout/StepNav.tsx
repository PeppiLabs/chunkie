import type { Step } from '../../hooks/useRagPipeline';

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

const ORDER: Step[] = ['upload', 'chunk', 'embed', 'search'];

/** The four stage tabs. A stage unlocks once the one before it has produced something. */
export function StepNav({ current, onSelect, canVisit }: StepNavProps) {
  return (
    <nav aria-label="Pipeline stages" className="border-b border-ink-200 bg-white">
      <ol className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ORDER.map((step, index) => {
          const enabled = canVisit(step);
          const active = current === step;

          return (
            <li key={step} className="shrink-0">
              <button
                onClick={() => enabled && onSelect(step)}
                // aria-disabled rather than disabled: a locked step is still
                // worth reading, because it tells the visitor what is coming.
                aria-disabled={!enabled}
                aria-current={active ? 'step' : undefined}
                // State is carried by the underline and the weight, not by
                // colour alone. Even an unreachable step stays readable, since
                // it tells the visitor what is coming next.
                className={`flex items-baseline gap-2 border-b-2 px-3 py-3.5 text-left transition-colors sm:px-4 ${
                  active
                    ? 'border-brand-600 font-medium text-ink-900'
                    : enabled
                      ? 'border-transparent text-ink-600 hover:text-ink-900'
                      : 'cursor-not-allowed border-transparent text-ink-500'
                }`}
              >
                <span className="font-mono text-[0.6875rem] tabular-nums opacity-50">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-[0.8125rem] font-medium tracking-[-0.005em]">
                  {LABELS[step].title}
                </span>
                <span className="hidden text-[0.75rem] text-ink-500 md:inline">
                  {LABELS[step].caption}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
