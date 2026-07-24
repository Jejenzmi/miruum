import type { PrismaClient } from "@prisma/client";

// ─────────────────────────── Availability & rates ───────────────────────────
// Per-date rate + allotment calendar for DIRECT rooms. Booking checks the whole
// stay against it, prices per night, and decrements allotment on confirmation.
// Rooms without calendar rows fall back to the flat room.price (always sellable).

function dayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function nights(checkIn: Date, checkOut: Date): Date[] {
  const out: Date[] = [];
  let cur = dayUTC(checkIn);
  const end = dayUTC(checkOut);
  while (cur < end) { out.push(new Date(cur)); cur = new Date(cur.getTime() + 86400000); }
  return out;
}
const round1k = (n: number) => Math.round(n / 1000) * 1000;

// Build a rolling calendar so availability is date-accurate. Idempotent.
export async function seedAvailability(prisma: PrismaClient, days = 120): Promise<number> {
  const rooms = await prisma.room.findMany();
  const today = dayUTC(new Date());
  let count = 0;
  for (const room of rooms) {
    const rows: { roomId: string; date: Date; price: number; allotment: number }[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(today.getTime() + i * 86400000);
      const dow = date.getUTCDay();
      const weekend = dow === 5 || dow === 6; // Fri/Sat surcharge
      rows.push({ roomId: room.id, date, price: round1k(room.price * (weekend ? 1.15 : 1)), allotment: room.stock });
    }
    const r = await prisma.roomAvailability.createMany({ data: rows, skipDuplicates: true });
    count += r.count;
  }
  return count;
}

export interface Quote {
  available: boolean;
  reason?: string;
  nights: number;
  total: number; // for `rooms` rooms across the stay
  perNight: { date: string; price: number }[];
}

export async function quote(
  prisma: PrismaClient, roomId: string, checkIn: Date, checkOut: Date, rooms: number
): Promise<Quote> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return { available: false, reason: "Kamar tidak ditemukan", nights: 0, total: 0, perNight: [] };
  const dates = nights(checkIn, checkOut);
  if (dates.length === 0) return { available: false, reason: "Tanggal tidak valid", nights: 0, total: 0, perNight: [] };

  const rows = await prisma.roomAvailability.findMany({
    where: { roomId, date: { in: dates } },
  });
  const byDate: Record<string, (typeof rows)[number]> = Object.fromEntries(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  const perNight: { date: string; price: number }[] = [];
  let total = 0;
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    const row = byDate[key];
    if (row) {
      if (row.closed || row.allotment < rooms)
        return { available: false, reason: `Tidak tersedia untuk ${key}`, nights: dates.length, total: 0, perNight: [] };
      perNight.push({ date: key, price: row.price });
      total += row.price * rooms;
    } else {
      perNight.push({ date: key, price: room.price }); // fallback flat rate
      total += room.price * rooms;
    }
  }
  return { available: true, nights: dates.length, total, perNight };
}

// Decrement allotment for each booked night (rows that exist).
export async function consume(prisma: PrismaClient, roomId: string, checkIn: Date, checkOut: Date, rooms: number): Promise<void> {
  const dates = nights(checkIn, checkOut);
  for (const d of dates) {
    await prisma.roomAvailability.updateMany({
      where: { roomId, date: d, allotment: { gte: rooms } },
      data: { allotment: { decrement: rooms } },
    });
  }
}

/** Give allotment back — used when a booking is cancelled or its payment expires. */
export async function release(prisma: PrismaClient, roomId: string, checkIn: Date, checkOut: Date, rooms: number): Promise<void> {
  const dates = nights(checkIn, checkOut);
  for (const d of dates) {
    await prisma.roomAvailability.updateMany({
      where: { roomId, date: d },
      data: { allotment: { increment: rooms } },
    });
  }
}
