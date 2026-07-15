import jwt from "jsonwebtoken";

// FCM HTTP v1 sender. Uses a Firebase service-account JSON (pasted in Back Office
// → Integrasi). Signs a short-lived OAuth JWT, exchanges it for an access token,
// then posts one message per device token. No firebase-admin dependency.

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token;
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: "RS256" },
  );
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error("OAuth: " + (j.error_description || j.error || "no token"));
  tokenCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** Send a push to a list of device tokens. Returns {sent, failed}. */
export async function sendFcm(serviceAccountJson: string, tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const projectId = sa.project_id;
  const at = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  let sent = 0, failed = 0;
  for (const token of tokens) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, notification: { title, body }, ...(data ? { data } : {}) } }),
      });
      if (r.ok) sent++; else failed++;
    } catch { failed++; }
  }
  return { sent, failed };
}

/** Validate a service-account JSON can obtain a token (for the Test button). */
export async function testFcm(serviceAccountJson: string): Promise<{ ok: boolean; error?: string; projectId?: string }> {
  try {
    const sa = JSON.parse(serviceAccountJson);
    await accessToken(sa);
    return { ok: true, projectId: sa.project_id };
  } catch (e: any) { return { ok: false, error: e.message }; }
}
