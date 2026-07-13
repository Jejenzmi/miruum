import Redis from "ioredis";
import { config } from "./config.js";

// Lazy singleton Redis. Used for lightweight response caching of public catalog
// endpoints (hotels / packages / promos). All helpers fail soft — if Redis is
// down the API still works, just uncached.
let client: Redis | null = null;

export function redis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
    client.on("error", (e) => console.warn("[redis] error", e.message));
    client.on("connect", () => console.log("[redis] connected"));
  }
  return client;
}

/** Return cached JSON for `key`, or compute via `fn`, cache it `ttl`s, and return it. */
export async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis().get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch { /* cache miss / redis down → compute */ }
  const val = await fn();
  try {
    await redis().set(key, JSON.stringify(val), "EX", ttl);
  } catch { /* ignore write failures */ }
  return val;
}

/** Drop cache keys by prefix (best-effort). */
export async function invalidate(prefix: string): Promise<void> {
  try {
    const keys = await redis().keys(`${prefix}*`);
    if (keys.length) await redis().del(keys);
  } catch { /* ignore */ }
}
