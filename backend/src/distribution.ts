import type { PrismaClient } from "@prisma/client";

// ─────────────────────────── Outbound distribution ───────────────────────────
// Push DIRECT rate & availability OUT to mapped OTA room types. This is the
// reverse of the connector gateway (which pulls IN). MOCK for now: records a
// push status per mapping. Swap the marked block for a real OTA push API call
// (using the channel's gateway config + map.externalRoomId) once credentials
// are available — nothing else changes.

function dayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
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
    try {
      // ── REAL PUSH GOES HERE ──
      // await pushToOta(m.channel, m.externalRoomId, avail);  // uses channel.config
      // MOCK: pretend the push succeeded.
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
