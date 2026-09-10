import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { StepLayout } from '../layout/StepLayout';
import { ChunkCard } from '../viz/ChunkCard';
import { STRATEGY_INFO } from '../../lib/chunk';
import type { Chunk, ChunkOptions, Transcript } from '../../types';

interface ChunkStepProps {
  transcript: Transcript;
  chunks: Chunk[];
  options: ChunkOptions;
  onOptionsChange: (options: ChunkOptions) => void;
  onContinue: () => void;
}

const STRATEGIES: ChunkOptions['strategy'][] = ['per-message', 'fixed-window', 'per-conversation'];

/**
 * How many chunk cards to actually put in the DOM.
 *
 * A large transcript can produce tens of thousands of chunks, and rendering a
 * card for each one freezes the tab every time a slider moves. Nobody reads
 * chunk 9,000 anyway: the list is here to show what chunking did, and a few
 * dozen show that just as well. The count above the list stays honest about
 * how many there really are.
 */
const MAX_VISIBLE_CHUNKS = 60;

export function ChunkStep({
  transcript,
  chunks,
  options,
  onOptionsChange,
  onContinue,
}: ChunkStepProps) {
  const averageLength =
    chunks.length === 0
      ? 0
      : Math.round(chunks.reduce((total, chunk) => total + chunk.text.length, 0) / chunks.length);

  const update = (patch: Partial<ChunkOptions>) => onOptionsChange({ ...options, ...patch });

  /** Changes whenever the chunking does, which restarts the reveal. */
  const revealKey = `${options.strategy}-${options.size}-${options.overlap}-${options.groupSize}`;

  return (
    <StepLayout
      explainers={
        <>
          <Explainer question="Why cut the chat up at all?">
            <p>
              Search works on whole pieces. If the entire transcript were one piece, every question
              would match it equally and you would learn nothing about where the answer is.
            </p>
            <p>
              Cutting it into smaller pieces means a search can point at the exact exchange that
              answers your question.
            </p>
          </Explainer>

          <Explainer question="So smaller is better?">
            <p>
              Only up to a point. A chunk holding one line like "yes, that works" has lost the
              question it was answering, so it matches nothing useful.
            </p>
            <p>
              Chunk size is a real trade-off, and picking it is one of the main decisions in
              building a RAG system. Try the strategies above and watch the chunks change.
            </p>
          </Explainer>

          <Explainer question="What is the tinted text?">
            <p>
              In fixed windows, that is the overlap: the tail of the previous chunk, repeated at
              the start of this one. Without it, a sentence sitting on a boundary gets split in
              half and neither chunk carries the whole thought.
            </p>
          </Explainer>
        </>
      }
    >
      {/* Controls beside their result, so changing a setting and seeing what it
          did do not need a scroll between them. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="How should we cut it up?"
            hint="Change the strategy and watch the chunks below rebuild."
            aside={<Button onClick={onContinue}>Turn these into vectors</Button>}
          />

          <div className="space-y-3 p-5">
            {STRATEGIES.map((strategy) => {
              const info = STRATEGY_INFO[strategy];
              const selected = options.strategy === strategy;

              return (
                <label
                  key={strategy}
                  className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200'
                      : 'border-ink-200 bg-white hover:border-ink-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="chunk-strategy"
                      checked={selected}
                      onChange={() => update({ strategy })}
                      className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900">{info.title}</span>
                      <span className="mt-0.5 block text-sm text-ink-600">{info.blurb}</span>
                      <span className="mt-1.5 block text-sm text-ink-500">{info.tradeoff}</span>
                    </div>
                  </div>

                  {selected && strategy === 'fixed-window' && (
                    <div className="mt-4 grid gap-4 border-t border-brand-200/60 pt-4 sm:grid-cols-2">
                      <Slider
                        label="Chunk size"
                        suffix="characters"
                        value={options.size}
                        min={100}
                        max={1200}
                        step={50}
                        onChange={(size) =>
                          // Overlap has to stay under the window or chunking never advances.
                          update({ size, overlap: Math.min(options.overlap, size - 50) })
                        }
                      />
                      <Slider
                        label="Overlap"
                        suffix="characters"
                        value={options.overlap}
                        min={0}
                        max={Math.max(0, options.size - 50)}
                        step={20}
                        onChange={(overlap) => update({ overlap })}
                      />
                    </div>
                  )}

                  {selected && strategy === 'per-conversation' && (
                    <div className="mt-4 border-t border-brand-200/60 pt-4">
                      <Slider
                        label="Messages per chunk"
                        suffix="messages"
                        value={options.groupSize}
                        min={2}
                        max={12}
                        step={1}
                        onChange={(groupSize) => update({ groupSize })}
                      />
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </Panel>

        <Panel tone="result">
          <PanelHeader
            tone="result"
            title={`${chunks.length} chunks`}
            hint={`${transcript.messages.length} messages, averaging ${averageLength} characters per chunk`}
          />

          <div className="max-h-[40rem] space-y-3 overflow-y-auto p-5">
            {chunks.slice(0, MAX_VISIBLE_CHUNKS).map((chunk, index) => (
              // Keyed by the settings as well as the id, so changing a slider
              // remounts the cards and the reveal plays again. That is what
              // makes an instant rebuild visible.
              <ChunkCard
                key={`${revealKey}-${chunk.id}`}
                chunk={chunk}
                revealIndex={index}
              />
            ))}

            {chunks.length > MAX_VISIBLE_CHUNKS && (
              <p className="pt-2 text-center text-sm text-ink-500">
                Showing the first {MAX_VISIBLE_CHUNKS} of {chunks.length} chunks. The rest are
                built the same way, and all {chunks.length} get embedded and searched.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </StepLayout>
  );
}

interface SliderProps {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function Slider({ label, suffix, value, min, max, step, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-700">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink-500">
          {value} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-brand-600"
      />
    </div>
  );
}
