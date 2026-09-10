import type { ReactNode } from 'react';
import type { Chunk } from '../../types';

interface ChunkCardProps {
  chunk: Chunk;
  /** Draws the card as a retrieved result, with its rank shown. */
  rank?: number;
  /** Similarity score, rendered by the caller as a bar beside the card. */
  aside?: ReactNode;
  /** Position in a staggered reveal. Omit for no animation. */
  revealIndex?: number;
}

/**
 * One chunk, shown as a card.
 *
 * When a chunk carries text repeated from the one before it, that overlap is
 * tinted so the reason for overlapping is visible rather than described.
 */
export function ChunkCard({ chunk, rank, aside, revealIndex }: ChunkCardProps) {
  const overlap = Math.min(chunk.overlapChars, chunk.text.length);
  const carried = overlap > 0 ? chunk.text.slice(0, overlap) : '';
  const fresh = overlap > 0 ? chunk.text.slice(overlap) : chunk.text;

  return (
    <article
      className={`rounded-xl border border-ink-200 bg-white p-4 transition-colors hover:border-ink-300 ${
        revealIndex === undefined ? '' : 'rise-in'
      }`}
      style={
        revealIndex === undefined
          ? undefined
          : // Cap the stagger so a long list does not take seconds to appear.
            { animationDelay: `${Math.min(revealIndex, 14) * 28}ms` }
      }
    >
      <header className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
        <span className="font-medium text-ink-700">
          {rank ? `Result ${rank}` : `Chunk ${chunk.index + 1}`}
        </span>
        {chunk.speakers.length > 0 && <span>{chunk.speakers.join(', ')}</span>}
        <span className="font-mono tabular-nums">{chunk.text.length} chars</span>
        {overlap > 0 && (
          <span className="font-mono tabular-nums text-brand-700">{overlap} carried over</span>
        )}
        {aside && <span className="ml-auto">{aside}</span>}
      </header>

      <p className="wrap-anywhere whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
        {carried && <span className="rounded bg-brand-100 text-brand-900">{carried}</span>}
        {fresh}
      </p>
    </article>
  );
}
