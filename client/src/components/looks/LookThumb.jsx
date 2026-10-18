/** A small picture of a look for lists: the close-up if there is one, else the full-length photo, else a quiet placeholder. */
export default function LookThumb({ look }) {
  const image = look.images?.face ?? look.images?.body ?? null;
  const outfit = look.items?.outfit;
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-mist">
      {image ? (
        <img src={image.url} alt={image.alt} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-[13px] text-ink-soft">
          <span className="flex items-end gap-1" aria-hidden="true">{[12, 18, 15].map((h, i) => <span key={i} className="w-2.5 rounded-t-full bg-ink/60" style={{ height: h }} />)}</span>
          <span>{look.active ? 'Drawing now' : 'Not drawn yet'}</span>
          {outfit && <span className="sr-only">{outfit.name}</span>}
        </div>
      )}
    </div>
  );
}
