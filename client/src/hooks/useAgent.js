import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { streamEvents } from '../lib/stream.js';

const wait = (ms, signal) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });

/** What the agent can do: the quick chips, example requests, limits, and whether a language model is set up. Free. */
export function useAgentConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    const ac = new AbortController();
    api('/api/agent/config', { signal: ac.signal }).then(setConfig).catch(() => {});
    return () => ac.abort();
  }, []);
  return config;
}

/**
 * Sends one refinement (typed message, chip, or one of the offered options) for a look.
 * `busy` is true while the server reads the request and plans the change; drawing continues on the look page.
 */
export function useAgentTurn(sessionId) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const send = useCallback(async (lookId, body) => {
    if (!sessionId || inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const out = await api('/api/sessions/me/agent/turn', { method: 'POST', sessionId, body: { lookId, ...body } });
      setResult(out);
      return out;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [sessionId]);

  const clear = useCallback(() => { setResult(null); setError(null); }, []);
  return { send, busy, result, error, clear };
}

/** Units, renders, refinements and model use against their session limits (FR-27). Call refresh() after anything that spends. */
export function useGovernor(sessionId) {
  const [governor, setGovernor] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!sessionId) return undefined;
    const ac = new AbortController();
    api('/api/sessions/me/governor', { sessionId, signal: ac.signal }).then(setGovernor).catch(() => {});
    return () => ac.abort();
  }, [sessionId, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { governor, setGovernor, refresh };
}

/**
 * The live "Under the hood" record. Only streams while `open`, so a closed panel costs nothing.
 * Entries are upserted by id: a step shows first as running, then as done with its time and units.
 */
export function useTrace(sessionId, open) {
  const [entries, setEntries] = useState([]);
  const [state, setState] = useState('idle'); // idle | connecting | live | retrying
  useEffect(() => {
    if (!sessionId || !open) return undefined;
    const ac = new AbortController();
    (async () => {
      while (!ac.signal.aborted) {
        setState((s) => (s === 'live' ? s : 'connecting'));
        try {
          await streamEvents('/api/sessions/me/agent/trace/events', {
            sessionId, signal: ac.signal,
            onEvent: ({ event, data }) => {
              setState('live');
              const payload = JSON.parse(data);
              if (event === 'snapshot') setEntries(payload.entries);
              else if (event === 'cleared') setEntries([]);
              else if (event === 'step') setEntries((prev) => { const i = prev.findIndex((e) => e.id === payload.id); if (i < 0) return [...prev, payload].slice(-200); const next = [...prev]; next[i] = payload; return next; });
            },
          });
        } catch { /* reconnect below */ }
        if (ac.signal.aborted) return;
        setState('retrying');
        await wait(3000, ac.signal);
      }
    })();
    return () => ac.abort();
  }, [sessionId, open]);
  return { entries, state };
}
