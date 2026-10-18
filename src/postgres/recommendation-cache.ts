/** Bounded process-local memoization of stored ranking features, never inference. */
export class RecommendationCache<T> {
  private readonly entries = new Map<
    string,
    { value: T; expires: number; bytes: number }
  >();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(
    private readonly maxBytes = 32 * 1024 * 1024,
    private readonly ttlMs = 15000,
  ) {}
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = load()
      .then(value => {
        const bytes = Buffer.byteLength(JSON.stringify(value));
        if (bytes <= this.maxBytes) {
          if (cached) {
            this.entries.delete(key);
            this.bytes -= cached.bytes;
          }
          while (
            this.entries.size &&
            (this.bytes + bytes > this.maxBytes || this.entries.size >= 100)
          ) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.bytes;
            this.entries.delete(oldest);
          }
          this.entries.set(key, {
            value,
            bytes,
            expires: Date.now() + this.ttlMs,
          });
          this.bytes += bytes;
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}
