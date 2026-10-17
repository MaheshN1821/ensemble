/**
 * Priority queue that gates outbound calls on concurrency AND one or more token buckets.
 * Every call to YouCam goes through schedule(), so the documented rate limits can't be exceeded
 * even when many sessions are active.
 */
export class RequestQueue {
  #pending = [];
  #active = 0;
  #timer = null;
  #seq = 0;
  #pausedUntil = 0;

  constructor({ buckets = [], concurrency = 3, now = Date.now }) {
    this.buckets = buckets;
    this.concurrency = concurrency;
    this.now = now;
  }

  schedule(fn, { label = 'request', priority = 0 } = {}) {
    return new Promise((resolve, reject) => {
      this.#pending.push({ fn, label, priority, seq: this.#seq++, resolve, reject });
      this.#pending.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
      this.#pump();
    });
  }

  /** Pause all dispatching, e.g. after a 429 from the API. */
  penalize(ms) {
    this.#pausedUntil = Math.max(this.#pausedUntil, this.now() + ms);
  }

  stats() {
    return {
      queued: this.#pending.length,
      active: this.#active,
      concurrency: this.concurrency,
      pausedForMs: Math.max(0, this.#pausedUntil - this.now()),
      buckets: this.buckets.map((b) => ({
        name: b.name,
        available: Math.floor(b.available() * 10) / 10,
        capacity: b.capacity,
        refillPerSec: Math.round(b.refillPerSec * 1000) / 1000,
      })),
    };
  }

  #pump() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    while (this.#pending.length && this.#active < this.concurrency) {
      const wait = Math.max(this.#pausedUntil - this.now(), ...this.buckets.map((b) => b.msUntil(1)));
      if (wait > 0) {
        this.#timer = setTimeout(() => {
          this.#timer = null;
          this.#pump();
        }, Math.ceil(wait) + 1);
        return;
      }
      for (const b of this.buckets) b.take(1);
      const job = this.#pending.shift();
      this.#active += 1;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.#active -= 1;
          this.#pump();
        });
    }
  }
}
