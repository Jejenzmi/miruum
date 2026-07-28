import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "miruum-dev-secret";
// Never let production run on the shared dev fallback — anyone could mint admin tokens.
if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "miruum-dev-secret")) {
  throw new Error("FATAL: JWT_SECRET must be set to a strong, unique value in production.");
}

// Short-lived access token; long-lived, revocable refresh token (server-side).
const ACCESS_TTL = "1d";
const REFRESH_TTL_DAYS = 60;

export interface AuthRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/// Issue a new refresh token (returns the raw token; only its hash is stored).
export async function issueRefresh(userId: string, device?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hashToken(raw), expiresAt, device: device ?? null } });
  return raw;
}

/// Issue a full session pair.
export async function issueSession(userId: string, device?: string): Promise<{ token: string; refreshToken: string }> {
  return { token: signToken(userId), refreshToken: await issueRefresh(userId, device) };
}

export { hashToken };

/// Validate + rotate a refresh token. Returns the new session, or null if invalid/expired/revoked.
export async function rotateRefresh(raw: string): Promise<{ userId: string; token: string; refreshToken: string } | null> {
  if (!raw) return null;
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!rec || rec.revokedAt || rec.expiresAt < new Date()) return null;
  // Rotate: revoke the used token, issue a fresh pair.
  await prisma.refreshToken.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
  const session = await issueSession(rec.userId);
  return { userId: rec.userId, ...session };
}

/// Revoke a single refresh token (logout on this device). Idempotent.
export async function revokeRefresh(raw: string): Promise<void> {
  if (!raw) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
}

/// Revoke every active refresh token for a user (logout everywhere).
export async function revokeAllRefresh(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

function readToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7);
}

// Hard requirement — 401 if missing/invalid.
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Soft — attaches userId if present, never blocks.
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      req.userId = payload.sub;
    } catch {
      /* ignore */
    }
  }
  next();
}
