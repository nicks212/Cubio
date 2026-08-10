'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Renders the images attached to a chat message as thumbnails that fit inside the bubble.
 * Tapping a thumbnail opens a fullscreen lightbox (image fit to viewport) with an X button;
 * clicking the backdrop or pressing Esc closes it. Works on both web and mobile.
 *
 * Used by the company conversation view and the admin conversation view.
 */
export default function MessageImages({ urls }: { urls?: string[] | null }) {
  const [active, setActive] = useState<string | null>(null);

  // Close on Esc + lock body scroll while the lightbox is open.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);

  const images = (urls ?? []).filter(u => typeof u === 'string' && u.startsWith('http'));
  if (images.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-1.5">
        {images.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={() => setActive(url)}
            className="block overflow-hidden rounded-lg border border-black/10 focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="attachment"
              loading="lazy"
              className="h-32 w-32 sm:h-40 sm:w-40 object-cover cursor-zoom-in transition-transform hover:scale-[1.02]"
            />
          </button>
        ))}
      </div>

      {active && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActive(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setActive(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active}
            alt="attachment"
            onClick={e => e.stopPropagation()}
            className="max-h-[90vh] max-w-[95vw] w-auto h-auto rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
