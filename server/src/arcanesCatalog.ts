import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same shared-across-subprojects Public Export location as modsCatalog.ts.
const EXPORT_DIR =
  process.env.OPENTOOLS_PUBLIC_EXPORT_DIR ??
  path.join(__dirname, "..", "..", "..", "database_scrapes", "warframe-public-export-plus-senpai");

// ExportArcanes.json (177 entries, confirmed 2026-09-24) - a separate
// file from ExportUpgrades.json (Mods). Arcanes and Mods share the same
// underlying SNS RawUpgrades/Upgrades mechanism (see modsCatalog.ts's
// header comment) but are a genuinely distinct item family in Public
// Export, so this gets its own catalog module rather than folding into
// modsCatalog.ts.
//
// `fusionLimit` (same field name/meaning as ExportUpgrades.json - max
// rank) IS present here too, on all 177/177 entries - confirmed
// 2026-09-24 to always agree with `levelStats.length - 1` whenever
// levelStats also exists, and varies per-arcane (5 for the standard
// post-rework tier, 3 for a handful of older Warframe-slot arcanes), so
// this reads `fusionLimit` directly (mirroring modsCatalog.ts) rather
// than re-deriving it. 9/177 entries (four internal per-ability-slot
// "Listener" duplicates of the same arcane, five unreleased "Antiques"-
// prefixed entries) have no `levelStats` at all but DO still have a
// real `fusionLimit` (5) - reading it directly avoids a real bug an
// earlier levelStats-derived version had, which wrongly zeroed these 9
// out to maxRank 0.
interface ArcaneEntry {
  name?: string;
  rarity?: string;
  fusionLimit?: number;
}

export interface ArcaneCatalogEntry {
  itemType: string;
  name: string;
  // See this file's header comment.
  maxRank: number;
  // Raw COMMON/UNCOMMON/RARE/LEGENDARY - same enum modsCatalog.ts reads
  // from ExportUpgrades.json. null for the handful of entries missing it.
  rarity: string | null;
}

function loadCatalog(): ArcaneCatalogEntry[] {
  let dict: Record<string, string> = {};
  try {
    dict = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "dict.en.json"), "utf8"));
  } catch (err) {
    console.warn(
      `OpenTools: couldn't load dict.en.json from ${EXPORT_DIR} - arcane names will fall back to raw paths. (${err instanceof Error ? err.message : err})`,
    );
  }

  let data: Record<string, ArcaneEntry> = {};
  try {
    data = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "ExportArcanes.json"), "utf8"));
  } catch (err) {
    console.warn(
      `OpenTools: couldn't load ExportArcanes.json from ${EXPORT_DIR} - the Arcanes tab will be empty. (${err instanceof Error ? err.message : err})`,
    );
  }

  function displayName(entry: ArcaneEntry, itemType: string): string {
    if (entry.name && dict[entry.name]) return dict[entry.name];
    const parts = itemType.split("/");
    return parts[parts.length - 1] || itemType;
  }

  const catalog: ArcaneCatalogEntry[] = [];
  for (const [itemType, entry] of Object.entries(data)) {
    catalog.push({
      itemType,
      name: displayName(entry, itemType),
      maxRank: entry.fusionLimit ?? 0,
      rarity: entry.rarity ?? null,
    });
  }
  return catalog;
}

const catalog = loadCatalog();
console.log(`OpenTools: loaded ${catalog.length} arcane catalog entries from Public Export`);

export function getArcanesCatalog(): ArcaneCatalogEntry[] {
  return catalog;
}
