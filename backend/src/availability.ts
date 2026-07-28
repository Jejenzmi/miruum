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
      // No calendar row (e.g. beyond the seeded horizon): price the night with the
      // SAME weekend surcharge the calendar would apply, so the quote matches the
      // amount consume() will later charge for those dates.
      const dow = d.getUTCDay();
      const p = round1k(room.price * (dow === 5 || dow === 6 ? 1.15 : 1));
      perNight.push({ date: key, price: p });
      total += p * rooms;
    }
  }
  return { available: true, nights: dates.length, total, perNight };
}

// Atomically decrement allotment for each booked night. Returns false if any
// night with a calendar row has insufficient allotment (sold out) — the caller
// must then reject the booking to PREVENT OVERBOOKING. The `allotment: { gte }`
// guard makes each decrement race-safe (two concurrent bookings can't both win
// the last room). Nights without a calendar row fall back to the flat rate and
// are always sellable. Auto close-out: a date that hits 0 is marked closed.
export async function consume(prisma: PrismaClient, roomId: string, checkIn: Date, checkOut: Date, rooms: number): Promise<boolean> {
  const dates = nights(checkIn, checkOut);
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { price: true, stock: true } });
  if (!room) return false;
  let ok = true;
  for (const d of dates) {
    // Ensure a calendar row EXISTS for this night before decrementing. Dates beyond
    // the seeded horizon had no row and were treated as infinitely sellable — an
    // unbounded overbooking hole. Materialise it lazily from the room's stock so
    // every sold night is tracked against real allotment.
    const dow = d.getUTCDay();
    await prisma.roomAvailability.upsert({
      where: { roomId_date: { roomId, date: d } },
      create: { roomId, date: d, price: round1k(room.price * (dow === 5 || dow === 6 ? 1.15 : 1)), allotment: room.stock },
      update: {},
    });
    const r = await prisma.roomAvailability.updateMany({
      where: { roomId, date: d, allotment: { gte: rooms }, closed: false },
      data: { allotment: { decrement: rooms } },
    });
    if (r.count === 0) {
      // A row now always exists → count 0 means sold out/closed → overbooking risk, fail.
      ok = false;
    }
    // Close out any date whose allotment has reached zero (no more sales here or
    // on mapped channels once distribution is connected).
    await prisma.roomAvailability.updateMany({ where: { roomId, date: d, allotment: { lte: 0 } }, data: { closed: true } });
  }
  return ok;
}

/** Give allotment back — used when a booking is cancelled or its payment expires. */
export async function release(prisma: PrismaClient, roomId: string, checkIn: Date, checkOut: Date, rooms: number): Promise<void> {
  const dates = nights(checkIn, checkOut);
  for (const d of dates) {
    // Give the allotment back AND re-open the date — otherwise a date that sold
    // out (closed=true) stays permanently unsellable after a cancellation/expiry.
    await prisma.roomAvailability.updateMany({
      where: { roomId, date: d },
      data: { allotment: { increment: rooms }, closed: false },
    });
  }
}
