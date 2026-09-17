import { useState } from 'react';
import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { StepLayout } from '../layout/StepLayout';
import { ChunkCard } from '../viz/ChunkCard';
import { STRATEGY_CATALOG, STRATEGY_FAMILIES } from '../../lib/chunk';
import type { Chunk, ChunkFamily, ChunkOptions, ChunkStrategy, Transcript } from '../../types';

interface ChunkStepProps {
  transcript: Transcript;
  chunks: Chunk[];
  options: ChunkOptions;
  onOptionsChange: (options: ChunkOptions) => void;
  onContinue: () => void;
}

const MAX_VISIBLE_CHUNKS = 60;

const SYMBOL_CHOICES: { symbol: string; name: string }[] = [
  { symbol: '.', name: 'Full stop' },
  { symbol: '?', name: 'Question mark' },
  { symbol: '!', name: 'Exclamation mark' },
  { symbol: ',', name: 'Comma' },
  { symbol: ';', name: 'Semicolon' },
  { symbol: ':', name: 'Colon' },
];

const SECTION_SUGGESTIONS = ['References', 'Bibliography', 'Appendix', 'Contents', 'Acknowledgements'];

export function ChunkStep({
  transcript,
  chunks,
  options,
  onOptionsChange,
  onContinue,
}: ChunkStepProps) {
  const [selectedFamily, setSelectedFamily] = useState<ChunkFamily | 'all'>('all');
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

  const averageLength =
    chunks.length === 0
      ? 0
      : Math.round(chunks.reduce((total, chunk) => total + chunk.text.length, 0) / chunks.length);

  const update = (patch: Partial<ChunkOptions>) => onOptionsChange({ ...options, ...patch });

  const filteredStrategies =
    selectedFamily === 'all'
      ? STRATEGY_CATALOG
      : STRATEGY_CATALOG.filter((s) => s.family === selectedFamily);

  const isRecommended = (stratId: ChunkStrategy): boolean => {
    const docType = transcript.docType || 'chat';
    const item = STRATEGY_CATALOG.find((s) => s.id === stratId);
    return Boolean(item?.recommendedFor?.includes(docType));
  };

  /** Changes whenever the chunking does, which restarts the reveal. */
  const revealKey = `${options.strategy}-${options.size}-${options.overlap}-${options.groupSize}-${options.splitSymbols}-${options.piecesPerChunk}-${options.respectHeadings}-${options.respectParagraphs}-${options.splitLong}-${options.tocDepth}-${options.pagesPerChunk}-${options.rowsPerChunk}-${options.sensitivity}-${options.gapMinutes}-${options.contextHeadingPath}-${options.contextTitle}-${options.contextPrefix}-${options.excludeSections}-${options.excludePeople}-${options.minChunkSize}`;

  // Symbol selection helper logic
  const currentSymbols = options.splitSymbols ?? '.!?';
  const commonSymbols = SYMBOL_CHOICES.map((c) => c.symbol);
  const toggledSymbols = [...currentSymbols].filter((c) => commonSymbols.includes(c));
  const otherSymbols = [...currentSymbols].filter((c) => !commonSymbols.includes(c)).join('');

  const combineSymbols = (on: string[], typed: string) => {
    const combined = [...new Set([...on, ...typed].filter((c) => !/[\p{L}\p{N}\s]/u.test(c)))].join('');
    update({ splitSymbols: combined });
  };

  // Section & People suggestions
  const currentExcludedSections = (options.excludeSections || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const availableSectionSuggestions = SECTION_SUGGESTIONS.filter(
    (name) => !currentExcludedSections.includes(name.toLowerCase())
  );

  const currentExcludedPeople = (options.excludePeople || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const availableSpeakerSuggestions = transcript.speakers.filter(
    (name) => !currentExcludedPeople.includes(name.toLowerCase())
  );

  const addExcludedSection = (name: string) => {
    const current = options.excludeSections ? options.excludeSections.trim() : '';
    const updated = current ? `${current}, ${name}` : name;
    update({ excludeSections: updated });
  };

  const addExcludedPerson = (name: string) => {
    const current = options.excludePeople ? options.excludePeople.trim() : '';
    const updated = current ? `${current}, ${name}` : name;
    update({ excludePeople: updated });
  };

  return (
    <StepLayout
      explainers={
        <>
          <Explainer question="Why cut the file up at all?">
            <p>
              Search works on whole pieces. If the entire document were one piece, every question
              would match it equally and you would learn nothing about where the answer is.
            </p>
            <p>
              Cutting it into smaller pieces means search can point at the exact passage or exchange
              that answers your question.
            </p>
          </Explainer>

          <Explainer question="So smaller is always better?">
            <p>
              Only up to a point. A chunk holding just one fragmented phrase has lost the context
              it was discussing, so it matches nothing useful.
            </p>
            <p>
              Chunk size and structure are the core trade-offs in building any RAG system. Explore
              the strategies across families to see how chunks adapt in real time.
            </p>
          </Explainer>

          <Explainer question="What is the tinted text in fixed windows?">
            <p>
              In fixed windows with overlap, that is the repeated context: the tail of the previous
              chunk repeated at the start of the next one. Without it, a sentence on a boundary
              gets split in half and neither chunk carries the full thought.
            </p>
          </Explainer>
        </>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Left column: Strategies & Interactive Controls */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="How should we cut it up?"
              hint="Select a strategy and adjust settings to see chunks rebuild."
              aside={<Button onClick={onContinue}>Turn these into vectors</Button>}
            />

            {/* Family filter tabs */}
            <div className="border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedFamily('all')}
                  className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                    selectedFamily === 'all'
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-white text-ink-600 hover:bg-ink-100 hover:text-ink-900 border border-ink-200'
                  }`}
                >
                  All ({STRATEGY_CATALOG.length})
                </button>
                {STRATEGY_FAMILIES.map((family) => {
                  const count = STRATEGY_CATALOG.filter((s) => s.family === family.id).length;
                  const active = selectedFamily === family.id;
                  return (
                    <button
                      key={family.id}
                      type="button"
                      onClick={() => setSelectedFamily(family.id)}
                      className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                        active
                          ? 'bg-brand-600 text-white shadow-xs'
                          : 'bg-white text-ink-600 hover:bg-ink-100 hover:text-ink-900 border border-ink-200'
                      }`}
                    >
                      {family.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Strategy Options List */}
            <div className="max-h-[38rem] space-y-3 overflow-y-auto p-4 sm:p-5">
              {filteredStrategies.map((info) => {
                const strategy = info.id;
                const selected = options.strategy === strategy;
                const recommended = isRecommended(strategy);
                const isChatStrat = ['per-message', 'per-conversation', 'session', 'day-wise'].includes(strategy);

                return (
                  <div
                    key={strategy}
                    className={`rounded-xl border transition-all ${
                      selected
                        ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200 shadow-xs'
                        : 'border-ink-200 bg-white hover:border-ink-300'
                    }`}
                  >
                    <label className="block cursor-pointer p-3.5 sm:p-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="chunk-strategy"
                          checked={selected}
                          onChange={() => update({ strategy })}
                          className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-ink-900">{info.label}</span>
                            {recommended && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 border border-emerald-200">
                                Recommended
                              </span>
                            )}
                            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                              {isChatStrat ? 'Chat Structure' : STRATEGY_FAMILIES.find((f) => f.id === info.family)?.label}
                            </span>
                          </div>
                          <span className="mt-1 block text-xs text-ink-700 leading-relaxed">
                            {info.cuts}
                          </span>
                          <span className="mt-1 block text-[11px] text-ink-500 leading-snug">
                            {info.tradeoff}
                          </span>
                        </div>
                      </div>
                    </label>

                    {/* Active Strategy Dynamic Settings */}
                    {selected && (
                      <div className="border-t border-brand-200/70 bg-white/80 p-3.5 sm:p-4 rounded-b-xl">
                        {strategy === 'fixed-window' && (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Slider
                              label="Chunk size"
                              suffix="chars"
                              value={options.size}
                              min={100}
                              max={1200}
                              step={50}
                              onChange={(size) =>
                                update({ size, overlap: Math.min(options.overlap, size - 50) })
                              }
                            />
                            <Slider
                              label="Overlap"
                              suffix="chars"
                              value={options.overlap}
                              min={0}
                              max={Math.max(0, options.size - 50)}
                              step={20}
                              onChange={(overlap) => update({ overlap })}
                            />
                          </div>
                        )}

                        {strategy === 'recursive' && (
                          <div className="space-y-3">
                            <Slider
                              label="Target chunk size"
                              suffix="chars"
                              value={options.size}
                              min={100}
                              max={1200}
                              step={50}
                              onChange={(size) => update({ size })}
                            />
                            <label className="flex items-center gap-2 text-xs text-ink-700">
                              <input
                                type="checkbox"
                                checked={options.respectHeadings ?? true}
                                onChange={(e) => update({ respectHeadings: e.target.checked })}
                                className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                              />
                              <span>Never cross heading boundaries</span>
                            </label>
                          </div>
                        )}

                        {strategy === 'sentence' && (
                          <div className="space-y-3">
                            <Slider
                              label="Target chunk size"
                              suffix="chars"
                              value={options.size}
                              min={100}
                              max={1000}
                              step={50}
                              onChange={(size) => update({ size })}
                            />
                            <label className="flex items-center gap-2 text-xs text-ink-700">
                              <input
                                type="checkbox"
                                checked={options.respectParagraphs ?? false}
                                onChange={(e) => update({ respectParagraphs: e.target.checked })}
                                className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                              />
                              <span>Start a new chunk at each paragraph break</span>
                            </label>
                          </div>
                        )}

                        {strategy === 'symbol' && (
                          <div className="space-y-3">
                            <div>
                              <span className="block text-xs font-semibold text-ink-800 mb-1.5">
                                Symbols to split at
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5" role="group" aria-label="Symbols to split at">
                                {SYMBOL_CHOICES.map(({ symbol, name }) => {
                                  const on = toggledSymbols.includes(symbol);
                                  return (
                                    <button
                                      key={symbol}
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() =>
                                        combineSymbols(
                                          on ? toggledSymbols.filter((s) => s !== symbol) : [...toggledSymbols, symbol],
                                          otherSymbols
                                        )
                                      }
                                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                                        on
                                          ? 'border-brand-500 bg-brand-50/80 text-brand-800 ring-1 ring-brand-500 font-semibold shadow-xs'
                                          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50'
                                      }`}
                                    >
                                      <span className="font-mono text-base font-bold leading-none w-3 text-center shrink-0">
                                        {symbol}
                                      </span>
                                      <span className="text-xs leading-tight">{name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <span className="block text-xs font-medium text-ink-700">
                                  Other symbols
                                </span>
                                <input
                                  type="text"
                                  value={otherSymbols}
                                  placeholder="e.g. | / 。"
                                  onChange={(e) => combineSymbols(toggledSymbols, e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-mono text-ink-900 focus:border-brand-500 focus:outline-hidden"
                                />
                              </div>
                              <Slider
                                label="Pieces per chunk"
                                suffix="pieces"
                                value={options.piecesPerChunk ?? 2}
                                min={1}
                                max={10}
                                step={1}
                                onChange={(piecesPerChunk) => update({ piecesPerChunk })}
                              />
                            </div>

                            <p className="text-[11px] leading-snug text-ink-500">
                              Punctuation only splits when a space follows, so 5.6 and 1,000 stay whole. Other symbols split wherever they appear.
                            </p>
                          </div>
                        )}

                        {strategy === 'whole' && (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs text-ink-700">
                              <input
                                type="checkbox"
                                checked={options.splitLong ?? true}
                                onChange={(e) => update({ splitLong: e.target.checked })}
                                className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                              />
                              <span>Split if document exceeds embedding model window</span>
                            </label>
                            {options.splitLong && (
                              <Slider
                                label="Maximum chunk size"
                                suffix="chars"
                                value={options.size}
                                min={500}
                                max={2000}
                                step={100}
                                onChange={(size) => update({ size })}
                              />
                            )}
                          </div>
                        )}

                        {strategy === 'section' && (
                          <Slider
                            label="Max section chunk size"
                            suffix="chars"
                            value={options.size}
                            min={200}
                            max={1500}
                            step={50}
                            onChange={(size) => update({ size })}
                          />
                        )}

                        {strategy === 'paragraph' && (
                          <Slider
                            label="Paragraphs per chunk"
                            suffix="paragraphs"
                            value={options.groupSize}
                            min={1}
                            max={8}
                            step={1}
                            onChange={(groupSize) => update({ groupSize })}
                          />
                        )}

                        {strategy === 'toc' && (
                          <div className="space-y-3">
                            <div>
                              <span className="block text-xs font-medium text-ink-700 mb-1.5">
                                Heading depth cut
                              </span>
                              <div className="flex gap-2">
                                {[1, 2, 3].map((depth) => (
                                  <button
                                    key={depth}
                                    type="button"
                                    onClick={() => update({ tocDepth: depth })}
                                    className={`flex-1 rounded-md border py-1 text-xs font-medium ${
                                      (options.tocDepth ?? 2) === depth
                                        ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                                        : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                                    }`}
                                  >
                                    Level {depth} {depth === 1 ? '(#)' : depth === 2 ? '(##)' : '(###)'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <Slider
                              label="Max entry size"
                              suffix="chars"
                              value={options.size}
                              min={300}
                              max={1500}
                              step={50}
                              onChange={(size) => update({ size })}
                            />
                          </div>
                        )}

                        {strategy === 'page' && (
                          <Slider
                            label="Pages per chunk"
                            suffix="pages"
                            value={options.pagesPerChunk ?? 1}
                            min={1}
                            max={5}
                            step={1}
                            onChange={(pagesPerChunk) => update({ pagesPerChunk })}
                          />
                        )}

                        {strategy === 'table-rows' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Slider
                              label="Rows per chunk"
                              suffix="rows"
                              value={options.rowsPerChunk ?? 5}
                              min={1}
                              max={20}
                              step={1}
                              onChange={(rowsPerChunk) => update({ rowsPerChunk })}
                            />
                            <div>
                              <span className="block text-xs font-medium text-ink-700 mb-1.5">
                                Header styling
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => update({ rowFormat: 'pairs' })}
                                  className={`flex-1 rounded-md border py-1 text-xs font-medium ${
                                    (options.rowFormat ?? 'pairs') === 'pairs'
                                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                                      : 'border-ink-200 bg-white text-ink-600'
                                  }`}
                                >
                                  Pairs (Col: Val)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => update({ rowFormat: 'table' })}
                                  className={`flex-1 rounded-md border py-1 text-xs font-medium ${
                                    options.rowFormat === 'table'
                                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                                      : 'border-ink-200 bg-white text-ink-600'
                                  }`}
                                >
                                  Table pipe (|)
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {strategy === 'code' && (
                          <Slider
                            label="Max definition size"
                            suffix="chars"
                            value={options.size}
                            min={200}
                            max={1500}
                            step={50}
                            onChange={(size) => update({ size })}
                          />
                        )}

                        {(strategy === 'semantic' || strategy === 'topic') && (
                          <div>
                            <span className="block text-xs font-medium text-ink-700 mb-1.5">
                              Breakpoint sensitivity
                            </span>
                            <div className="flex gap-2">
                              {(['fewer', 'balanced', 'more'] as const).map((level) => (
                                <button
                                  key={level}
                                  type="button"
                                  onClick={() => update({ sensitivity: level })}
                                  className={`flex-1 rounded-md border py-1 text-xs font-medium capitalize ${
                                    (options.sensitivity ?? 'balanced') === level
                                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                                      : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                                  }`}
                                >
                                  {level} cuts
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {strategy === 'per-conversation' && (
                          <Slider
                            label="Messages per chunk"
                            suffix="messages"
                            value={options.groupSize}
                            min={2}
                            max={12}
                            step={1}
                            onChange={(groupSize) => update({ groupSize })}
                          />
                        )}

                        {strategy === 'session' && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Slider
                              label="Silence gap"
                              suffix="minutes"
                              value={options.gapMinutes ?? 60}
                              min={15}
                              max={240}
                              step={15}
                              onChange={(gapMinutes) => update({ gapMinutes })}
                            />
                            <Slider
                              label="Max session messages"
                              suffix="messages"
                              value={options.maxMessages ?? 20}
                              min={5}
                              max={50}
                              step={5}
                              onChange={(maxMessages) => update({ maxMessages })}
                            />
                          </div>
                        )}

                        {(strategy === 'per-message' ||
                          strategy === 'day-wise' ||
                          strategy === 'elements') && (
                          <p className="text-xs text-ink-500 italic">
                            This strategy uses natural document and chat boundaries with zero required sliders.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Collapsible Personalization Section */}
          <div className="rounded-xl border border-ink-200 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => setPersonalizeOpen(!personalizeOpen)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink-50/60 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">
                  Personalize for this file
                </span>
                <span className="rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 border border-brand-200">
                  Context, Exclusions & Merging
                </span>
              </div>
              <span className="font-mono text-xs text-ink-500">
                {personalizeOpen ? '− Hide' : '+ Show'}
              </span>
            </button>

            {personalizeOpen && (
              <div className="border-t border-ink-100 p-4 space-y-4 bg-ink-50/30">
                <p className="text-xs text-ink-600">
                  Customize what gets carried with each chunk and what gets left out of search.
                </p>

                {/* Exclude Sections */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="block text-xs font-semibold text-ink-800">
                      Leave out sections named
                    </span>
                    <span className="text-[10px] text-ink-400">Comma-separated</span>
                  </div>
                  <input
                    type="text"
                    value={options.excludeSections ?? ''}
                    onChange={(e) => update({ excludeSections: e.target.value })}
                    placeholder="e.g. References, Appendix, Bibliography"
                    className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden"
                  />
                  {availableSectionSuggestions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-ink-400">Add suggestion:</span>
                      {availableSectionSuggestions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => addExcludedSection(name)}
                          className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-brand-700 border border-brand-200 hover:bg-brand-50 transition-colors"
                        >
                          + {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Exclude People / Speakers */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="block text-xs font-semibold text-ink-800">
                      Leave out people named
                    </span>
                    <span className="text-[10px] text-ink-400">Comma-separated</span>
                  </div>
                  <input
                    type="text"
                    value={options.excludePeople ?? ''}
                    onChange={(e) => update({ excludePeople: e.target.value })}
                    placeholder="e.g. Test user, System, Bot"
                    className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden"
                  />
                  {availableSpeakerSuggestions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-ink-400">From this file:</span>
                      {availableSpeakerSuggestions.map((speaker) => (
                        <button
                          key={speaker}
                          type="button"
                          onClick={() => addExcludedPerson(speaker)}
                          className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-ink-700 border border-ink-200 hover:bg-ink-100 transition-colors"
                        >
                          + {speaker}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Context prefixes */}
                <div className="grid gap-2.5 sm:grid-cols-2 pt-1 border-t border-ink-100">
                  <label className="flex items-center gap-2 text-xs text-ink-700 bg-white p-2.5 rounded-lg border border-ink-200">
                    <input
                      type="checkbox"
                      checked={options.contextHeadingPath ?? true}
                      onChange={(e) => update({ contextHeadingPath: e.target.checked })}
                      className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                    />
                    <span>Heading path / speaker in front</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-ink-700 bg-white p-2.5 rounded-lg border border-ink-200">
                    <input
                      type="checkbox"
                      checked={options.contextTitle ?? false}
                      onChange={(e) => update({ contextTitle: e.target.checked })}
                      className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                    />
                    <span>Document title in front</span>
                  </label>
                </div>

                <div>
                  <span className="block text-xs font-medium text-ink-700">
                    Custom prefix in front
                  </span>
                  <input
                    type="text"
                    value={options.contextPrefix ?? ''}
                    onChange={(e) => update({ contextPrefix: e.target.value })}
                    placeholder="e.g. Technical Whitepaper, 2026"
                    className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <Slider
                  label="Merge small chunks under"
                  suffix="chars"
                  value={options.minChunkSize ?? 0}
                  min={0}
                  max={200}
                  step={20}
                  onChange={(minChunkSize) => update({ minChunkSize })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right column: Result preview */}
        <Panel tone="result">
          <PanelHeader
            tone="result"
            title={`${chunks.length} chunks`}
            hint={`${transcript.messages.length} items, averaging ${averageLength} characters per chunk`}
          />

          <div className="max-h-[44rem] space-y-3 overflow-y-auto p-4 sm:p-5">
            {chunks.slice(0, MAX_VISIBLE_CHUNKS).map((chunk, index) => (
              <ChunkCard
                key={`${revealKey}-${chunk.id}`}
                chunk={chunk}
                revealIndex={index}
              />
            ))}

            {chunks.length > MAX_VISIBLE_CHUNKS && (
              <p className="pt-2 text-center text-xs text-ink-500">
                Showing the first {MAX_VISIBLE_CHUNKS} of {chunks.length} chunks. All {chunks.length} chunks will be embedded and searched.
              </p>
            )}

            {chunks.length === 0 && (
              <p className="py-8 text-center text-xs text-ink-400">
                No chunks generated with the current settings or all items were excluded. Try adjusting exclusions or settings.
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
        className="mt-1.5 w-full accent-brand-600"
      />
    </div>
  );
}
