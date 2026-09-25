import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExportDir } from "./exportDir.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same shared-across-subprojects Public Export location as modsCatalog.ts/
// arcanesCatalog.ts - see exportDir.ts for why this is a search, not a
// fixed relative path.
const EXPORT_DIR = resolveExportDir(__dirname);

// ExportRelics.json (3089 entries, confirmed 2026-09-24) - each real
// relic (era + name, e.g. "Lith V7") appears as up to 4 SEPARATE entries,
// one per quality tier (`quality`: VPQ_BRONZE/SILVER/GOLD/PLATINUM),
// each with its own distinct uniqueName/SNS ItemType. Grouping by
// `${era}|${category}` yields 772 distinct relics. VPQ_BRONZE->Intact/
// SILVER->Exceptional/GOLD->Flawless/PLATINUM->Radiant is NOT a guess -
// cross-referenced against the live WFCD drop feed (drops.warframestat.us),
// which uses those literal state names in that same Bronze->Platinum
// order. 2/772 relics (confirmed via a full scan) only have an Intact
// entry in this dump - `refinements` only ever contains the tiers that
// actually exist, same "don't fabricate a shape" convention
// modsCatalog.ts/arcanesCatalog.ts already use for their own missing-
// field cases. No `dict.en.json` lookup needed here - unlike mods/
// arcanes, relic entries have no translatable `name` field; the display
// name is directly `${era} ${category}` (e.g. "Lith V7").
//
// `vaultedAt` (a unix timestamp, present only on vaulted relics) is
// 100% consistent across all 4 quality variants of the same relic
// (confirmed via a full scan) - safe to read from any one variant, no
// network dependency needed for vaulted status.
interface RelicEntry {
  category?: string;
  era?: string;
  quality?: string;
  vaultedAt?: number;
}

const QUALITY_TO_REFINEMENT: Record<string, RelicRefinementCatalogEntry["refinement"]> = {
  VPQ_BRONZE: "Intact",
  VPQ_SILVER: "Exceptional",
  VPQ_GOLD: "Flawless",
  VPQ_PLATINUM: "Radiant",
};

export interface RelicRefinementCatalogEntry {
  refinement: "Intact" | "Exceptional" | "Flawless" | "Radiant";
  itemType: string;
}

export interface RelicCatalogEntry {
  // "Lith V7" - display name, also used as the React key.
  key: string;
  // Lith/Meso/Neo/Axi/Requiem/Vanguard - real values only, read from the
  // data rather than assumed exhaustive (Vanguard is a newer era not
  // otherwise documented in this project yet).
  era: string;
  // The `category` field, e.g. "V7".
  name: string;
  vaulted: boolean;
  // 1-4 entries, only the quality tiers this relic actually has.
  refinements: RelicRefinementCatalogEntry[];
}

function loadCatalog(): RelicCatalogEntry[] {
  let data: Record<string, RelicEntry> = {};
  try {
    data = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "ExportRelics.json"), "utf8"));
  } catch (err) {
    console.warn(
      `OpenTools: couldn't load ExportRelics.json from ${EXPORT_DIR} - the Relics tab will be empty. (${err instanceof Error ? err.message : err})`,
    );
  }

  interface Group {
    era: string;
    name: string;
    vaulted: boolean;
    refinements: RelicRefinementCatalogEntry[];
  }
  const groups = new Map<string, Group>();

  for (const [itemType, entry] of Object.entries(data)) {
    if (!entry.era || !entry.category || !entry.quality) continue;
    const refinement = QUALITY_TO_REFINEMENT[entry.quality];
    if (!refinement) continue; // unknown quality value - don't guess

    const key = `${entry.era}|${entry.category}`;
    let group = groups.get(key);
    if (!group) {
      group = { era: entry.era, name: entry.category, vaulted: false, refinements: [] };
      groups.set(key, group);
    }
    if (entry.vaultedAt !== undefined) group.vaulted = true;
    group.refinements.push({ refinement, itemType });
  }

  const catalog: RelicCatalogEntry[] = [];
  for (const group of groups.values()) {
    catalog.push({
      key: `${group.era} ${group.name}`,
      era: group.era,
      name: group.name,
      vaulted: group.vaulted,
      refinements: group.refinements,
    });
  }
  return catalog;
}

const catalog = loadCatalog();
console.log(`OpenTools: loaded ${catalog.length} relic catalog entries from Public Export`);

export function getRelicsCatalog(): RelicCatalogEntry[] {
  return catalog;
}
