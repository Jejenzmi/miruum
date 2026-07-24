import type { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { getSettings } from "./settings.js";
import { sendFcm } from "./fcm.js";

// ─────────────────────────── Notification dispatch ───────────────────────────
// Always writes an in-app notification. Email (SMTP), WhatsApp & FCM push are
// configured from Back Office → Integrasi (stored in Settings). When a channel
// is enabled + configured it fires for real; otherwise it logs (mock).

export interface NotifyInput {
  userId?: string | null;
  title: string;
  body: string;
  type?: string; // info | success | pending | cancel
  hotelName?: string;
  orderCode?: string;
  phone?: string;
  email?: string;
  html?: string; // rich HTML email body (falls back to `body` text)
  attachments?: { filename: string; content: Buffer; cid?: string; contentType?: string }[];
}

let mailer: nodemailer.Transporter | null = null;
let mailerKey = "";

function getMailer(s: Record<string, string>): nodemailer.Transporter | null {
  if (s.mail_enabled !== "1" || !s.smtp_host) return null;
  const key = `${s.smtp_host}:${s.smtp_port}:${s.smtp_user}:${s.smtp_pass}:${s.smtp_secure}`;
  if (mailer && mailerKey === key) return mailer;
  mailer = nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port || 587),
    secure: s.smtp_secure === "1",
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  });
  mailerKey = key;
  return mailer;
}

export async function sendMail(
  to: string, subject: string, text: string,
  html?: string, attachments?: { filename: string; content: Buffer; cid?: string; contentType?: string }[],
): Promise<void> {
  const s = await getSettings();
  const m = getMailer(s);
  if (!m) { console.log(`[notify:email mock] → ${to}: ${subject}`); return; }
  await m.sendMail({ from: s.smtp_from || s.smtp_user, to, subject, text, ...(html ? { html } : {}), ...(attachments ? { attachments } : {}) });
}

export async function dispatch(prisma: PrismaClient, n: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: n.userId ?? null, title: n.title, body: n.body,
      type: n.type ?? "info", hotelName: n.hotelName, orderCode: n.orderCode,
    },
  });

  const s = await getSettings();

  // WhatsApp (generic HTTP gateway)
  if (n.phone) {
    if (s.wa_enabled === "1" && s.wa_api_url) {
      try {
        await fetch(s.wa_api_url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.wa_api_token ?? ""}` },
          body: JSON.stringify({ to: n.phone, message: `*${n.title}*\n${n.body}` }),
        });
      } catch (e: any) { console.warn("[notify:wa] failed", e.message); }
    } else {
      console.log(`[notify:wa mock] → ${n.phone}: ${n.title}`);
    }
  }

  // Email (real via SMTP, else mock) — HTML body + attachments when provided.
  if (n.email) {
    try { await sendMail(n.email, n.title, n.body, n.html, n.attachments); }
    catch (e: any) { console.warn("[notify:email] failed", e.message); }
  }

  // FCM push to the user's registered devices
  if (n.userId && s.fcm_enabled === "1" && s.fcm_service_account) {
    try {
      const devices = await prisma.deviceToken.findMany({ where: { userId: n.userId }, select: { token: true } });
      const tokens = devices.map((d) => d.token);
      if (tokens.length) await sendFcm(s.fcm_service_account, tokens, n.title, n.body, n.orderCode ? { orderCode: n.orderCode } : undefined);
    } catch (e: any) { console.warn("[notify:fcm] failed", e.message); }
  }
}
