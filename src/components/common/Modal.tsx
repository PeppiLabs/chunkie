import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  /** Shown in the header, and read out as the dialog's name. */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A large centred dialog.
 *
 * Closes on the X, on a click outside the panel, and on Escape, because people
 * reach for all three. Focus moves into the dialog on open and returns to
 * whatever opened it on close, so a keyboard user is not dropped back at the
 * top of the page.
 */
export function Modal({ title, subtitle, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Remember where focus was so it can go back when the dialog closes.
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    // Stop the page behind the dialog scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      // Keep Tab inside the dialog, so focus cannot wander behind it.
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm sm:p-6"
      // Only a click that both starts and ends on the backdrop closes it, so a
      // drag that happens to finish out here does not shut the dialog.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-base font-semibold tracking-tight text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>

          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
