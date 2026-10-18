import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Asks the server to plan three looks. Planning is free and deterministic (no YouCam call, no language model),
 * so it is safe to run on every visit and whenever the budget is changed.
 * `constraints` is { budgetInr?, excludeItemIds? }. phase: loading | ready | error
 */
export function usePlan(sessionId, { onSessionLost } = {}) {
  const [phase, setPhase] = useState('loading');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [constraints, setConstraints] = useState({});
  const run = useRef(0);

  const load = useCallback(async (next = {}) => {
    if (!sessionId) return;
    const id = ++run.current;
    setPhase((p) => (p === 'ready' ? 'ready' : 'loading')); // keep the old looks on screen while a new budget is tried
    setError(null);
    try {
      const out = await api('/api/sessions/me/plan', { method: 'POST', body: next, sessionId });
      if (run.current !== id) return;
      setPlan(out);
      setConstraints(next);
      setPhase('ready');
    } catch (e) {
      if (run.current !== id) return;
      if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
      setError(e);
      setPhase('error');
    }
  }, [sessionId, onSessionLost]);

  useEffect(() => { load({}); }, [load]);

  return { phase, plan, error, constraints, replan: load };
}
