import type { PrismaClient } from "@prisma/client";

// ─────────────────────────── Notification dispatch ───────────────────────────
// Always writes an in-app notification. WhatsApp / email are pluggable: if the
// provider env is set they fire for real, otherwise they log (mock) so the flow
// is demoable. Swap in a real WA/SMTP provider by setting the env vars.

export interface NotifyInput {
  userId?: string | null;
  title: string;
  body: string;
  type?: string; // info | success | pending | cancel
  hotelName?: string;
  orderCode?: string;
  phone?: string;
  email?: string;
}

export async function dispatch(prisma: PrismaClient, n: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: n.userId ?? null, title: n.title, body: n.body,
      type: n.type ?? "info", hotelName: n.hotelName, orderCode: n.orderCode,
    },
  });

  // WhatsApp (generic HTTP provider, e.g. gateway at office.gokar.id)
  if (n.phone) {
    if (process.env.WA_API_URL) {
      try {
        await fetch(process.env.WA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WA_API_TOKEN ?? ""}` },
          body: JSON.stringify({ to: n.phone, message: `*${n.title}*\n${n.body}` }),
        });
      } catch (e: any) { console.warn("[notify:wa] failed", e.message); }
    } else {
      console.log(`[notify:wa mock] → ${n.phone}: ${n.title} — ${n.body}`);
    }
  }

  // Email (real via SMTP relay URL, else mock log)
  if (n.email) {
    if (process.env.MAIL_API_URL) {
      try {
        await fetch(process.env.MAIL_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MAIL_API_TOKEN ?? ""}` },
          body: JSON.stringify({ to: n.email, subject: n.title, text: n.body }),
        });
      } catch (e: any) { console.warn("[notify:email] failed", e.message); }
    } else {
      console.log(`[notify:email mock] → ${n.email}: ${n.title}`);
    }
  }
}
