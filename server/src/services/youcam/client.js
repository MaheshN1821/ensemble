/**
 * Thin, dependency-free HTTP client for the YouCam AI API (V2).
 * No queueing or retries in here: the gateway owns those, so every attempt is rate-limited.
 *
 * Endpoints (V2, bearer auth with the API key):
 *   POST   /s2s/v2.0/file                      -> upload URL + file_id
 *   PUT    <signed url>                        -> the actual bytes
 *   POST   /s2s/v2.0/task/{feature}            -> task_id
 *   GET    /s2s/v2.0/task/{feature}/{task_id}  -> status + results
 *   GET    /s2s/v2.0/credit/feature-cost       -> unit prices
 *   DELETE /s2s/v2.0/task/{feature}/{task_id}  -> VERIFY against the docs before relying on it (Step 9)
 */
export class YoucamError extends Error {
  constructor(message, { status, code, body, retryAfterMs, retryable = false } = {}) {
    super(message);
    this.name = 'YoucamError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
    this.retryable = retryable;
  }
}

const FORBIDDEN_UPLOAD_HEADERS = new Set(['content-length', 'host']);

export function createYoucamClient({ apiKey, baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 30_000 }) {
  async function api(method, path, { json } = {}) {
    const url = new URL(path, baseUrl);
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(json ? { 'Content-Type': 'application/json' } : {}),
        },
        body: json ? JSON.stringify(json) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new YoucamError(`YouCam request failed: ${cause.message}`, { code: 'NETWORK', retryable: true });
    }

    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }

    const bodyStatus = typeof body?.status === 'number' ? body.status : res.status;
    if (!res.ok || bodyStatus >= 400) {
      const status = res.ok ? bodyStatus : res.status;
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new YoucamError(body?.error || body?.message || `YouCam responded with ${status}`, {
        status,
        code: body?.error_code || body?.code || `HTTP_${status}`,
        body,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
        retryable: status === 429 || status >= 500,
      });
    }
    return body;
  }

  return {
    async getFeatureCost() {
      const body = await api('GET', '/s2s/v2.0/credit/feature-cost');
      return body?.data ?? body;
    },

    async createFileRecord({ fileName, contentType, fileSize }) {
      const body = await api('POST', '/s2s/v2.0/file', {
        json: { files: [{ content_type: contentType, file_name: fileName, file_size: fileSize }] },
      });
      return body?.data?.files?.[0];
    },

    /** Uploads the bytes to the signed URL from createFileRecord. Not a YouCam API call, so not rate limited. */
    async putFile(request, buffer) {
      const headers = {};
      for (const [k, v] of Object.entries(request.headers ?? {})) {
        if (!FORBIDDEN_UPLOAD_HEADERS.has(k.toLowerCase())) headers[k] = v;
      }
      let res;
      try {
        res = await fetchImpl(request.url, {
          method: request.method || 'PUT',
          headers,
          body: buffer,
          signal: AbortSignal.timeout(60_000),
        });
      } catch (cause) {
        throw new YoucamError(`Upload to YouCam failed: ${cause.message}`, { code: 'NETWORK', retryable: true });
      }
      if (!res.ok) {
        throw new YoucamError(`Upload to YouCam failed with ${res.status}`, {
          status: res.status,
          code: `UPLOAD_${res.status}`,
          retryable: res.status >= 500,
        });
      }
    },

    async createTask(feature, payload) {
      const body = await api('POST', `/s2s/v2.0/task/${feature}`, { json: payload });
      return body?.data;
    },

    async getTask(feature, taskId) {
      const body = await api('GET', `/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`);
      return body?.data;
    },

    async deleteTask(feature, taskId) {
      return api('DELETE', `/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`);
    },
  };
}
