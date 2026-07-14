import { prisma } from "./prisma.js";

// Platform settings with sensible defaults. Editable from Back Office → Pengaturan.
export const SETTING_DEFAULTS: Record<string, string> = {
  taxPct: "11", // tax & service % added on top of accommodation
  directCommissionPct: "12", // Miruum commission on DIRECT bookings
  currency: "IDR",
  appName: "Miruum",
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
