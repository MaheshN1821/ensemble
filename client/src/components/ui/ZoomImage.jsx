import { useRef } from 'react';

/** A picture that opens larger in a dialog. The caption (the AI preview label) stays on both sizes. */
export default function ZoomImage({ src, alt, caption, aspect = 'aspect-[3/4]' }) {
  const dialog = useRef(null);
  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={`relative block w-full ${aspect} bg-mist`} aria-label={`View larger: ${alt}`}>
        <img src={src} alt={alt} className="size-full object-contain" />
        {caption && <span className="absolute inset-x-0 bottom-0 bg-ink/85 px-3 py-2 text-left text-[12px] leading-snug text-white">{caption}</span>}
      </button>
      <dialog
        ref={dialog}
        aria-label={alt}
        onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}
        className="m-auto max-h-[94svh] max-w-[min(94vw,56rem)] overflow-hidden rounded-2xl border-0 bg-paper p-0 backdrop:bg-ink/70"
      >
        <img src={src} alt={alt} className="max-h-[82svh] w-full object-contain" />
        <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
          <p className="text-[13px] text-ink-soft">{caption}</p>
          <button type="button" autoFocus onClick={() => dialog.current?.close()} className="inline-flex h-11 shrink-0 items-center rounded-full border border-line bg-paper px-5 text-[15px] font-medium hover:border-ink">Close</button>
        </div>
      </dialog>
    </>
  );
}
