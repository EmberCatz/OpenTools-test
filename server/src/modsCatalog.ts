import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePolarity } from "./polarityIcons.js";
import { resolveExportDir } from "./exportDir.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Same shared-across-subprojects Public Export location as itemNames.ts
// - see exportDir.ts for why this is a search, not a fixed relative path.
const EXPORT_DIR = resolveExportDir(__dirname);

// ExportUpgrades.json is MODS ONLY (1601 entries, confirmed 2026-09-21) -
// Arcanes live in a separate ExportArcanes.json with no productCategory-
// style field linking the two, so this catalog deliberately does not
// cover arcanes. SNS's RawUpgrades/Upgrades tables mix mods and arcanes
// together (both route through the same addMods() mechanism - see
// market-emulator's itemsCache.ts header comment) - db.ts's
// getModsCollection() filters owned rows down to itemTypes present in
// THIS catalog, so an owned arcane just doesn't show up on the Mods tab
// rather than rendering with a wrong/missing name. Arcanes are out of
// scope for this pass, not silently mishandled.
interface UpgradeEntry {
  name?: string;
  icon?: string;
  fusionLimit?: number;
  type?: string;
  // Real ExportUpgrades.json fields (confirmed 2026-09-23 via a raw dump
  // scan): rarity is one of COMMON/UNCOMMON/RARE/LEGENDARY (no fifth
  // "Riven" tier here - rivens are a separate randomized-mod mechanism,
  // not a rarity value in this file). polarity is one of AP_ATTACK
  // (Madurai) / AP_DEFENSE (Vazarin) / AP_TACTIC (Naramon) / AP_POWER
  // (Zenurik) / AP_WARD (Unairu) / AP_PRECEPT (Penjaga, companion mods) /
  // AP_UMBRA / AP_ANY (Aura mods' universal-fit polarity) / AP_UNIVERSAL
  // (seen only on Parazon mods and riven mod-bin placeholder templates -
  // not a real polarity a player-owned mod card would show, treated as
  // "no polarity" below). baseDrain is the mod capacity cost at rank 0;
  // see polarity.ts's drainMax comment for how the max-rank cost is
  // derived from it.
  rarity?: string;
  polarity?: string;
  baseDrain?: number;
}

// ExportUpgrades.json's real `type` field (confirmed 2026-09-22 via a raw
// dump scan - values are WARFRAME/PRIMARY/SECONDARY/MELEE/STANCE/AURA/
// PARAZON/SENTINEL/KAVAT/KUBROW/"HELMINTH CHARGER"/ARCHWING/"ARCH-GUN"/
// "ARCH-MELEE", plus "---" and a handful of missing/empty values), mapped
// to a friendly label for the Collection tab's Mods "Category" filter
// (one value per mod - the broad equipment-slot grouping). Distinct from
// modSubcategories.ts's "Subcategories" filter, which is the REAL,
// possibly-multi-valued https://wiki.warframe.com/w/Category:Mods
// subcategory list (Bow Mods, Amalgam Mods, Set Mods, etc.) scraped from
// the wiki itself - this map is this app's own coarser grouping, not
// sourced from the wiki. This is a UI grouping derived from real per-mod
// data, not a fabricated field - anything not in this map (the
// "---"/empty rows, ~97 entries) falls into "Other" rather than being
// guessed at.
const CATEGORY_LABELS: Record<string, string> = {
  WARFRAME: "Warframe",
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  MELEE: "Melee",
  STANCE: "Stance",
  AURA: "Aura",
  "ARCH-GUN": "Archwing Gun",
  "ARCH-MELEE": "Archwing Melee",
  ARCHWING: "Archwing",
  SENTINEL: "Sentinel",
  KAVAT: "Kavat",
  KUBROW: "Kubrow",
  "HELMINTH CHARGER": "Helminth Charger",
  PARAZON: "Parazon",
};

function categoryFor(type: string | undefined): string {
  if (!type) return "Other";
  return CATEGORY_LABELS[type] ?? "Other";
}

export interface ModCatalogEntry {
  itemType: string;
  name: string;
  // Raw internal packed-asset path (e.g.
  // "/Lotus/Interface/Cards/Images/Unique/ShrineMaidenNaginataAugment.png") -
  // NOT under StoreIcons like warframe/weapon icons, so localIcons.ts's
  // on-demand extraction (which only knows the StoreIcons subtree) does
  // NOT cover mods yet - this path is kept for parity with itemNames.ts's
  // CatalogEntry shape but is currently unused; icons.ts resolves mod
  // icons via WFCD's Mods.json instead (see itemIcons.ts).
  iconPath: string | null;
  // fusionLimit = the mod's real max rank (0/3/5/8/10 - confirmed via the
  // local dump, 2026-09-21), NOT a fixed 30 like equipment.
  maxRank: number;
  // See CATEGORY_LABELS above.
  category: string;
  // Raw COMMON/UNCOMMON/RARE/LEGENDARY - see UpgradeEntry's comment.
  // null for the handful of entries missing the field entirely (mirrors
  // this file's existing "Other"/"---" fallback pattern elsewhere).
  rarity: string | null;
  // Resolved via polarityIcons.ts - null (not "no polarity" text) for
  // AP_UNIVERSAL/missing, matching this file's other "don't guess, just
  // omit" conventions.
  polarity: ReturnType<typeof resolvePolarity>;
  // baseDrain at rank 0 / cost at maxRank. Standard in-game formula is
  // +1 drain per rank (confirmed against a known reference mod: Serration
  // baseDrain 4 + fusionLimit 10 = 14, its real known max-rank cost) -
  // applied uniformly here since ExportUpgrades.json has no separate
  // "cost at max rank" field to read instead. baseDrain is present on
  // every one of the 1601 catalog entries (confirmed via a full scan,
  // 2026-09-23) - null is a type-safety fallback, not an expected case.
  // Aura mods legitimately have a NEGATIVE baseDrain (e.g. -2, since
  // equipping one gives back capacity rather than costing it) - shown
  // as-is, not specially cased.
  drainMin: number | null;
  drainMax: number | null;
}

function loadCatalog(): ModCatalogEntry[] {
  let dict: Record<string, string>;
  try {
    dict = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "dict.en.json"), "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load dict.en.json from ${EXPORT_DIR} - mod names will fall back to raw paths. (${err instanceof Error ? err.message : err})`);
    dict = {};
  }

  let data: Record<string, UpgradeEntry> = {};
  try {
    data = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "ExportUpgrades.json"), "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load ExportUpgrades.json from ${EXPORT_DIR} - the Mods tab will be empty. (${err instanceof Error ? err.message : err})`);
  }

  function displayName(entry: UpgradeEntry, itemType: string): string {
    if (entry.name && dict[entry.name]) return dict[entry.name];
    const parts = itemType.split("/");
    return parts[parts.length - 1] || itemType;
  }

  const catalog: ModCatalogEntry[] = [];
  for (const [itemType, entry] of Object.entries(data)) {
    const maxRank = entry.fusionLimit ?? 0;
    catalog.push({
      itemType,
      name: displayName(entry, itemType),
      iconPath: entry.icon ?? null,
      maxRank,
      category: categoryFor(entry.type),
      rarity: entry.rarity ?? null,
      polarity: resolvePolarity(entry.polarity),
      drainMin: entry.baseDrain ?? null,
      drainMax: entry.baseDrain !== undefined ? entry.baseDrain + maxRank : null,
    });
  }
  return catalog;
}

const catalog = loadCatalog();
const byItemType = new Map(catalog.map((entry) => [entry.itemType, entry]));
console.log(`OpenTools: loaded ${catalog.length} mod catalog entries from Public Export`);

export function getModsCatalog(): ModCatalogEntry[] {
  return catalog;
}

export function getModCatalogEntry(itemType: string): ModCatalogEntry | undefined {
  return byItemType.get(itemType);
}
