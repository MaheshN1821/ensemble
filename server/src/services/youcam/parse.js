const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const UNIT_KEYS = ['unit', 'units', 'cost', 'credit', 'credits', 'consumption', 'unit_consumption'];

/**
 * Best-effort lookup of a feature's unit price inside the feature-cost response.
 * The response shape isn't pinned down yet, so this tolerates arrays of rows and key/value maps.
 * Returns null when nothing matches; the gateway then falls back to overrides or a conservative default.
 */
export function findUnits(costJson, feature) {
  const target = norm(feature);
  let found = null;

  const walk = (node) => {
    if (found !== null || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const labelMatches = Object.values(node).some((v) => typeof v === 'string' && norm(v).includes(target));
    if (labelMatches) {
      for (const k of UNIT_KEYS) {
        if (typeof node[k] === 'number') {
          found = node[k];
          return;
        }
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'number' && norm(k).includes(target)) {
        found = v;
        return;
      }
    }
    Object.values(node).forEach(walk);
  };

  walk(costJson);
  return found;
}

function collectUrls(node, out = []) {
  if (typeof node === 'string') {
    if (/^https?:\/\//i.test(node)) out.push(node);
  } else if (Array.isArray(node)) {
    node.forEach((n) => collectUrls(n, out));
  } else if (node && typeof node === 'object') {
    Object.values(node).forEach((n) => collectUrls(n, out));
  }
  return out;
}

/** Normalises a task payload. polling_interval may arrive in seconds or milliseconds. */
export function parseTask(data) {
  const status = String(data?.task_status ?? data?.status ?? 'unknown').toLowerCase();
  const raw = Number(data?.polling_interval);
  let pollingIntervalMs = null;
  if (Number.isFinite(raw) && raw > 0) {
    pollingIntervalMs = Math.min(15_000, Math.max(1_000, raw <= 30 ? raw * 1000 : raw));
  }
  const results = data?.results ?? data?.result ?? null;
  return {
    status,
    pollingIntervalMs,
    results,
    resultUrls: collectUrls(results),
    error: data?.error ?? data?.error_message ?? null,
    errorCode: data?.error_code ?? data?.error ?? null,
  };
}
