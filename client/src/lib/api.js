const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Absolute address of an API path. Used for images that the browser loads directly (shared looks). */
export const apiUrl = (path) => `${BASE}${path}`;

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
export async function api(path, { method = 'GET', body, sessionId, authToken, signal } = {}) {
  const headers = {};
  if (sessionId) headers['X-Session-Id'] = sessionId;
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
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
    const err = new ApiError(e?.message || 'Something went wrong. Try again.', { status: res.status, code: e?.code, requestId: e?.requestId });
    err.details = e?.details; // e.g. the import report on IMPORT_REJECTED
    throw err;
  }
  return data;
}

/**
 * Downloads a file the API returns (the usage CSV). A plain link cannot send the sign-in token header, and the
 * token must not go in the address, so the file is fetched here and handed to the browser as a download.
 */
export async function apiDownload(path, { authToken, sessionId, filename = 'download' } = {}) {
  const headers = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (sessionId) headers['X-Session-Id'] = sessionId;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', { code: 'NETWORK' });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const e = data?.error;
    throw new ApiError(e?.message || 'Something went wrong. Try again.', { status: res.status, code: e?.code, requestId: e?.requestId });
  }
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') || '')?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = named || filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
