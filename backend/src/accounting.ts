import type { PrismaClient } from "@prisma/client";

// ─────────────────────── Double-entry accounting ───────────────────────
// A per-hotel General Ledger. Revenue, tax, cash and receivables are posted
// as balanced journals derived idempotently from the source records (bookings,
// folio charges, folio payments), so re-posting never double-counts. From the
// ledger we derive Buku Besar, Neraca Saldo, Laba Rugi and Neraca.

type Tx = PrismaClient;

// Standard hotel chart of accounts (Indonesian-labelled).
export const STANDARD_COA: Array<{ code: string; name: string; type: string; normalBalance: "DEBIT" | "CREDIT"; parentCode?: string }> = [
  // Aset
  { code: "1000", name: "Kas", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1100", name: "Bank", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1200", name: "Piutang Usaha (Guest & City Ledger)", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1300", name: "Persediaan", type: "ASSET", normalBalance: "DEBIT" },
  // Liabilitas
  { code: "2000", name: "Utang Usaha", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2100", name: "PPN Keluaran", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2200", name: "Deposit Tamu", type: "LIABILITY", normalBalance: "CREDIT" },
  // Ekuitas
  { code: "3000", name: "Modal", type: "EQUITY", normalBalance: "CREDIT" },
  { code: "3900", name: "Laba Ditahan", type: "EQUITY", normalBalance: "CREDIT" },
  // Pendapatan
  { code: "4000", name: "Pendapatan Kamar", type: "REVENUE", normalBalance: "CREDIT" },
  { code: "4100", name: "Pendapatan F&B", type: "REVENUE", normalBalance: "CREDIT" },
  { code: "4200", name: "Pendapatan Minibar", type: "REVENUE", normalBalance: "CREDIT" },
  { code: "4300", name: "Pendapatan Laundry", type: "REVENUE", normalBalance: "CREDIT" },
  { code: "4400", name: "Pendapatan Spa", type: "REVENUE", normalBalance: "CREDIT" },
  { code: "4900", name: "Pendapatan Lain-lain", type: "REVENUE", normalBalance: "CREDIT" },
  // Beban
  { code: "5000", name: "Beban Operasional", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "6000", name: "Beban Gaji", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "6100", name: "Beban Utilitas", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "6900", name: "Beban Lain-lain", type: "EXPENSE", normalBalance: "DEBIT" },
];

// Folio charge kind → revenue account.
const KIND_REVENUE: Record<string, string> = { ROOM: "4000", FNB: "4100", MINIBAR: "4200", LAUNDRY: "4300", SPA: "4400", OTHER: "4900" };
// Payment method → cash/bank account.
function cashAccount(method?: string | null): string {
  const m = (method || "").toUpperCase();
  if (m === "CASH") return "1000";
  if (m === "CITY_LEDGER") return "1200"; // reclass within receivables
  return "1100"; // CARD | QRIS | EWALLET | TRANSFER | VA_* | bank transfer
}

export async function seedCoa(prisma: Tx, hotelId: string): Promise<number> {
  let created = 0;
  for (const a of STANDARD_COA) {
    const exists = await prisma.glAccount.findUnique({ where: { hotelId_code: { hotelId, code: a.code } } as any });
    if (!exists) {
      await prisma.glAccount.create({ data: { hotelId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance, parentCode: a.parentCode || null } });
      created++;
    }
  }
  return created;
}

async function acctMap(prisma: Tx, hotelId: string): Promise<Record<string, string>> {
  const accs = await prisma.glAccount.findMany({ where: { hotelId } });
  const map: Record<string, string> = {};
  for (const a of accs) map[a.code] = a.id;
  return map;
}

// Create one balanced journal (validates Σdebit == Σcredit). Replaces any prior
// journal with the same (hotelId, ref) so rebuilds are idempotent.
async function upsertJournal(prisma: Tx, hotelId: string, ref: string, date: Date, source: string, description: string, lines: Array<{ code: string; debit?: number; credit?: number; memo?: string }>, map: Record<string, string>) {
  const totalD = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (totalD !== totalC) throw new Error(`Jurnal tidak balance (${ref}): D=${totalD} C=${totalC}`);
  if (totalD === 0) return; // nothing to post
  await prisma.glJournal.deleteMany({ where: { hotelId, ref } });
  await prisma.glJournal.create({
    data: {
      hotelId, date, ref, source, description,
      lines: { create: lines.filter((l) => (l.debit || 0) !== 0 || (l.credit || 0) !== 0).map((l) => ({ accountId: map[l.code], debit: BigInt(l.debit || 0), credit: BigInt(l.credit || 0), memo: l.memo || null })) },
    },
  });
}

// Rebuild all automatic journals for a hotel from source records (idempotent).
export async function rebuildGl(prisma: Tx, hotelId: string): Promise<{ journals: number }> {
  await seedCoa(prisma, hotelId);
  const map = await acctMap(prisma, hotelId);

  // Wipe only auto-posted journals (keep MANUAL and CLOSING entries).
  await prisma.glJournal.deleteMany({ where: { hotelId, source: { notIn: ["MANUAL", "CLOSING"] } } });

  const bookings = await prisma.booking.findMany({
    where: { hotelId, status: { in: ["PAID", "COMPLETED", "PENDING"] } },
    include: { folioCharges: true, folioPayments: true },
  });

  for (const b of bookings) {
    const recDate = b.checkedInAt || b.checkIn || b.createdAt;
    const room = Number(b.roomPrice);
    const tax = Number(b.taxFee);
    // 1) Room revenue accrual: Dr AR, Cr Room Revenue + Cr PPN.
    if (room > 0 || tax > 0) {
      await upsertJournal(prisma, hotelId, `ROOM-${b.code}`, recDate, "ROOM", `Pendapatan kamar ${b.code} — ${b.bookerName}`, [
        { code: "1200", debit: room + tax, memo: "Guest ledger" },
        { code: "4000", credit: room, memo: "Kamar" },
        { code: "2100", credit: tax, memo: "PPN keluaran" },
      ], map);
    }
    // 2) Folio non-room charges: Dr AR, Cr revenue-by-kind.
    for (const c of b.folioCharges) {
      if (c.kind === "ROOM") continue; // room handled above (avoid double count)
      const amt = Number(c.amount) * (c.qty || 1);
      if (amt <= 0) continue;
      const rev = KIND_REVENUE[c.kind] || "4900";
      await upsertJournal(prisma, hotelId, `FOLIO-${c.id}`, c.createdAt, "FOLIO", `${c.kind} ${b.code} — ${c.description}`, [
        { code: "1200", debit: amt, memo: "Guest ledger" },
        { code: rev, credit: amt, memo: c.description },
      ], map);
    }
    // 3) Prepayment (booking marked paid): Dr Cash/Bank, Cr AR.
    if (b.paidAt && (b.status === "PAID" || b.status === "COMPLETED")) {
      const paid = room + tax;
      if (paid > 0) {
        await upsertJournal(prisma, hotelId, `PREPAY-${b.code}`, b.paidAt, "PREPAY", `Pembayaran ${b.code} — ${b.bookerName}`, [
          { code: cashAccount(b.paymentMethod), debit: paid, memo: b.paymentMethod || "Bayar" },
          { code: "1200", credit: paid, memo: "Pelunasan guest ledger" },
        ], map);
      }
    }
    // 4) Cashier folio payments (settle extras): Dr Cash/Bank, Cr AR.
    for (const p of b.folioPayments) {
      const amt = Number(p.amount);
      if (amt <= 0) continue;
      await upsertJournal(prisma, hotelId, `PAY-${p.id}`, p.createdAt, "PAYMENT", `Pembayaran folio ${b.code} — ${p.method}`, [
        { code: cashAccount(p.method), debit: amt, memo: p.method },
        { code: "1200", credit: amt, memo: "Pelunasan folio" },
      ], map);
    }
  }

  const journals = await prisma.glJournal.count({ where: { hotelId } });
  return { journals };
}

// ── Report builders ──
async function balances(prisma: Tx, hotelId: string, opts: { asOf?: Date; from?: Date; to?: Date; excludeClosing?: boolean } = {}) {
  const dateWhere: any = {};
  if (opts.asOf) dateWhere.lte = opts.asOf;
  if (opts.from) dateWhere.gte = opts.from;
  if (opts.to) dateWhere.lte = opts.to;
  const journals = await prisma.glJournal.findMany({
    where: { hotelId, ...(Object.keys(dateWhere).length ? { date: dateWhere } : {}), ...(opts.excludeClosing ? { source: { not: "CLOSING" } } : {}) },
    include: { lines: true },
  });
  const accs = await prisma.glAccount.findMany({ where: { hotelId }, orderBy: { code: "asc" } });
  const byId: Record<string, { debit: number; credit: number }> = {};
  for (const j of journals) for (const l of j.lines) {
    const e = (byId[l.accountId] ||= { debit: 0, credit: 0 });
    e.debit += Number(l.debit); e.credit += Number(l.credit);
  }
  return accs.map((a) => {
    const e = byId[a.id] || { debit: 0, credit: 0 };
    const net = a.normalBalance === "DEBIT" ? e.debit - e.credit : e.credit - e.debit;
    return { code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance, debit: e.debit, credit: e.credit, balance: net };
  });
}

export async function trialBalance(prisma: Tx, hotelId: string, asOf?: Date) {
  const rows = (await balances(prisma, hotelId, { asOf })).filter((r) => r.debit !== 0 || r.credit !== 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function incomeStatement(prisma: Tx, hotelId: string, from?: Date, to?: Date) {
  // Exclude closing entries so the P&L always shows operational figures even
  // after the period is closed.
  const rows = await balances(prisma, hotelId, { from, to, excludeClosing: true });
  const revenue = rows.filter((r) => r.type === "REVENUE" && r.balance !== 0);
  const expense = rows.filter((r) => r.type === "EXPENSE" && r.balance !== 0);
  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expense.reduce((s, r) => s + r.balance, 0);
  return { revenue, expense, totalRevenue, totalExpense, netIncome: totalRevenue - totalExpense };
}

export async function balanceSheet(prisma: Tx, hotelId: string, asOf?: Date) {
  const rows = await balances(prisma, hotelId, { asOf });
  const assets = rows.filter((r) => r.type === "ASSET" && r.balance !== 0);
  const liabilities = rows.filter((r) => r.type === "LIABILITY" && r.balance !== 0);
  const equity = rows.filter((r) => r.type === "EQUITY" && r.balance !== 0);
  // Current-period profit rolls into equity (before it is closed to Laba Ditahan).
  const revenue = rows.filter((r) => r.type === "REVENUE").reduce((s, r) => s + r.balance, 0);
  const expense = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + r.balance, 0);
  const currentEarnings = revenue - expense;
  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0) + currentEarnings;
  return { assets, liabilities, equity, currentEarnings, totalAssets, totalLiabilities, totalEquity, balanced: totalAssets === totalLiabilities + totalEquity };
}

export async function generalLedger(prisma: Tx, hotelId: string, code?: string, from?: Date, to?: Date) {
  const accs = await prisma.glAccount.findMany({ where: { hotelId, ...(code ? { code } : {}) }, orderBy: { code: "asc" } });
  const dateWhere: any = {};
  if (from) dateWhere.gte = from;
  if (to) dateWhere.lte = to;
  const out: any[] = [];
  for (const a of accs) {
    const lines = await prisma.glLine.findMany({
      where: { accountId: a.id, ...(Object.keys(dateWhere).length ? { journal: { date: dateWhere } } : {}) },
      include: { journal: true },
      orderBy: { journal: { date: "asc" } },
    });
    if (!lines.length) continue;
    let running = 0;
    const rows = lines.map((l) => {
      const d = Number(l.debit); const c = Number(l.credit);
      running += a.normalBalance === "DEBIT" ? d - c : c - d;
      return { date: l.journal.date, ref: l.journal.ref, description: l.journal.description, memo: l.memo, debit: d, credit: c, balance: running };
    });
    out.push({ code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance, rows, closing: running });
  }
  return out;
}

// ── Tutup buku (period closing) ──
// Zeroes revenue & expense accounts as of `asOf` and moves the net to Laba
// Ditahan (3900). Residual balances (incl. any earlier closing) are used, so
// each close only captures activity since the previous close.
export async function closeBooks(prisma: Tx, hotelId: string, asOf: Date, createdBy?: string) {
  await seedCoa(prisma, hotelId);
  const map = await acctMap(prisma, hotelId);
  const rows = await balances(prisma, hotelId, { asOf }); // include prior CLOSING → residual since last close
  const revenue = rows.filter((r) => r.type === "REVENUE" && r.balance !== 0);
  const expense = rows.filter((r) => r.type === "EXPENSE" && r.balance !== 0);
  const totalRev = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExp = expense.reduce((s, r) => s + r.balance, 0);
  const net = totalRev - totalExp;
  if (!revenue.length && !expense.length) return { ok: false, message: "Tidak ada pendapatan/beban untuk ditutup pada periode ini.", net: 0 };

  const lines: Array<{ accountId: string; debit: bigint; credit: bigint; memo?: string }> = [];
  for (const r of revenue) lines.push({ accountId: map[r.code], debit: BigInt(r.balance), credit: 0n, memo: "Tutup pendapatan" });
  for (const e of expense) lines.push({ accountId: map[e.code], debit: 0n, credit: BigInt(e.balance), memo: "Tutup beban" });
  // Plug Laba Ditahan (3900): profit → credit, loss → debit.
  if (net > 0) lines.push({ accountId: map["3900"], debit: 0n, credit: BigInt(net), memo: "Laba bersih periode" });
  else if (net < 0) lines.push({ accountId: map["3900"], debit: BigInt(-net), credit: 0n, memo: "Rugi bersih periode" });

  const journal = await prisma.glJournal.create({
    data: { hotelId, date: asOf, source: "CLOSING", ref: `CLOSE-${asOf.toISOString().slice(0, 10)}`, description: `Tutup buku per ${asOf.toLocaleDateString("id-ID")}`, createdBy: createdBy || null, lines: { create: lines } },
  });
  const rec = await prisma.glPeriodClose.create({ data: { hotelId, asOf, netIncome: BigInt(net), journalId: journal.id, createdBy: createdBy || null } });
  return { ok: true, net, journalId: journal.id, closeId: rec.id };
}

export async function reopenClose(prisma: Tx, hotelId: string, closeId: string) {
  const rec = await prisma.glPeriodClose.findFirst({ where: { id: closeId, hotelId } });
  if (!rec) return { ok: false, message: "Data tutup buku tidak ditemukan" };
  if (rec.journalId) await prisma.glJournal.deleteMany({ where: { id: rec.journalId, hotelId } });
  await prisma.glPeriodClose.delete({ where: { id: rec.id } });
  return { ok: true };
}

export async function listClosings(prisma: Tx, hotelId: string) {
  return prisma.glPeriodClose.findMany({ where: { hotelId }, orderBy: { asOf: "desc" } });
}
