/** Outline eye, used on the button that opens a read only preview. */
export function EyeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M1.7 10S4.7 4.6 10 4.6 18.3 10 18.3 10 15.3 15.4 10 15.4 1.7 10 1.7 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
