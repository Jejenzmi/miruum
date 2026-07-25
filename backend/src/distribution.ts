import type { PrismaClient } from "@prisma/client";

// ─────────────────────────── Outbound distribution ───────────────────────────
// Push DIRECT rate & availability OUT to mapped OTA room types. Each mapping's
// channel must carry a real gateway config (a push endpoint). When it does, we
// perform a REAL HTTP push and record the actual result. When it doesn't, we
// record an honest "not connected" status and skip — we never fake a success.
//
// For managed distribution to many OTAs at once, connect Channex (channel
// manager) in Back Office → Integrasi instead of per-OTA endpoints.

function dayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// A channel is push-ready only if its stored config has a real endpoint URL.
function pushEndpoint(config: unknown): { url: string; token?: string } | null {
  if (config && typeof config === "object") {
    const c = config as any;
    const url = c.pushUrl || c.pushEndpoint || c.baseUrl || c.url;
    if (typeof url === "string" && /^https?:\/\//.test(url)) return { url, token: c.apiKey || c.token };
  }
  return null;
}

// Push host-to-host to every connected OTA. Pass `ownerId` to scope to one
// partner hotel's inventory (the partner-facing Channel Manager at chanel.miruum.id).
export async function pushDistribution(prisma: PrismaClient, ownerId?: string): Promise<{ pushed: number; skipped: number }> {
  const maps = await prisma.roomChannelMap.findMany({
    where: {
      enabled: true,
      channel: { type: "OTA", active: true },
      ...(ownerId ? { room: { hotel: { ownerId } } } : {}),
    },
    include: { room: true, channel: true },
  });
  let pushed = 0, skipped = 0;
  const from = dayUTC(new Date());
  const to = new Date(from.getTime() + 30 * 86400000);

  for (const m of maps) {
    const avail = await prisma.roomAvailability.findMany({
      where: { roomId: m.roomId, date: { gte: from, lte: to } },
    });
    if (avail.length === 0) {
      skipped++;
      await prisma.roomChannelMap.update({ where: { id: m.id }, data: { pushStatus: "Belum ada kalender" } });
      continue;
    }
    const ep = pushEndpoint((m.channel as any).config);
    if (!ep) {
      // No real endpoint configured → honest status, not a fake success.
      skipped++;
      await prisma.roomChannelMap.update({ where: { id: m.id }, data: { pushStatus: "Belum terhubung — hubungkan API channel" } });
      continue;
    }
    try {
      // REAL host-to-host push to the channel's configured endpoint.
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}) },
        body: JSON.stringify({
          externalRoomId: m.externalRoomId,
          channel: m.channel.code,
          availability: avail.map((a) => ({ date: a.date.toISOString().slice(0, 10), price: a.price, allotment: a.allotment, closed: a.closed })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await prisma.roomChannelMap.update({
        where: { id: m.id },
        data: { lastPushedAt: new Date(), pushStatus: `OK · ${avail.length} tanggal terkirim` },
      });
      pushed++;
    } catch (e: any) {
      await prisma.roomChannelMap.update({ where: { id: m.id }, data: { pushStatus: "Gagal: " + e.message } });
    }
  }
  return { pushed, skipped };
}
