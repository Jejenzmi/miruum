import type { PrismaClient } from "@prisma/client";
import { getNum } from "./settings.js";

// ─────────────────────────── Finance & settlement ───────────────────────────
// Money flows differ by supply source:
//  • OTA sub-agent  — guest pays the marked-up price; Miruum keeps the markup
//    margin, the OTA collects the rest & pays the hotel. No hotel payout from us.
//  • DIRECT (own Channel Manager) — guest pays the hotel's rate; Miruum takes a
//    platform commission, the remainder is owed to the hotel (a Settlement).

const round = (n: number) => Math.round(n);

export async function computeFinance(prisma: PrismaClient) {
  const DIRECT_PLATFORM_PCT = await getNum("directCommissionPct"); // configurable
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["PAID", "COMPLETED"] } },
    include: {
      hotel: { select: { id: true, name: true } },
      channel: { select: { code: true, name: true, type: true, commissionPct: true } },
    },
  });

  let totalGross = 0, totalRevenue = 0, totalSupplierCost = 0, totalHotelPayout = 0;
  const byChannel: Record<string, any> = {};
  const directPayout: Record<string, { hotelId: string; name: string; gross: number; payout: number; bookings: number }> = {};

  for (const b of bookings) {
    const gross = b.roomPrice;
    const ch = b.channel;
    const isDirect = !ch || ch.type === "DIRECT";
    let revenue = 0, supplierCost = 0, hotelPayout = 0;
    if (isDirect) {
      revenue = round((gross * DIRECT_PLATFORM_PCT) / 100);
      hotelPayout = gross - revenue;
      const key = b.hotel.id;
      directPayout[key] ??= { hotelId: key, name: b.hotel.name, gross: 0, payout: 0, bookings: 0 };
      directPayout[key].gross += gross;
      directPayout[key].payout += hotelPayout;
      directPayout[key].bookings += 1;
    } else {
      const pct = ch!.commissionPct;
      revenue = round((gross * pct) / (100 + pct)); // margin embedded in the marked-up price
      supplierCost = gross - revenue;
    }
    totalGross += gross;
    totalRevenue += revenue;
    totalSupplierCost += supplierCost;
    totalHotelPayout += hotelPayout;

    const ck = isDirect ? "DIRECT" : ch!.code;
    byChannel[ck] ??= { code: ck, name: isDirect ? "Direct (Channel Manager)" : ch!.name, type: isDirect ? "DIRECT" : "OTA", bookings: 0, gross: 0, revenue: 0 };
    byChannel[ck].bookings += 1;
    byChannel[ck].gross += gross;
    byChannel[ck].revenue += revenue;
  }

  // Subtract already-disbursed settlements from each DIRECT hotel's due.
  const settlements = await prisma.settlement.groupBy({ by: ["hotelId"], _sum: { amount: true } });
  const settledByHotel: Record<string, number> = Object.fromEntries(settlements.map((s) => [s.hotelId, s._sum.amount ?? 0]));
  const payouts = Object.values(directPayout).map((h) => {
    const settled = settledByHotel[h.hotelId] ?? 0;
    return { ...h, settled, due: Math.max(0, h.payout - settled) };
  }).sort((a, b) => b.due - a.due);

  return {
    totalBookings: bookings.length,
    totalGross, totalRevenue, totalSupplierCost, totalHotelPayout,
    byChannel: Object.values(byChannel).sort((a: any, b: any) => b.revenue - a.revenue),
    payouts,
  };
}
