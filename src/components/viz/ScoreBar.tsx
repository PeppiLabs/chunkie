interface ScoreBarProps {
  /** Cosine similarity, from -1 to 1. */
  score: number;
  /** Draws the bar in the strongest colour, used for the top result. */
  emphasis?: boolean;
}

/** Turns a similarity score into a labelled bar plus the raw number. */
export function ScoreBar({ score, emphasis = false }: ScoreBarProps) {
  // Negative similarity means opposite direction, which reads as zero overlap here.
  const filled = Math.max(0, Math.min(1, score));

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            emphasis ? 'bg-brand-600' : 'bg-brand-400'
          }`}
          style={{ width: `${filled * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-600">{score.toFixed(3)}</span>
    </div>
  );
}
