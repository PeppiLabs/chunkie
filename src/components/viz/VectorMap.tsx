import { useMemo, useState } from 'react';
import type { EmbeddedChunk, SearchHit } from '../../types';

interface VectorMapProps {
  chunks: EmbeddedChunk[];
  /** Ranked results, drawn connected to the query point. */
  hits?: SearchHit[] | null;
  /** Where the query landed on the same axes. */
  queryPoint?: { x: number; y: number } | null;
}

/** Drawing box in SVG user units. The map is square and scales to its container. */
const VIEW = 100;
const PADDING = 8;

/** Maps a projected coordinate in the range -1 to 1 onto the drawing box. */
function toCanvas(value: number): number {
  return PADDING + ((value + 1) / 2) * (VIEW - PADDING * 2);
}

/**
 * A 2D map of the vector space.
 *
 * The embeddings have 384 dimensions, which nobody can picture, so the two
 * directions along which the chunks differ most become the x and y axes here.
 * Chunks that sit close together really are close in meaning. Once a search
 * runs, the query appears as an orange marker and the top matches are the
 * chunks nearest to it.
 */
export function VectorMap({ chunks, hits, queryPoint }: VectorMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const hitRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const hit of hits ?? []) ranks.set(hit.chunk.id, hit.rank);
    return ranks;
  }, [hits]);

  const active = hovered ? chunks.find((chunk) => chunk.id === hovered) : null;

  /**
   * What the picture says, in words.
   *
   * role="img" makes everything inside the svg presentational, so per dot
   * titles are never reachable. Rather than leave assistive tech with a bare
   * count, the label states the finding the map exists to show. The ranked
   * result cards beside it carry the detail.
   */
  const summary = queryPoint
    ? `Map of ${chunks.length} chunks arranged so that chunks with similar meaning sit close together. ` +
      `Your question is marked separately, with lines drawn to the ${hits?.length ?? 0} closest chunks, ` +
      'which are the ones listed as results above.'
    : `Map of ${chunks.length} chunks arranged so that chunks with similar meaning sit close together. ` +
      'Search on the next step to see where a question lands among them.';

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full rounded-xl border border-ink-200 bg-white"
        role="img"
        aria-label={summary}
      >
        <defs>
          <pattern id="vector-map-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="var(--color-ink-100)" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width={VIEW} height={VIEW} fill="url(#vector-map-grid)" />

        {/* Lines from the query to each result, thicker for a better match. */}
        {queryPoint &&
          (hits ?? []).map((hit) => (
            <line
              key={`link-${hit.chunk.id}`}
              x1={toCanvas(queryPoint.x)}
              y1={toCanvas(queryPoint.y)}
              x2={toCanvas(hit.chunk.point.x)}
              y2={toCanvas(hit.chunk.point.y)}
              stroke="var(--color-accent-500)"
              strokeWidth={0.9 - hit.rank * 0.12}
              strokeOpacity={0.65 - hit.rank * 0.08}
            />
          ))}

        {chunks.map((chunk) => {
          const rank = hitRanks.get(chunk.id);
          const isHit = rank !== undefined;
          const isHovered = hovered === chunk.id;
          const x = toCanvas(chunk.point.x);
          const y = toCanvas(chunk.point.y);

          return (
            <g key={chunk.id}>
              {/* A dot sized to read well is far too small to hit with a
                  finger, so the target is a generous invisible circle and the
                  visible dot stays the size the design wants. Pointer events
                  cover mouse and touch in one path. */}
              <circle
                cx={x}
                cy={y}
                r="4"
                fill="transparent"
                className="cursor-pointer"
                onPointerEnter={() => setHovered(chunk.id)}
                onPointerLeave={() => setHovered(null)}
                onPointerDown={() => setHovered(chunk.id)}
              />
              <circle
                cx={x}
                cy={y}
                r={isHit ? 2.4 : 1.5}
                fill={isHit ? 'var(--color-brand-600)' : 'var(--color-brand-300)'}
                stroke={isHovered ? 'var(--color-ink-900)' : 'white'}
                strokeWidth={isHovered ? 0.9 : 0.5}
                className="pointer-events-none transition-[r] duration-200"
              />
            </g>
          );
        })}

        {queryPoint && (
          <g>
            <circle
              cx={toCanvas(queryPoint.x)}
              cy={toCanvas(queryPoint.y)}
              r="4.6"
              fill="var(--color-accent-500)"
              fillOpacity="0.18"
            />
            <circle
              cx={toCanvas(queryPoint.x)}
              cy={toCanvas(queryPoint.y)}
              r="2.6"
              fill="var(--color-accent-500)"
              stroke="white"
              strokeWidth="0.8"
            />
          </g>
        )}
      </svg>

      {active && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-ink-900/92 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          <span className="font-semibold">Chunk {active.index + 1}</span>
          <span className="mx-1.5 text-ink-400">/</span>
          <span className="text-ink-100">{active.text.slice(0, 160)}</span>
          {active.text.length > 160 && <span className="text-ink-400">...</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand-300" />A chunk of your chat
        </span>
        {hits && hits.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
            Retrieved for this question
          </span>
        )}
        {queryPoint && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-500" />
            Your question
          </span>
        )}
      </div>
    </div>
  );
}
