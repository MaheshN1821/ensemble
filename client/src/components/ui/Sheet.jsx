import { useEffect, useRef } from 'react';

/**
 * A modal sheet built on the native <dialog>: focus stays inside, Escape closes it, and the page behind is inert.
 * Bottom sheet on phones, right-hand panel from the sm breakpoint up.
 */
export default function Sheet({ open, onClose, title, children, labelId }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelId}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90svh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-mist p-0 text-ink backdrop:bg-ink/50 sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[36rem] sm:rounded-none"
    >
      {open && (
        <div className="px-5 pb-10 pt-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <h2 id={labelId} className="text-[22px] font-medium tracking-[-0.02em]">{title}</h2>
            <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-5 text-[15px] font-medium hover:border-ink">Close</button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
