import { useState } from 'react';
import poster from '../../assets/demo-video-poster.jpg';

const VIDEO_ID = 'liMNxPHJpp0';
const VIDEO_TITLE = 'Chunkie - RAG tester and visualizer';

/**
 * The demo video, in YouTube's privacy enhanced player.
 *
 * Until someone presses play, the page shows its own copy of the thumbnail, so
 * opening the landing page sends nothing to YouTube. Pressing play swaps in
 * the player, which starts on its own. The live site's content security policy
 * allows frames from www.youtube-nocookie.com and nowhere else.
 */
export function DemoVideo() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-ink-200 bg-brand-900 shadow-[0_24px_60px_-24px_rgba(0,39,111,0.45)]">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
          title={VIDEO_TITLE}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play the video: ${VIDEO_TITLE}`}
          className="group absolute inset-0 h-full w-full cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-coral-500"
        >
          <img src={poster} alt="" width={1280} height={720} loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] transition-transform duration-150 group-hover:scale-105 group-hover:bg-coral-600 sm:h-20 sm:w-20">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-1">
                <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
