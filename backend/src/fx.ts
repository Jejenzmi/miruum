import { getSettings } from "./settings.js";

// ─────────────────────────── Currency conversion ───────────────────────────
// External bedbanks (Hotelbeds) quote in EUR/USD/etc. Miruum sells in IDR, so
// their nett prices are converted with an admin-set rate table plus a small FX
// buffer (markup %) to absorb rate movement between quote and settlement.
// Rates live in Back Office → Pengaturan (`supply_fx_rates` JSON, `supply_fx_markup_pct`).

// Sensible fallbacks so a fresh install still shows reasonable rupiah before the
// admin tunes them. These are approximations, NOT a live feed.
const DEFAULT_RATES: Record<string, number> = {
  EUR: 17500, USD: 16200, GBP: 20500, SGD: 12000, AUD: 10600, JPY: 108, MYR: 3450, THB: 460,
};

export interface FxConverter {
  (amount: number, currency: string): number;
  rates: Record<string, number>;
  markupPct: number;
}

/** Resolve the current rate table once, then convert synchronously. */
export async function fxConverter(): Promise<FxConverter> {
  const s = await getSettings();
  const rates: Record<string, number> = { ...DEFAULT_RATES };
  try { Object.assign(rates, JSON.parse(s.supply_fx_rates || "{}")); } catch { /* keep defaults */ }
  const markupPct = Math.max(0, Number(s.supply_fx_markup_pct) || 0);
  const fn = ((amount: number, currency: string): number => {
    const cur = (currency || "IDR").toUpperCase();
    if (cur === "IDR") return Math.round(amount);
    const rate = Number(rates[cur]) || 0;
    if (!rate) return Math.round(amount); // unknown currency → pass through (honest, no fake rate)
    return Math.round(amount * rate * (1 + markupPct / 100));
  }) as FxConverter;
  fn.rates = rates;
  fn.markupPct = markupPct;
  return fn;
}
