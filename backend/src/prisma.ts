import { PrismaClient } from "@prisma/client";

// Money totals/amounts are stored as BigInt (INT8) to avoid INT4 overflow
// (~Rp2.14B). So res.json() never chokes on a BigInt, serialize it as a plain
// number (Rupiah values stay well under 2^53, so the conversion is exact).
(BigInt.prototype as any).toJSON = function () {
  const n = Number(this);
  return Number.isSafeInteger(n) ? n : this.toString();
};

export const prisma = new PrismaClient();
