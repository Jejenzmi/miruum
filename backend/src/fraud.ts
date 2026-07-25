import type { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";

// ─────────────────────────── Anti-fraud engine ───────────────────────────
// Lightweight, dependency-free risk controls: a blocklist (email/IP/phone/bank/
// device), Redis-backed velocity limits, and a risk score that flags suspicious
// bookings for manual review. Never a hard black box — every decision carries a
// human-readable reason, and legitimate flows still proceed (flagged, not killed)
// unless an explicit block or a hard velocity ceiling is hit.

export function clientIp(req: any): string {
  return String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";
}

/** Stable per-request device fingerprint from client hints (best-effort). */
export function deviceFingerprint(req: any): string {
  const parts = [req.headers?.["user-agent"], req.headers?.["x-device"], req.headers?.["accept-language"]].filter(Boolean).join("|");
  if (!parts) return "";
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export interface BlockChecks { email?: string; ip?: string; phone?: string; bank?: string; device?: string }

/** True if any provided identifier is on the active blocklist. */
export async function isBlocked(prisma: PrismaClient, c: BlockChecks): Promise<{ blocked: boolean; reason?: string }> {
  const or: { type: string; value: string }[] = [];
  if (c.email) or.push({ type: "EMAIL", value: c.email.toLowerCase() });
  if (c.ip) or.push({ type: "IP", value: c.ip });
  if (c.phone) or.push({ type: "PHONE", value: c.phone });
  if (c.bank) or.push({ type: "BANK", value: c.bank });
  if (c.device) or.push({ type: "DEVICE", value: c.device });
  if (!or.length) return { blocked: false };
  const hit = await prisma.fraudBlock.findFirst({ where: { active: true, OR: or } });
  return hit ? { blocked: true, reason: hit.reason || `${hit.type} diblokir` } : { blocked: false };
}

/** Increment a Redis velocity counter in a rolling window; returns the count. */
export async function bump(redis: Redis, key: string, windowSec: number): Promise<number> {
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    return n;
  } catch { return 0; }
}

export interface RiskInput { userId: string; ip: string; device?: string; amount: number; accountAgeDays: number }
export interface RiskResult { score: number; flagged: boolean; block: boolean; note: string }

// Booking risk: velocity per user/IP/device + account age + amount.
export async function assessBookingRisk(redis: Redis, p: RiskInput): Promise<RiskResult> {
  let score = 0; const r: string[] = [];
  if (p.accountAgeDays < 1) { score += 20; r.push("akun baru (<24 jam)"); }
  if (p.amount > 5_000_000) { score += 20; r.push("nominal tinggi"); }
  const u = await bump(redis, `fraud:vel:u:${p.userId}`, 3600);
  const ip = p.ip ? await bump(redis, `fraud:vel:ip:${p.ip}`, 3600) : 0;
  const dev = p.device ? await bump(redis, `fraud:vel:d:${p.device}`, 3600) : 0;
  if (u > 3) { score += 30; r.push(`${u} pesanan/jam (akun)`); }
  if (ip > 6) { score += 30; r.push(`${ip} pesanan/jam (IP)`); }
  if (dev > 8) { score += 30; r.push(`${dev} pesanan/jam (perangkat)`); }
  // Hard ceiling: obvious automation/abuse → block outright.
  const block = u > 10 || ip > 20;
  if (block) r.push("melewati batas keras velocity");
  return { score: Math.min(score, 100), flagged: score >= 50 || block, block, note: r.join("; ") };
}

// Refund velocity — abuse control on cancellations that pay money back.
export async function refundVelocity(redis: Redis, userId: string): Promise<{ count: number; block: boolean }> {
  const c = await bump(redis, `fraud:vel:refund:${userId}`, 86400);
  return { count: c, block: c > 5 };
}
