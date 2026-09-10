import { useState } from 'react';
import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { StepLayout } from '../layout/StepLayout';
import { ChunkCard } from '../viz/ChunkCard';
import { ScoreBar } from '../viz/ScoreBar';
import { VectorMap } from '../viz/VectorMap';
import { VectorStrip } from '../viz/VectorStrip';
import { questionsFor } from '../../lib/samples';
import type { EmbeddedChunk, SearchHit } from '../../types';

interface SearchStepProps {
  embedded: EmbeddedChunk[];
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  hits: SearchHit[] | null;
  queryVector: Float32Array | null;
  queryPoint: { x: number; y: number } | null;
  /** Name of the loaded transcript, used to offer relevant example questions. */
  sourceName: string;
}

export function SearchStep({
  embedded,
  query,
  onQueryChange,
  onSearch,
  hits,
  queryVector,
  queryPoint,
  sourceName,
}: SearchStepProps) {
  const [expanded, setExpanded] = useState(false);
  const suggestions = questionsFor(sourceName);

  /**
   * Every keystroke runs a real search.
   *
   * Embedding one short query takes a couple of milliseconds and scoring every
   * chunk takes under one, so there is no reason to make anyone press a
   * button and no reason to debounce. Watching the ranking rearrange as you
   * type is the clearest demonstration of what the model is doing.
   */
  const type = (value: string) => {
    onQueryChange(value);
    onSearch(value);
  };

  return (
    <StepLayout
      explainers={
        <>
          <Explainer question="How does it decide what matches?">
            <p>
              Your question becomes {embedded[0]?.vector.length ?? 384} numbers, exactly like the
              chunks did. Then every chunk gets a score for how closely its numbers point in the
              same direction as your question's.
            </p>
            <p>
              That score is called cosine similarity. A 1 means identical direction, a 0 means
              unrelated. The highest scoring few are what gets retrieved.
            </p>
          </Explainer>

          <Explainer question="Why not just search for words?">
            <p>
              Because people do not ask questions using the words in the document. Ask "how long
              before I am reimbursed" and the best passage says "we process the refund within two
              days of the parcel reaching our warehouse". The two share no words at all, yet it is
              plainly the right answer.
            </p>
          </Explainer>

          <Explainer question="Where does it fall down?">
            <p>
              Try asking about something the chat never covers. You will still get five results,
              because there is always a nearest chunk. Look at the scores: low ones across the
              board mean nothing in the document really answers you.
            </p>
            <p>
              Real systems set a minimum score for exactly this reason, so a chatbot says it does
              not know rather than confidently using an unrelated passage.
            </p>
          </Explainer>
        </>
      }
    >
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Ask the transcript something"
            hint={`Every character you type is embedded and scored against all ${embedded.length} chunks. There is no search button because there does not need to be.`}
          />

          <div className="space-y-4 p-5">
            <div className="relative">
              <input
                type="search"
                value={query}
                onChange={(event) => type(event.target.value)}
                placeholder="Start typing. It searches as you go."
                aria-label="Your question"
                autoFocus
                className="h-12 w-full rounded-xl border border-ink-200 bg-white pr-28 pl-4 text-base text-ink-900 placeholder:text-ink-500 focus:border-brand-400"
              />

              {query.trim() && (
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-ink-500">
                  {hits ? `${hits.length} of ${embedded.length}` : 'thinking'}
                </span>
              )}
            </div>

            {/* The query vector, right where it is being typed, so the numbers
                visibly change with the words rather than sitting in a panel of
                their own further down the page. */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium text-ink-700">
                  Your question, as {embedded[0]?.vector.length ?? 384} numbers
                </span>
                <span className="text-xs text-ink-500">
                  {queryVector ? 'updates with every character' : 'appears as you type'}
                </span>
              </div>

              {queryVector ? (
                <VectorStrip vector={queryVector} height={28} />
              ) : (
                <div className="h-7 rounded-lg border border-dashed border-ink-200" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-500">Try:</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => type(suggestion)}
                  className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {hits && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Panel tone="result">
              <PanelHeader
                tone="result"
                title="What came back"
                hint="Ranked by cosine similarity, the measure of how closely two vectors point the same way."
              />

              <div className="space-y-3 p-5">
                {hits.map((hit) => (
                  <ChunkCard
                    key={hit.chunk.id}
                    chunk={hit.chunk}
                    rank={hit.rank}
                    aside={<ScoreBar score={hit.score} emphasis={hit.rank === 1} />}
                  />
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Where your question landed"
                hint="The orange marker is your question, on the same map as before."
              />
              <div className="p-5">
                <VectorMap chunks={embedded} hits={hits} queryPoint={queryPoint} />
              </div>
            </Panel>
          </div>
        )}

        {hits && hits.length > 0 && (
          <Panel>
            <PanelHeader
              title="The part that says generation"
              hint="This is what a chatbot would be handed before it writes an answer."
              aside={
                <Button variant="secondary" size="sm" onClick={() => setExpanded(!expanded)}>
                  {expanded ? 'Collapse' : 'Expand'}
                </Button>
              }
            />

            <div className="p-5">
              <pre
                className={`overflow-x-auto rounded-xl border border-ink-200 bg-ink-900 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-100 ${
                  expanded ? '' : 'max-h-64 overflow-y-hidden'
                }`}
              >
{`Answer the question using only the context below.

CONTEXT:
${hits.map((hit) => `[${hit.rank}] ${hit.chunk.text}`).join('\n\n')}

QUESTION: ${query}`}
              </pre>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                No model is called here, because the point of this site is the retrieval half. In a
                real product this text goes to a language model, which writes an answer grounded in
                those passages instead of guessing.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </StepLayout>
  );
}
