'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';

interface ImageUploaderProps {
  /** Supabase storage bucket name */
  bucket: string;
  /** Maximum number of images allowed */
  maxImages: number;
  /** Current array of public image URLs (dense — no nulls) */
  value: string[];
  /** Called with updated dense URL array after upload or remove */
  onChange: (urls: string[]) => void;
  /** Optional label shown above the grid */
  label?: string;
  disabled?: boolean;
}

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB input limit
const MAX_OUTPUT_BYTES = 350 * 1024;       // 350 KB after compression

/** Compress any image to WebP ≤350 KB using Canvas, retaining maximum quality. */
async function compressToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIM = 2000;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const r = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);

      const toBlob = (q: number): Promise<Blob> =>
        new Promise(res => canvas.toBlob(b => res(b!), 'image/webp', q));

      void (async () => {
        let blob = await toBlob(0.9);
        if (blob.size <= MAX_OUTPUT_BYTES) { resolve(blob); return; }

        let lo = 0.1, hi = 0.85;
        while (hi - lo > 0.05) {
          const mid = (lo + hi) / 2;
          blob = await toBlob(mid);
          if (blob.size <= MAX_OUTPUT_BYTES) lo = mid; else hi = mid;
        }
        blob = await toBlob(lo);

        if (blob.size > MAX_OUTPUT_BYTES) {
          const c2 = document.createElement('canvas');
          c2.width = Math.round(width * 0.7);
          c2.height = Math.round(height * 0.7);
          c2.getContext('2d')!.drawImage(canvas, 0, 0, c2.width, c2.height);
          blob = await new Promise(r => c2.toBlob(b => r(b!), 'image/webp', 0.5));
        }

        resolve(blob);
      })();
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = objectUrl;
  });
}

/** Extract the storage path from a Supabase public URL. */
function storagePath(publicUrl: string): string {
  const m = publicUrl.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  return m?.[1] ?? '';
}

/** Build a sparse slots array from a dense value array. */
function initSlots(value: string[], maxImages: number): (string | null)[] {
  const s: (string | null)[] = Array(maxImages).fill(null);
  value.forEach((url, i) => { if (i < maxImages) s[i] = url; });
  return s;
}

export default function ImageUploader({
  bucket,
  maxImages,
  value,
  onChange,
  label,
  disabled,
}: ImageUploaderProps) {
  // Internal sparse slots: null = vacant/uploadable, string = filled
  const [slots, setSlots] = useState<(string | null)[]>(() => initSlots(value, maxImages));
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<number>(0);

  // Sync when value is reset from outside (e.g., modal close/open)
  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value;
      setSlots(initSlots(value, maxImages));
    }
  }, [value, maxImages]);

  const isLoading = loadingSlot !== null;

  const handleSlotClick = (i: number) => {
    if (disabled || isLoading || slots[i] !== null) return;
    pendingSlot.current = i;
    inputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);

    if (!ACCEPTED_MIME.has(file.type)) {
      setError('Allowed formats: PNG, JPG, WEBP');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('File too large. Max 15 MB.');
      return;
    }

    const targetSlot = pendingSlot.current;
    setLoadingSlot(targetSlot);
    try {
      const blob = await compressToWebP(file);
      const webpFile = new File([blob], `img-${Date.now()}.webp`, { type: 'image/webp' });

      const fd = new FormData();
      fd.append('file', webpFile);
      fd.append('bucket', bucket);

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Upload failed');
        return;
      }

      const { url } = await res.json() as { url: string };
      const newSlots = [...slots];
      newSlots[targetSlot] = url;
      setSlots(newSlots);
      onChange(newSlots.filter((s): s is string => s !== null));
    } catch {
      setError('Failed to process image. Please try again.');
    } finally {
      setLoadingSlot(null);
    }
  };

  const handleRemove = (i: number) => {
    const url = slots[i];
    if (!url) return;

    // Fire-and-forget storage delete
    const path = storagePath(url);
    if (path) {
      fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, path }),
      }).catch(() => { /* non-critical */ });
    }

    // Set slot to null — preserves positions of other images
    const newSlots = [...slots];
    newSlots[i] = null;
    setSlots(newSlots);
    onChange(newSlots.filter((s): s is string => s !== null));
  };

  return (
    <div>
      {label && <p className="text-sm font-medium mb-2">{label}</p>}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="sr-only"
        onChange={handleFileSelect}
      />

      <div className="flex flex-wrap gap-2">
        {slots.map((imgUrl, i) => {
          if (imgUrl !== null) {
            // Filled slot — show image with hover-remove
            return (
              <div
                key={i}
                className="relative w-[72px] h-[72px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove photo"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
            );
          }

          // Vacant slot — always a clickable upload button
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSlotClick(i)}
              disabled={disabled || isLoading}
              className="w-[72px] h-[72px] rounded-lg border-2 border-dashed border-slate-300 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center flex-shrink-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingSlot === i ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Plus className="w-5 h-5 text-slate-400" />
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        PNG, JPG, WEBP · Max 15 MB · Auto-converted to WebP ≤350 KB
      </p>
    </div>
  );
}
