import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const SKIN = '/api/sessions/me/skin-profile';

/**
 * Loads the saved intake, then the skin tone profile. The server returns the cached reading when the selfie has not
 * changed, so reloading this page never spends units twice.
 *
 * phase: loading | incomplete | analysing | ready | error
 */
export function useSkinProfile(sessionId, { onSessionLost } = {}) {
  const [phase, setPhase] = useState('loading');
  const [intake, setIntake] = useState(null);
  const [profile, setProfile] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState(null);
  const run = useRef(0);

  const fail = useCallback(
    (e) => {
      if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
      setError(e);
      setPhase('error');
    },
    [onSessionLost],
  );

  const load = useCallback(async () => {
    if (!sessionId) return;
    const id = ++run.current;
    const live = () => run.current === id; // ignore answers from a superseded run (strict mode, retry)
    setPhase('loading');
    setError(null);
    try {
      const state = await api('/api/sessions/me', { sessionId });
      if (!live()) return;
      setIntake(state);
      if (!state.complete) return setPhase('incomplete');

      const existing = await api(SKIN, { sessionId });
      if (!live()) return;
      if (existing.profile) {
        setProfile(existing.profile);
        setOptions(existing.options);
        return setPhase('ready');
      }
      setPhase('analysing');
      const fresh = await api(SKIN, { method: 'POST', sessionId });
      if (!live()) return;
      setProfile(fresh.profile);
      setOptions(fresh.options);
      setPhase('ready');
    } catch (e) {
      if (live()) fail(e);
    }
  }, [sessionId, fail]);

  useEffect(() => {
    load();
    return () => { run.current += 1; };
  }, [load]);

  const adjust = useCallback(
    async (method, body) => {
      setAdjusting(true);
      setAdjustError(null);
      try {
        const next = await api(`${SKIN}/override`, { method, body, sessionId });
        setProfile(next.profile);
      } catch (e) {
        if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
        setAdjustError(e);
      } finally {
        setAdjusting(false);
      }
    },
    [sessionId, onSessionLost],
  );

  return {
    phase, intake, profile, options, error, adjusting, adjustError,
    retry: load,
    setOverride: (patch) => adjust('PUT', patch),
    clearOverride: () => adjust('DELETE'),
  };
}
