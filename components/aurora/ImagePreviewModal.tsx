"use client";

import type { ImagePreviewPayload } from "./types";

type ImagePreviewModalProps = {
  image: ImagePreviewPayload | null;
  onClose: () => void;
};

export function ImagePreviewModal({ image, onClose }: ImagePreviewModalProps) {
  if (!image) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/82 px-4 py-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div className="aurora-panel w-full max-w-6xl overflow-hidden rounded-[30px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="aurora-title-primary text-xl">{image.title}</p>
            {image.subtitle ? <p className="mt-2 text-sm text-slate-300">{image.subtitle}</p> : null}
          </div>
          <button
            className="aurora-btn-ghost shrink-0 rounded-full px-4 py-2 text-xs font-semibold"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="bg-slate-950/28 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.alt} className="block max-h-[78vh] w-full rounded-[22px] object-contain" />
        </div>
      </div>
    </div>
  );
}
