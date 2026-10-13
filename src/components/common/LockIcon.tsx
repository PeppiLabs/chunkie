/** Outline padlock, marking a stage that has not been unlocked yet. */
export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="8.6"
        width="12"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6.9 8.6V6.2a3.1 3.1 0 0 1 6.2 0v2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
