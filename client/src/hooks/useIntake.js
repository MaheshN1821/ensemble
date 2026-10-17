import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Loads the shared intake rules and this session's saved intake, and wraps every intake call.
 * The server is the source of truth: each action replaces `state` with the server's answer.
 */
export function useIntake(sessionId, { onSessionLost } = {}) {
  const [config, setConfig] = useState(null);
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const guard = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (e) {
        if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
        throw e;
      }
    },
    [onSessionLost],
  );

  const load = useCallback(async () => {
    setState(null); // never show a previous session's data
    if (!sessionId) return;
    setLoadError(null);
    try {
      const [cfg, st] = await Promise.all([
        api('/api/intake/config'),
        api('/api/sessions/me', { sessionId }),
      ]);
      setConfig(cfg);
      setState(st);
    } catch (e) {
      if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
      else setLoadError(e);
    }
  }, [sessionId, onSessionLost]);

  useEffect(() => {
    load();
  }, [load]);

  const call = (path, method, body) => guard(async () => {
    const next = await api(path, { method, body, sessionId });
    setState(next);
    return next;
  });

  return {
    config,
    state,
    loadError,
    reload: load,
    acceptConsent: (over18, ownPhotos) => call('/api/sessions/me/consent', 'POST', { over18, ownPhotos }),
    uploadPhoto: (kind, blob, name = 'photo.jpg') => {
      const form = new FormData();
      form.append('image', blob, name);
      return call(`/api/sessions/me/photos/${kind}`, 'PUT', form);
    },
    removePhoto: (kind) => call(`/api/sessions/me/photos/${kind}`, 'DELETE'),
    chooseSample: (modelId) => call('/api/sessions/me/sample-model', 'PUT', { modelId }),
    savePreferences: (prefs) => call('/api/sessions/me/preferences', 'PUT', prefs),
    deleteEverything: () => guard(() => api('/api/sessions/me', { method: 'DELETE', sessionId })),
  };
}
