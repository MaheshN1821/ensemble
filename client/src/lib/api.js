const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status, code, requestId } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Fetch wrapper: JSON in/out, session header, and errors that already carry a user-facing message. */
export async function api(path, { method = 'GET', body, sessionId, signal } = {}) {
  const headers = {};
  if (sessionId) headers['X-Session-Id'] = sessionId;
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', { code: 'NETWORK' });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(e?.message || 'Something went wrong. Try again.', { status: res.status, code: e?.code, requestId: e?.requestId });
  }
  return data;
}
