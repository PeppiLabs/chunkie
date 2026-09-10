import { useState } from 'react';
import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { StepLayout } from '../layout/StepLayout';
import { VectorMap } from '../viz/VectorMap';
import { VectorStrip } from '../viz/VectorStrip';
import { MODEL_ID, VECTOR_DIMS } from '../../lib/embedder';
import type { Chunk, EmbedProgress, EmbeddedChunk } from '../../types';

interface EmbedStepProps {
  chunks: Chunk[];
  embedded: EmbeddedChunk[] | null;
  /** True only while a run the visitor started is in flight. */
  embedding: boolean;
  /** Vectors that have arrived so far in the current run. */
  streamed: Float32Array[];
  progress: EmbedProgress;
  onRun: () => void;
  onContinue: () => void;
}

/** How many of the 384 numbers to print, before the reader gets the idea. */
const PREVIEW_VALUES = 12;

export function EmbedStep({
  chunks,
  embedded,
  embedding,
  streamed,
  progress,
  onRun,
  onContinue,
}: EmbedStepProps) {
  // Tracked by id rather than position. Re-chunking replaces the whole list,
  // and an index into the old one would point at a different chunk than the
  // dropdown label claims. An id that no longer exists falls back to the first.
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  // The model may still be downloading in the background. That is fine to click
  // through: the request queues behind the download inside the worker.
  const warming = !embedding && progress.phase === 'loading-model';

  if (!embedded) {
    return (
      <StepLayout
        explainers={
          <>
            <Explainer question="What is an embedding?">
              <p>
                An embedding is a list of numbers that stands for a piece of text. Text with a
                similar meaning gets a similar list, even when the words are completely different.
              </p>
              <p>
                That is the trick that makes RAG work. "My parcel never arrived" and "the delivery
                is late" share almost no words, but their numbers land close together.
              </p>
            </Explainer>

            <Explainer question="Why does it need to download something?">
              <p>
                The model doing the reading is a real neural network, and it runs here in your
                browser rather than on a server. It arrives once and your browser keeps it, so
                coming back is instant.
              </p>
            </Explainer>

            <Explainer question="Is anything sent anywhere?">
              <p>
                Only the model comes down, and only the first time. Your transcript is never
                uploaded: it is read, chunked and embedded inside this tab.
              </p>
            </Explainer>
          </>
        }
      >
        <Panel className="p-8 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">
            Turn {chunks.length} chunks into numbers
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
            A small language model reads each chunk and produces {VECTOR_DIMS} numbers describing
            what it means. The model runs inside this tab, so the first run downloads it once.
          </p>

          <Button size="lg" className="mt-6" onClick={onRun} disabled={embedding}>
            {embedding ? 'Working' : 'Generate the vectors'}
          </Button>

          {warming && <p className="mt-3 text-xs text-ink-500">{progress.label}</p>}

          {embedding && (
            <div className="mx-auto mt-7 max-w-2xl">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.ratio * 100)}
                aria-valuetext={progress.label}
                className="h-2 overflow-hidden rounded-full bg-ink-100"
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>

              <div className="mt-2 flex items-baseline justify-between text-xs text-ink-500">
                <span>{progress.label}</span>
                <span className="font-mono tabular-nums">
                  {streamed.length} / {chunks.length}
                </span>
              </div>

              {/* Real vectors, drawn the moment each batch comes back from the
                  worker. This is the work happening, not an animation of it. */}
              {streamed.length > 0 && (
                <div className="mt-5 space-y-2 text-left">
                  <p className="text-xs font-medium text-ink-700">
                    Vectors as they come back
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {streamed.slice(-8).map((vector, index) => (
                      <VectorStrip key={streamed.length - 8 + index} vector={vector} height={16} />
                    ))}
                  </div>
                  <p className="wrap-anywhere line-clamp-2 pt-1 text-xs text-ink-500">
                    {chunks[Math.min(streamed.length, chunks.length - 1)]?.text}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="mt-6 text-xs text-ink-500">
            Model: {MODEL_ID}. Around 23 MB, cached by your browser after the first visit.
          </p>
        </Panel>
      </StepLayout>
    );
  }

  const current = embedded.find((chunk) => chunk.id === inspectedId) ?? embedded[0];

  return (
    <StepLayout
      explainers={
        <>
          <Explainer question="What am I looking at?">
            <p>
              Every chunk is now {VECTOR_DIMS} numbers. Nobody can picture {VECTOR_DIMS}{' '}
              dimensions, so the map flattens them to two: the two directions along which your
              chunks differ most.
            </p>
            <p>
              Distance on that map is real. Dots near each other are chunks the model considers
              close in meaning.
            </p>
          </Explainer>

          <Explainer question="Do the numbers mean anything on their own?">
            <p>
              Not individually. No single one of them is "politeness" or "about food". Meaning
              lives in the pattern across all {VECTOR_DIMS} of them, which is why the strip is
              easier to read than the numbers.
            </p>
          </Explainer>

          <Explainer question="This is the database part">
            <p>
              In a production system these vectors go into a vector database, so millions of them
              can be searched quickly. Here there are only {embedded.length}, so they live in your
              browser's memory and we compare against all of them.
            </p>
          </Explainer>
        </>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="The map of meaning"
            hint="Each dot is one chunk. Chunks about the same thing sit near each other."
            aside={<Button onClick={onContinue}>Search it</Button>}
          />
          <div className="p-5">
            <VectorMap chunks={embedded} />
          </div>
        </Panel>

        <Panel tone="result">
          <PanelHeader
            tone="result"
            title="Look inside a vector"
            hint={`${VECTOR_DIMS} numbers per chunk, drawn as one cell each`}
            aside={
              <select
                value={current.id}
                onChange={(event) => setInspectedId(event.target.value)}
                aria-label="Choose a chunk to inspect"
                className="h-9 rounded-lg border border-brand-200 bg-white px-3 text-sm text-ink-800"
              >
                {embedded.map((chunk) => (
                  <option key={chunk.id} value={chunk.id}>
                    Chunk {chunk.index + 1}
                  </option>
                ))}
              </select>
            }
          />

          <div className="space-y-4 p-5">
            <p className="wrap-anywhere rounded-xl border border-brand-200 bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink-800">
              {current.text}
            </p>

            <div>
              <VectorStrip vector={current.vector} height={40} />
              <p className="mt-2 text-xs text-ink-500">
                Blue cells are positive numbers, orange are negative, and stronger colour means a
                larger value. This pattern is the chunk's fingerprint.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-700">
                The first {PREVIEW_VALUES} of {VECTOR_DIMS} numbers
              </p>
              <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                {Array.from(current.vector.slice(0, PREVIEW_VALUES)).map((value, index) => (
                  <span
                    key={index}
                    className="rounded-md border border-brand-200 bg-white px-2 py-1 tabular-nums text-ink-700"
                  >
                    {value >= 0 ? '+' : ''}
                    {value.toFixed(3)}
                  </span>
                ))}
                <span className="px-2 py-1 text-ink-500">and {VECTOR_DIMS - PREVIEW_VALUES} more</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </StepLayout>
  );
}
