// One-off importer for the COMPLETE Indonesian region master data
// (Provinsi → Kab/Kota → Kecamatan → Desa/Kelurahan) from the open dataset
// emsifa/api-wilayah-indonesia. Region.id = official BPS code so parent links
// come straight from the source. Run once: node dist/import-regions.js
import { prisma } from "./prisma.js";

const BASE = "https://raw.githubusercontent.com/emsifa/api-wilayah-indonesia/master/data";

async function csv(name: string): Promise<string[][]> {
  const r = await fetch(`${BASE}/${name}.csv`);
  if (!r.ok) throw new Error(`${name}.csv HTTP ${r.status}`);
  const text = (await r.text()).trim();
  return text.split("\n").map((line) => line.replace(/\r$/, "").split(","));
}

async function batchInsert(rows: { id: string; name: string; level: any; parentId: string | null }[]) {
  const SIZE = 4000;
  for (let i = 0; i < rows.length; i += SIZE) {
    await prisma.region.createMany({ data: rows.slice(i, i + SIZE), skipDuplicates: true });
  }
}

async function main() {
  console.log("[regions] downloading dataset…");
  const [prov, reg, dist, vil] = await Promise.all([csv("provinces"), csv("regencies"), csv("districts"), csv("villages")]);
  console.log(`[regions] provinsi=${prov.length} kab/kota=${reg.length} kecamatan=${dist.length} desa=${vil.length}`);

  console.log("[regions] clearing old region data…");
  await prisma.region.deleteMany({});

  const clean = (s: string) => (s ?? "").replace(/^"|"$/g, "").trim();

  await batchInsert(prov.map(([id, ...name]) => ({ id: clean(id), name: clean(name.join(",")), level: "PROVINCE", parentId: null })));
  console.log("[regions] provinces done");
  await batchInsert(reg.map(([id, pid, ...name]) => ({ id: clean(id), name: clean(name.join(",")), level: "CITY", parentId: clean(pid) })));
  console.log("[regions] regencies done");
  await batchInsert(dist.map(([id, pid, ...name]) => ({ id: clean(id), name: clean(name.join(",")), level: "DISTRICT", parentId: clean(pid) })));
  console.log("[regions] districts done");
  await batchInsert(vil.map(([id, pid, ...name]) => ({ id: clean(id), name: clean(name.join(",")), level: "VILLAGE", parentId: clean(pid) })));
  console.log("[regions] villages done");

  const total = await prisma.region.count();
  console.log(`[regions] IMPORT COMPLETE — ${total} regions`);
}

main().catch((e) => { console.error("[regions] error", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
