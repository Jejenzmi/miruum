import { prisma } from "./prisma.js";

// Platform settings with sensible defaults. Editable from Back Office → Pengaturan.
export const SETTING_DEFAULTS: Record<string, string> = {
  taxPct: "11", // tax & service % added on top of accommodation
  directCommissionPct: "12", // Miruum commission on DIRECT bookings
  currency: "IDR",
  appName: "Miruum",
  // Cancellation refund policy (configurable).
  refundCutoffHours: "24",  // must cancel more than this many hours before check-in
  refundFullPct: "100",     // refund % for free-cancellation rooms within the window
  refundPartialPct: "50",   // refund % for refundable (non-free) rooms within the window
  // Mobile app update prompt (shown by the app on launch).
  app_latest_version: "", // e.g. "1.1.0" — newer than this → optional update popup
  app_min_version: "",     // e.g. "1.1.0" — older than this → forced update popup
  app_update_url: "https://ota.gokar.id/ota.apk",
  app_update_notes: "",
  // Loyalty points.
  loyaltyEnabled: "1",
  loyaltyEarnPer: "10000",   // earn 1 point per this many Rupiah of room spend
  loyaltyRedeemValue: "100", // each point is worth this many Rupiah when redeemed
  loyaltyMaxRedeemPct: "30", // points can cover at most this % of a booking
  // Rate parity monitor: flag channels deviating more than this % from the reference.
  parityTolerancePct: "2",
  // App module toggles — "1" shows the module in the mobile app, "0" hides it.
  moduleHotelPackage: "1",
  moduleTour: "1",
  moduleShuttle: "1",
};

let cache: Record<string, string> | null = null;

export async function getSettings(): Promise<Record<string, string>> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  cache = { ...SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  return cache;
}

export async function getNum(key: string): Promise<number> {
  return Number((await getSettings())[key]);
}

export async function setSettings(kv: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(kv)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  cache = null;
}
