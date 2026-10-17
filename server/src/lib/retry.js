export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry with exponential backoff + jitter.
 * `shouldRetry` decides which errors are safe to retry (default: errors flagged `retryable`).
 */
export async function withRetry(
  fn,
  { retries = 3, baseMs = 400, shouldRetry = (e) => Boolean(e?.retryable), sleep: sleepFn = sleep, onRetry } = {},
) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const wait = err.retryAfterMs ?? Math.min(8000, baseMs * 2 ** attempt) + Math.random() * 150;
      attempt += 1;
      onRetry?.(err, attempt, wait);
      await sleepFn(wait);
    }
  }
}
