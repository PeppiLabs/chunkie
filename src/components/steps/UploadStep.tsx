import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import { Explainer } from '../common/Explainer';
import { Panel, PanelHeader } from '../common/Panel';
import { SAMPLES } from '../../lib/samples';
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

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Start with a chat transcript"
            hint="Pick one of ours, or drop in your own JSON file."
          />

          <div className="space-y-3 p-5">
            {SAMPLES.map((sample) => (
              <button
                key={sample.path}
                onClick={() => onSample(sample.path, sample.label)}
                className="block w-full rounded-xl border border-ink-200 bg-white p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span className="block text-sm font-semibold text-ink-900">{sample.label}</span>
                <span className="mt-0.5 block text-sm text-ink-500">{sample.blurb}</span>
              </button>
            ))}
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

        {transcript && (
          <Panel>
            <PanelHeader
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

            <div className="max-h-[26rem] space-y-3 overflow-y-auto p-5">
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
        )}
      </div>

      <aside className="space-y-4">
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
          <p>
            This site walks through the four things that have to happen for that to work, using a
            chat transcript as the document.
          </p>
        </Explainer>

        <Explainer question="Why a chat transcript?">
          <p>
            Chats are messy in useful ways. Messages are short, people paraphrase, and the answer
            to a question is often several lines away from the words you would search for. That is
            exactly where keyword search struggles and meaning based search shines.
          </p>
        </Explainer>

        <Explainer question="Where does my file go?">
          <p>
            Nowhere. Your file is read by your own browser and stays in this tab. There is no
            server, no account, and no upload. Close the tab and it is gone.
          </p>
        </Explainer>
      </aside>
    </div>
  );
}
