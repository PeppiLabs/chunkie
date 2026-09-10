import { useState } from 'react';
import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { VectorMap } from '../viz/VectorMap';
import { VectorStrip } from '../viz/VectorStrip';
import { MODEL_ID, VECTOR_DIMS } from '../../lib/embedder';
import type { Chunk, EmbedProgress, EmbeddedChunk } from '../../types';

interface EmbedStepProps {
  chunks: Chunk[];
  embedded: EmbeddedChunk[] | null;
  /** True only while a run the visitor started is in flight. */
  embedding: boolean;
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
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel className="p-8 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">
            Turn {chunks.length} chunks into numbers
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
            A small language model reads each chunk and produces {VECTOR_DIMS} numbers describing
            what it means. The model runs inside this tab, so the first run downloads it once.
          </p>

          {/* The label stays fixed while running. Mirroring the progress text
              here renamed the control on every batch, and a control that keeps
              being renamed keeps being re-announced. Progress lives in the bar
              below, which is where a screen reader reads it once. */}
          <Button size="lg" className="mt-6" onClick={onRun} disabled={embedding}>
            {embedding ? 'Working' : 'Generate the vectors'}
          </Button>

          {warming && (
            <p className="mt-3 text-xs text-ink-500">{progress.label}</p>
          )}

          {embedding && (
            <div className="mx-auto mt-6 max-w-md">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.ratio * 100)}
                aria-valuetext={progress.label}
                className="h-2 overflow-hidden rounded-full bg-ink-100"
              >
                <div
                  className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-500">{progress.label}</p>
            </div>
          )}

          <p className="mt-6 text-xs text-ink-500">
            Model: {MODEL_ID}. Around 23 MB, cached by your browser after the first visit.
          </p>
        </Panel>

        <aside className="space-y-4">
          <Explainer question="What is an embedding?">
            <p>
              An embedding is a list of numbers that stands for a piece of text. Text with a
              similar meaning gets a similar list, even when the words are completely different.
            </p>
            <p>
              That is the trick that makes RAG work. "My parcel never arrived" and "the delivery is
              late" share almost no words, but their numbers land close together.
            </p>
          </Explainer>

          <Explainer question="Why does it need to download something?">
            <p>
              The model doing the reading is a real neural network, and it runs here in your
              browser rather than on a server. It arrives once and your browser keeps it, so
              coming back is instant.
            </p>
          </Explainer>
        </aside>
      </div>
    );
  }

  const current = embedded.find((chunk) => chunk.id === inspectedId) ?? embedded[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
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

        <Panel>
          <PanelHeader
            title="Look inside a vector"
            hint={`${VECTOR_DIMS} numbers per chunk, drawn as one cell each`}
            aside={
              <select
                value={current.id}
                onChange={(event) => setInspectedId(event.target.value)}
                aria-label="Choose a chunk to inspect"
                className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-800"
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
            <p className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink-800">
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
                    className="rounded-md border border-ink-200 bg-white px-2 py-1 tabular-nums text-ink-700"
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

      <aside className="space-y-4">
        <Explainer question="What am I looking at?">
          <p>
            Every chunk is now {VECTOR_DIMS} numbers. Nobody can picture {VECTOR_DIMS} dimensions,
            so the map above flattens them to two: the two directions along which your chunks
            differ most.
          </p>
          <p>
            Distance on that map is real. Dots near each other are chunks the model considers
            close in meaning.
          </p>
        </Explainer>

        <Explainer question="Do the numbers mean anything on their own?">
          <p>
            Not individually. No single one of them is "politeness" or "about food". Meaning lives
            in the pattern across all {VECTOR_DIMS} of them, which is why the strip is easier to
            read than the numbers.
          </p>
        </Explainer>

        <Explainer question="This is the database part">
          <p>
            In a production system these vectors go into a vector database, so millions of them can
            be searched quickly. Here there are only {embedded.length}, so they live in your
            browser's memory and we compare against all of them.
          </p>
        </Explainer>
      </aside>
    </div>
  );
}
