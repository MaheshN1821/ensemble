import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { cleanPicks, idsFromSearch, maxUnits, pickedIds, readPicks, togglePick, writePicks } from '../lib/build.js';

/**
 * Build your own look. Loads what the shopper can pick from, keeps their picks (in this tab), and asks the server to
 * score them. Scoring is free. Drawing uses the same endpoint as planned looks, so caching and caps are unchanged.
 * phase: loading | ready | error
 */
export function useBuilder(sessionId, search, { onSessionLost } = {}) {
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState({});
  const [budget, setBudget] = useState(null); // a budget tried for this look only; null means the saved one
  const [preview, setPreview] = useState({ look: null, busy: false, error: null });
  const [meta, setMeta] = useState({ config: null, looks: {} });
  const [drawing, setDrawing] = useState({ busy: false, error: null });
  const seeded = useRef(false);
  const lastSearch = useRef(search);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setPhase((p) => (p === 'ready' ? p : 'loading'));
    setError(null);
    try {
      const out = await api('/api/sessions/me/builder/items', { sessionId });
      setData(out);
      const searchChanged = search !== lastSearch.current;
      if (!seeded.current || searchChanged) {
        seeded.current = true;
        lastSearch.current = search;
        const fromLink = idsFromSearch(search);
        setPicks(cleanPicks(fromLink.length ? fromLink : readPicks(), out.items));
      } else {
        setPicks((p) => cleanPicks(pickedIds(p), out.items));
      }
      setPhase('ready');
    } catch (e) {
      if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
      setError(e);
      setPhase('error');
    }
  }, [sessionId, search, onSessionLost]);
  useEffect(() => { load(); }, [load]);

  // What drawing costs, and which looks are already drawn (those open for free).
  useEffect(() => {
    if (!sessionId) return undefined;
    let live = true;
    Promise.all([api('/api/render/config'), api('/api/sessions/me/looks', { sessionId })])
      .then(([config, l]) => live && setMeta({ config, looks: Object.fromEntries(l.looks.map((x) => [x.id, x.status])) }))
      .catch(() => {}); // the button still works without the cost hint
    return () => { live = false; };
  }, [sessionId]);

  useEffect(() => { if (phase === 'ready') writePicks(picks); }, [picks, phase]);

  const ids = useMemo(() => pickedIds(picks), [picks]);
  const key = `${ids.join('|')}#${budget ?? ''}`;
  const hasPicks = ids.length > 0;

  // Score the picks whenever they or the budget change. Late answers for an older choice are ignored.
  useEffect(() => {
    if (phase !== 'ready' || !hasPicks) { setPreview({ look: null, busy: false, error: null }); return undefined; }
    const ac = new AbortController();
    setPreview((p) => ({ ...p, busy: true, error: null }));
    const t = setTimeout(async () => {
      try {
        const out = await api('/api/sessions/me/builder/preview', { method: 'POST', sessionId, signal: ac.signal, body: { itemIds: ids, ...(budget ? { budgetInr: budget } : {}) } });
        if (!ac.signal.aborted) setPreview({ look: out.look, busy: false, error: null });
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
        if (e.code === 'ITEM_NOT_FOUND') load(); // an item was removed from the catalog while the page was open
        setPreview({ look: null, busy: false, error: e });
      }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [key, phase, hasPicks, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((item) => { setDrawing((d) => ({ ...d, error: null })); setPicks((p) => togglePick(p, item)); }, []);
  const remove = useCallback((slot) => setPicks((p) => { const n = { ...p }; delete n[slot]; return n; }), []);
  const clear = useCallback(() => setPicks({}), []);

  /** Starts drawing the chosen look. Resolves to the look id so the page can open it. */
  const draw = useCallback(async () => {
    setDrawing({ busy: true, error: null });
    try {
      const out = await api('/api/sessions/me/looks', { method: 'POST', sessionId, body: { itemIds: ids, budgetInr: preview.look?.budgetInr ?? data?.budgetInr } });
      setDrawing({ busy: false, error: null });
      return out.look.id;
    } catch (e) {
      if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
      setDrawing({ busy: false, error: e });
      return null;
    }
  }, [sessionId, ids, preview.look, data, onSessionLost]);

  return {
    phase, error, data, picks, ids, budget, setBudget, preview, draw, drawing, toggle, remove, clear, reload: load,
    units: maxUnits(meta.config, picks),
    drawnStatus: preview.look ? meta.looks[preview.look.id] ?? null : null,
  };
}
