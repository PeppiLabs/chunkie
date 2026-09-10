interface LogoProps {
  /** Height of the mark in pixels. The wordmark scales with it. */
  size?: number;
  className?: string;
}

/**
 * Peppi Labs mark.
 *
 * PLACEHOLDER: this is a stand-in drawn from the Peppi speech bubble shape.
 * To use the real asset, drop it in public/ and replace the svg below with an
 * img tag pointing at it. Nothing else in the app needs to change.
 */
export function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        role="img"
        aria-label="Peppi Labs"
        className="shrink-0"
      >
        {/* Speech bubble body with the tail at the lower left. */}
        <path
          d="M10 3h11a8 8 0 0 1 8 8v6a8 8 0 0 1-8 8h-9l-6 5v-5.6A8 8 0 0 1 2 17v-6a8 8 0 0 1 8-8Z"
          fill="var(--color-brand-600)"
        />
        {/* Three dots reading left to right, a nod to a vector of values. */}
        <circle cx="11" cy="14" r="2.1" fill="#ffffff" />
        <circle cx="16.5" cy="14" r="2.1" fill="#ffffff" opacity="0.75" />
        <circle cx="22" cy="14" r="2.1" fill="#ffffff" opacity="0.45" />
      </svg>

      <span className="font-semibold tracking-tight text-ink-900" style={{ fontSize: size * 0.58 }}>
        Peppi<span className="text-brand-600"> Labs</span>
      </span>
    </span>
  );
}
