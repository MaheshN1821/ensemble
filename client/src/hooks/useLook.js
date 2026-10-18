import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { streamEvents } from '../lib/stream.js';

const wait = (ms, signal) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });

/**
 * One look and its live render progress. Loads the look, then follows the server's event stream while it is being
 * drawn, and falls back to polling every 3 seconds if the stream cannot be opened.
 * phase: loading | ready | error. `retry()` draws only the stages that are missing (nothing is charged twice).
 */
export function useLook(sessionId, lookId, { onSessionLost } = {}) {
  const [look, setLook] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const lost = useRef(onSessionLost);
  lost.current = onSessionLost;

  useEffect(() => {
    if (!sessionId || !lookId) return undefined;
    const ac = new AbortController();
    const path = `/api/sessions/me/looks/${lookId}`;
    (async () => {
      try {
        let current = (await api(path, { sessionId, signal: ac.signal })).look;
        setLook(current);
        setPhase('ready');
        while (!ac.signal.aborted && current.active) {
          try {
            await streamEvents(`${path}/events`, {
              sessionId, signal: ac.signal,
              onEvent: ({ event, data }) => { if (event === 'look') { current = JSON.parse(data); setLook(current); } },
            });
          } catch {
            if (ac.signal.aborted) return;
            await wait(3000, ac.signal);
          }
          if (ac.signal.aborted) return;
          current = (await api(path, { sessionId, signal: ac.signal })).look; // the stream ended or failed: ask for the truth
          setLook(current);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e.code === 'SESSION_EXPIRED') lost.current?.();
        setError(e);
        setPhase('error');
      }
    })();
    return () => ac.abort();
  }, [sessionId, lookId, nonce]);

  const retry = useCallback(async () => {
    setActionError(null);
    try {
      const out = await api(`/api/sessions/me/looks/${lookId}/render`, { method: 'POST', sessionId });
      setLook(out.look);
      setNonce((n) => n + 1);
    } catch (e) {
      setActionError(e);
    }
  }, [sessionId, lookId]);

  const reload = useCallback(() => { setError(null); setPhase('loading'); setNonce((n) => n + 1); }, []);

  return { look, phase, error, actionError, retry, reload };
}
