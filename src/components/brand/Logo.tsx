interface LogoProps {
  /** Height of the mark in pixels. The wordmark scales with it. */
  size?: number;
  className?: string;
}

/**
 * The Peppi Labs logo, as on peppilabs.net: the network mark and "Peppi Labs" with "Labs" in coral.
 * The mark is public/peppilabs-mark.png, copied from the Peppi Labs site.
 */
export function Logo({ size = 28, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/peppilabs-mark.png" alt="" width={Math.round(size * 1.25)} height={size} className="shrink-0" />
      <span className="font-extrabold tracking-tight whitespace-nowrap text-ink-900" style={{ fontSize: size * 0.68, letterSpacing: '-0.02em' }}>
        Peppi <span style={{ color: '#ff6b6b' }}>Labs</span>
      </span>
    </span>
  );
}
