import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import { EyeIcon } from '../common/EyeIcon';
import { Explainer } from '../common/Explainer';
import { Modal } from '../common/Modal';
import { Panel, PanelHeader } from '../common/Panel';
import { StepLayout } from '../layout/StepLayout';
import { parseTranscript } from '../../lib/parse';
import { SAMPLES, type Sample } from '../../lib/samples';
import type { Transcript } from '../../types';

interface UploadStepProps {
  transcript: Transcript | null;
  onFile: (file: File) => void;
  onSample: (path: string, label: string) => void;
  onContinue: () => void;
}

/**
 * How many transcript lines to render.
 *
 * A large file can hold tens of thousands of messages, and a DOM node per
 * message freezes the tab. The preview exists to show what was loaded, and a
 * hundred lines shows that. The count in the header stays honest about the rest.
 */
const MAX_VISIBLE_MESSAGES = 100;

export function UploadStep({ transcript, onFile, onSample, onContinue }: UploadStepProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The sample being previewed, and its contents once they have arrived. */
  const [preview, setPreview] = useState<Sample | null>(null);
  const [previewTranscript, setPreviewTranscript] = useState<Transcript | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  /**
   * Opens the read only preview.
   *
   * Deliberately separate from loading: looking at what is in a transcript
   * should not change which one is selected, or throw away work already done
   * further along the pipeline.
   */
  const openPreview = async (sample: Sample) => {
    setPreview(sample);
    setPreviewTranscript(null);
    setPreviewError(null);

    try {
      const response = await fetch(sample.path);
      if (!response.ok) throw new Error(`Could not load that transcript (${response.status}).`);
      setPreviewTranscript(parseTranscript(sample.label, await response.text()));
    } catch (cause) {
      setPreviewError(cause instanceof Error ? cause.message : 'That transcript could not be read.');
    }
  };

  const closePreview = () => {
    setPreview(null);
    setPreviewTranscript(null);
    setPreviewError(null);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <StepLayout
      explainers={
        <>
          <Explainer question="What is RAG?">
            <p>
              RAG stands for retrieval augmented generation. It is how a chatbot answers questions
              about documents it was never trained on.
            </p>
            <p>
              Rather than feeding a whole archive to the model, which would be far too big, a RAG
              system finds the handful of passages that actually relate to your question and shows
              the model only those.
            </p>
          </Explainer>

          <Explainer question="Why a chat transcript?">
            <p>
              Chats are messy in useful ways. Messages are short, people paraphrase, and the answer
              to a question is often several lines away from the words you would search for. That
              is exactly where keyword search struggles and meaning based search shines.
            </p>
          </Explainer>

          <Explainer question="Where does my file go?">
            <p>
              Nowhere. Your file is read by your own browser and stays in this tab. There is no
              server, no account, and no upload. Close the tab and it is gone.
            </p>
          </Explainer>
        </>
      }
    >
      {/* The picker and what it loaded, side by side, so choosing a transcript
          and reading it are not separated by a scroll. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Start with a chat transcript"
            hint="Pick one of ours, or drop in your own JSON file."
          />

          <div className="space-y-3 p-5">
            {SAMPLES.map((sample) => {
              // The loaded transcript is named after the sample it came from,
              // so this is what keeps the tile looking chosen afterwards.
              const selected = transcript?.sourceName === sample.label;

              return (
                <div
                  key={sample.path}
                  // Two sibling buttons rather than one inside the other: a
                  // button nested in a button is invalid, and the browser
                  // stops firing the inner one's click.
                  className={`flex items-stretch gap-1 rounded-xl border p-1 transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                      : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/50'
                  }`}
                >
                  <button
                    onClick={() => onSample(sample.path, sample.label)}
                    aria-pressed={selected}
                    className="min-w-0 flex-1 rounded-lg p-3 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{sample.label}</span>
                      {selected && (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">
                          Loaded
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-500">{sample.blurb}</span>
                  </button>

                  <button
                    onClick={() => openPreview(sample)}
                    aria-label={`Read the ${sample.label} transcript`}
                    title="Read the whole chat"
                    className="shrink-0 self-center rounded-lg p-3 text-ink-500 transition-colors hover:bg-white hover:text-brand-700"
                  >
                    <EyeIcon />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="border-t border-ink-100 p-5">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50/60'
              }`}
            >
              <p className="text-sm text-ink-600">Drop a JSON transcript here</p>
              <p className="mt-1 text-xs text-ink-500">
                An array of messages, each with a text field. Up to 5 MB.
              </p>

              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onFile(file);
                  // Reset so choosing the same file twice still fires a change.
                  event.target.value = '';
                }}
              />

              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => inputRef.current?.click()}
              >
                Choose a file
              </Button>
            </div>
          </div>
        </Panel>

        {transcript ? (
          <Panel tone="result">
            <PanelHeader
              tone="result"
              title={transcript.sourceName}
              hint={
                `${transcript.messages.length} messages from ${transcript.speakers.length} people` +
                (transcript.skipped > 0
                  ? `, and ${transcript.skipped} ${
                      transcript.skipped === 1 ? 'entry' : 'entries'
                    } we could not read`
                  : '')
              }
              aside={<Button onClick={onContinue}>Chunk it</Button>}
            />

            <div className="max-h-[34rem] space-y-3 overflow-y-auto p-5">
              {transcript.messages.slice(0, MAX_VISIBLE_MESSAGES).map((message) => (
                <div key={message.id} className="flex gap-3">
                  <span className="w-24 shrink-0 truncate pt-0.5 text-xs font-medium text-ink-500">
                    {message.speaker}
                  </span>
                  <p className="wrap-anywhere min-w-0 flex-1 text-sm leading-relaxed text-ink-800">
                    {message.text}
                  </p>
                </div>
              ))}

              {transcript.messages.length > MAX_VISIBLE_MESSAGES && (
                <p className="pt-2 text-center text-sm text-ink-500">
                  Showing the first {MAX_VISIBLE_MESSAGES} of {transcript.messages.length}{' '}
                  messages. All of them go through the next steps.
                </p>
              )}
            </div>
          </Panel>
        ) : (
          <Panel
            tone="result"
            className="flex min-h-[18rem] items-center justify-center p-8 text-center"
          >
            <p className="max-w-xs text-sm leading-relaxed text-ink-600">
              Whichever transcript you pick appears here, exactly as the pipeline sees it, before
              anything is done to it.
            </p>
          </Panel>
        )}
      </div>

      {preview && (
        <Modal
          title={preview.label}
          subtitle={
            previewTranscript
              ? `${previewTranscript.messages.length} messages from ${previewTranscript.speakers.length} people`
              : 'Loading'
          }
          onClose={closePreview}
        >
          {previewError && <p className="py-8 text-center text-sm text-red-700">{previewError}</p>}

          {!previewError && !previewTranscript && (
            <p className="py-8 text-center text-sm text-ink-500">Loading the transcript</p>
          )}

          {previewTranscript && (
            <div className="space-y-3">
              {previewTranscript.messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  <span className="w-24 shrink-0 truncate pt-0.5 text-xs font-medium text-ink-500">
                    {message.speaker}
                  </span>
                  <p className="wrap-anywhere min-w-0 flex-1 text-sm leading-relaxed text-ink-800">
                    {message.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2 border-t border-ink-100 pt-4">
            <Button variant="secondary" onClick={closePreview}>
              Close
            </Button>
            <Button
              onClick={() => {
                onSample(preview.path, preview.label);
                closePreview();
              }}
            >
              Use this transcript
            </Button>
          </div>
        </Modal>
      )}
    </StepLayout>
  );
}
