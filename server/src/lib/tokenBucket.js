const EPSILON = 1e-9;

export class TokenBucket {
  #tokens;
  #last;

  constructor({ name = 'bucket', capacity, refillPerSec, now = Date.now }) {
    this.name = name;
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.now = now;
    this.#tokens = capacity;
    this.#last = now();
  }

  #refill() {
    const t = this.now();
    const dt = (t - this.#last) / 1000;
    if (dt > 0) {
      this.#tokens = Math.min(this.capacity, this.#tokens + dt * this.refillPerSec);
      this.#last = t;
    }
  }

  available() {
    this.#refill();
    return this.#tokens;
  }

  msUntil(n = 1) {
    this.#refill();
    if (this.#tokens >= n - EPSILON) return 0;
    return ((n - this.#tokens) / this.refillPerSec) * 1000;
  }

  take(n = 1) {
    this.#refill();
    if (this.#tokens < n - EPSILON) return false;
    this.#tokens = Math.max(0, this.#tokens - n);
    return true;
  }
}

/**
 * A bucket that can never emit more than `limit` requests in ANY window of `windowSeconds`.
 * Worst case = capacity + refillPerSec * windowSeconds = limit.
 */
export function boundedBucket({ name, limit, windowSeconds, burstShare = 0.3, now }) {
  const capacity = Math.max(1, Math.floor(limit * burstShare));
  const refillPerSec = Math.max(0.001, (limit - capacity) / windowSeconds);
  return new TokenBucket({ name, capacity, refillPerSec, now });
}
