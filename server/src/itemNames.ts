import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// database_scrapes/ lives at the OPENWF _ Modding project root, shared
// across subprojects (see ../../CLAUDE.md's directory map) - not copied
// into this repo. Overridable for tests/other environments.
const EXPORT_DIR =
  process.env.OPENTOOLS_PUBLIC_EXPORT_DIR ??
  path.join(__dirname, "..", "..", "..", "database_scrapes", "warframe-public-export-plus-senpai");

// Maps our confirmed equipment categories (see DEVLOG.md's 2026-09-21
// field-shape entries) to the Public Export file that defines them, and
// (for categories where the category name doesn't cleanly equal Public
// Export's own productCategory value) a custom matcher. Public Export is
// the local/offline/authoritative source per this project's own
// convention (../../CLAUDE.md) - used for BOTH the full catalog (what
// items exist at all) and their names, unlike icons (see itemIcons.ts)
// which have no usable local source.
//
// Category names deliberately reuse SpaceNinjaServer's OWN inventory key
// names (SpaceSuits/SpaceGuns/SpaceMelee/Hoverboards - confirmed live via
// this machine's local SNS checkout, src/types/inventoryTypes/
// inventoryTypes.ts's `equipmentKeys` const, 2026-09-21) rather than
// inventing new ones (e.g. "ArchwingSuits") - rank.ts's
// CATEGORIES_NOT_HALVED already anticipated exactly these names ("kept
// here for when/if this app ever tracks those categories"), so reusing
// them means zero rank.ts changes needed and the Pluto sync script's
// EQUIPMENT_CATEGORIES list can read `inv[category]` uniformly for every
// entry here, no translation layer.
interface CategorySource {
  file: string;
  // Defaults to `entry.productCategory === category` when omitted.
  matches?: (entry: ExportEntry) => boolean;
}

// K-Drive part components (Deck/Engine/Front/Jet) carry
// `productCategory: "Pistols"` in Public Export - a real Digital
// Extremes data quirk, confirmed 2026-09-21 by reading a sample entry's
// full JSON (HoverboardCorpusADeck) directly, NOT a guess - which means
// the plain productCategory-equality check would silently lump all 20 of
// them into the Sidearms tab (a real bug, reported by the user
// 2026-09-21: "K-Drive... Weapons section"). The one reliable
// distinguishing field is `partType`, which starts with "LWPT_HB_" only
// on these 20 entries (confirmed exhaustively - grepped every entry in
// ExportWeapons.json, all 20 matches are exactly the 4 part types x 5
// cosmetic themes expected, zero false positives/negatives).
function isKDrivePart(entry: ExportEntry): boolean {
  return !!entry.partType && entry.partType.startsWith("LWPT_HB_");
}

// Same quirk as isKDrivePart above, different offender: Zaw components
// (Ostron/Melee/ModularMelee*'s Strike/Grip/Link pieces, real names like
// "Balla"/"Ooltha"/"Dokrahm") AND Kitgun components (SolarisUnited's
// Chamber/Grip/Loader pieces, real names like "Catchmoon"/"Tombfinger",
// plus the Infested Kitgun line under Infested/Pistols/InfKitGun and a
// SolarisUnited/Primary modular-primary line) ALL carry
// `productCategory: "Pistols"` too - confirmed 2026-09-25 by reading
// every ExportWeapons.json entry's own `partType` field: these 81
// entries are the ONLY ones (out of 328 total "Pistols" entries) whose
// partType is one of the 7 values below, and every one of those 81 lives
// under exactly the 3 paths named above - zero false positives/negatives,
// same exhaustive-grep confirmation method as isKDrivePart. Without this,
// the plain productCategory check would lump all of them (including the
// Zaw MELEE pieces) into the Sidearms tab. Split into two separate
// checks (2026-09-25, same day as the original split) per a follow-up
// user request to give Zaw parts and Kitgun parts their own category
// sections instead of one combined one - the partType values themselves
// already cleanly separate by weapon system, no new data needed.
const ZAW_PART_TYPES = new Set(["LWPT_BLADE", "LWPT_HILT", "LWPT_HILT_WEIGHT"]);
const KITGUN_PART_TYPES = new Set([
  "LWPT_GUN_BARREL",
  "LWPT_GUN_CLIP",
  "LWPT_GUN_PRIMARY_HANDLE",
  "LWPT_GUN_SECONDARY_HANDLE",
]);
function isZawPart(entry: ExportEntry): boolean {
  return !!entry.partType && ZAW_PART_TYPES.has(entry.partType);
}
function isKitgunPart(entry: ExportEntry): boolean {
  return !!entry.partType && KITGUN_PART_TYPES.has(entry.partType);
}

const CATEGORY_SOURCES: Record<string, CategorySource> = {
  Suits: { file: "ExportWarframes.json" },
  LongGuns: { file: "ExportWeapons.json" },
  Pistols: {
    file: "ExportWeapons.json",
    matches: (e) => e.productCategory === "Pistols" && !isKDrivePart(e) && !isZawPart(e) && !isKitgunPart(e),
  },
  Melee: { file: "ExportWeapons.json" },
  // Zaw and Kitgun raw components, split out of Pistols into their own
  // Collection sub-categories (2026-09-25, user request, then further
  // split into two on the same day per a follow-up ask) - see
  // isZawPart/isKitgunPart's comment above for why they'd otherwise land
  // in Sidearms (including the Zaw MELEE pieces).
  ZawParts: { file: "ExportWeapons.json", matches: (e) => isZawPart(e) },
  KitgunParts: { file: "ExportWeapons.json", matches: (e) => isKitgunPart(e) },
  Sentinels: { file: "ExportSentinels.json" },
  // Added 2026-09-21 for companion weapon tracking (see DEVLOG.md's
  // "Leads from WFHelper's source" entry) - confirmed live in the local
  // Public Export dump: ExportWeapons.json has 24 entries with
  // productCategory "SentinelWeapons" (e.g. Verglas), same file/filter
  // pattern as LongGuns/Pistols/Melee above. This is a real, confirmed
  // catalog source - separate from whether the SYNC SCRIPT's SNS
  // inventory.php read of this category is confirmed (it isn't yet).
  SentinelWeapons: { file: "ExportWeapons.json" },
  // Archwing suits/Arch-Guns/Arch-Melee and K-Drive parts - added
  // 2026-09-21 (see DEVLOG.md's "Archwing/K-Drive" entry). Catalog source
  // confirmed via Public Export (ExportWarframes.json's "SpaceSuits"
  // productCategory: 5 real entries - Amesha/Itzal/Odonata/Odonata Prime/
  // Elytron; ExportWeapons.json's "SpaceGuns"/"SpaceMelee": confirmed
  // real player weapons AND, in SpaceGuns' case, one contaminating
  // ENEMY-ONLY asset reusing the "Imperator Vandal" display name
  // (itemType under /Lotus/Types/.../Enemies/... - excluded below).
  // SYNC (whether SNS's real inventory.php actually reports these
  // categories under these exact key names for a live account) is
  // UNATTESTED - see the Pluto script's header comment.
  SpaceSuits: { file: "ExportWarframes.json", matches: (e) => e.productCategory === "SpaceSuits" },
  SpaceGuns: { file: "ExportWeapons.json", matches: (e) => e.productCategory === "SpaceGuns" },
  SpaceMelee: { file: "ExportWeapons.json", matches: (e) => e.productCategory === "SpaceMelee" },
  Hoverboards: { file: "ExportWeapons.json", matches: (e) => isKDrivePart(e) },
};

interface ExportEntry {
  name?: string;
  productCategory?: string;
  icon?: string;
  maxLevelCap?: number;
  // Mastery Rank required to USE the item (not to build/acquire it).
  // Confirmed 2026-09-25 in the local Public Export dump: present as a
  // real number on every weapon-like category (LongGuns/Pistols/Melee/
  // SpaceGuns/SpaceMelee/SentinelWeapons/...), always 0 on Warframes
  // (real in-game rule - a Warframe has no Mastery Rank requirement to
  // use once built), and absent entirely on Sentinels/companions (same
  // rule - no requirement field at all rather than a 0).
  masteryReq?: number;
  // K-Drive-part identifier - see isKDrivePart()'s comment above.
  partType?: string;
}

export interface CatalogEntry {
  itemType: string;
  category: string;
  name: string;
  // Raw internal packed-asset path from Public Export (e.g.
  // "/Lotus/Interface/Icons/StoreIcons/Weapons/PrimaryWeapons/Weapons/Paris.png").
  // Not a URL - see itemIcons.ts for how this gets turned into something
  // actually servable. Null if Public Export didn't have one.
  iconPath: string | null;
  // Rank cap for rank.ts's XP curve - almost always absent (defaults to
  // 30). Present on ~52 weapons (mostly Kuva/Tenet/Coda "Legendary"
  // gear, confirmed in the local Public Export dump 2026-09-21) that can
  // rank past 30 with a Legendary Core.
  maxLevelCap: number | null;
  // Mastery Rank required to use the item - see ExportEntry.masteryReq's
  // comment. null when Public Export has no such field at all
  // (Sentinels/companions); 0 is a real, distinct value (Warframes, and
  // starter/MR0 weapons) meaning "no requirement" - the UI only shows a
  // badge when this is a positive number, matching the real in-game
  // Arsenal (which never shows "Mastery Rank 0 Required").
  masteryReq: number | null;
}

function loadCatalog(): CatalogEntry[] {
  let dict: Record<string, string>;
  try {
    dict = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "dict.en.json"), "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load dict.en.json from ${EXPORT_DIR} - item names will fall back to raw paths. (${err instanceof Error ? err.message : err})`);
    dict = {};
  }

  const fileCache = new Map<string, Record<string, ExportEntry>>();
  function loadFile(file: string): Record<string, ExportEntry> {
    if (fileCache.has(file)) return fileCache.get(file)!;
    let data: Record<string, ExportEntry> = {};
    try {
      data = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), "utf8"));
    } catch (err) {
      console.warn(`OpenTools: couldn't load ${file} from ${EXPORT_DIR} - that category's catalog will be empty. (${err instanceof Error ? err.message : err})`);
    }
    fileCache.set(file, data);
    return data;
  }

  function displayName(entry: ExportEntry, itemType: string): string {
    let name = entry.name && dict[entry.name] ? dict[entry.name] : null;
    if (!name) {
      const parts = itemType.split("/");
      name = parts[parts.length - 1] || itemType;
    }
    // Archwing suits/weapons resolve with a literal "<ARCHWING> " prefix
    // baked into the localization string itself (confirmed 2026-09-21 -
    // e.g. dict.en.json resolves "/Lotus/Language/.../ArchSwordName" to
    // "<ARCHWING> Veritux", not "Veritux") - an internal codex-grouping
    // tag, not part of the real in-game display name, so it's stripped
    // here rather than shown verbatim.
    return name.replace(/^<ARCHWING>\s*/, "");
  }

  const catalog: CatalogEntry[] = [];
  for (const [category, source] of Object.entries(CATEGORY_SOURCES)) {
    const data = loadFile(source.file);
    const matches = source.matches ?? ((e: ExportEntry) => e.productCategory === category);
    for (const [itemType, entry] of Object.entries(data)) {
      // Excludes a small number of enemy/mission-only assets that reuse
      // a real weapon's productCategory (confirmed 2026-09-21: one
      // "Imperator Vandal"-named entry under
      // /Lotus/Types/JadeShadowsPart2Mission/Enemies/... has
      // productCategory "SpaceGuns" despite never being player-ownable).
      // NOT a broader "/Lotus/Types/" exclusion - a first attempt at that
      // was WRONG, caught in the same pass: both SentinelWeapons
      // (/Lotus/Types/Sentinels/SentinelWeapons/...) and Hoverboards
      // (/Lotus/Types/Vehicles/Hoverboard/...) are real, legitimately
      // player-ownable categories that ALSO live under /Lotus/Types/, so
      // that filter silently zeroed out both. "/Enemies/" is the actual
      // distinguishing marker of the junk entry.
      if (itemType.includes("/Enemies/")) continue;
      if (!matches(entry)) continue;
      catalog.push({
        itemType,
        category,
        name: displayName(entry, itemType),
        iconPath: entry.icon ?? null,
        maxLevelCap: entry.maxLevelCap ?? null,
        masteryReq: typeof entry.masteryReq === "number" ? entry.masteryReq : null,
      });
    }
  }
  return catalog;
}

// Incarnon Genesis eligible weapons - Public Export has no field linking
// a weapon to whether it can be Incarnon-adapted, but DOES have 45 real
// per-weapon "<Name> Incarnon Genesis" adapter items under
// MiscItems/IncarnonAdapters/ in ExportResources.json, each with its OWN
// distinct icon (e.g. BratonIncarnonUnlocker's icon is
// ".../IncarnonWeapons/BratonIncarnonAdapter.png" - confirmed 2026-09-21
// by fetching it from cdn.warframestat.us and visually checking it
// against the real Incarnon Genesis Braton art on the wiki - it's the
// genuine black/white "infused" reskin, not a placeholder). Stripping
// the " Incarnon Genesis" suffix off each adapter's own resolved display
// name and matching the result against this catalog's weapon names
// produced a clean 45/45 match with ZERO misses and ZERO ambiguous
// matches (verified exhaustively 2026-09-21 by checking every single
// adapter, not spot-checked) - a derived-but-verified mapping, not a
// guess. See ../../OpenTools/DEVLOG.md's 2026-09-21 Helminth/Incarnon
// entries for the full verification writeup.
function loadIncarnonIconPaths(
  dict: Record<string, string>,
  weaponNameToItemType: Map<string, string>,
): Map<string, string> {
  let resources: Record<string, ExportEntry> = {};
  try {
    resources = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "ExportResources.json"), "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load ExportResources.json from ${EXPORT_DIR} - Incarnon eligibility will be empty. (${err instanceof Error ? err.message : err})`);
    return new Map();
  }

  const iconByWeaponItemType = new Map<string, string>();
  for (const [adapterItemType, entry] of Object.entries(resources)) {
    if (!adapterItemType.includes("/IncarnonAdapters/")) continue;
    const rawName = (entry.name && dict[entry.name]) || null;
    if (!rawName || !entry.icon) continue;
    const weaponName = rawName.replace(/\s*Incarnon Genesis\s*$/i, "").trim();
    const weaponItemType = weaponNameToItemType.get(weaponName);
    if (weaponItemType) iconByWeaponItemType.set(weaponItemType, entry.icon);
  }
  return iconByWeaponItemType;
}

// Loaded once at startup, not per-request.
const catalog = loadCatalog();
const nameByItemType = new Map(catalog.map((entry) => [entry.itemType, entry.name]));
const iconPathByItemType = new Map(catalog.map((entry) => [entry.itemType, entry.iconPath]));
console.log(`OpenTools: loaded ${catalog.length} catalog entries (names) from Public Export`);

const dictForIncarnon: Record<string, string> = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "dict.en.json"), "utf8"));
  } catch {
    return {};
  }
})();
// Weapon name -> itemType, built from the same catalog entries above -
// only weapon categories can be Incarnon-eligible (never Suits/Sentinels).
const weaponNameToItemType = new Map(
  catalog
    .filter((entry) => entry.category === "LongGuns" || entry.category === "Pistols" || entry.category === "Melee")
    .map((entry) => [entry.name, entry.itemType]),
);
const incarnonIconPathByItemType = loadIncarnonIconPaths(dictForIncarnon, weaponNameToItemType);
console.log(`OpenTools: resolved ${incarnonIconPathByItemType.size} Incarnon-eligible weapons from Public Export`);

export function isIncarnonEligible(itemType: string): boolean {
  return incarnonIconPathByItemType.has(itemType);
}

// Raw internal packed-asset path (see CatalogEntry.iconPath's comment
// for what "raw" means here) for the weapon's real Incarnon Genesis art
// - null if not Incarnon-eligible at all.
export function getIncarnonIconPath(itemType: string): string | null {
  return incarnonIconPathByItemType.get(itemType) ?? null;
}

// A Warframe's resolved display name always ends in " Prime" for the
// Prime variant (e.g. "Volt Prime") - simpler and more reliable than
// Public Export's own variantType field, which misclassifies at least
// one real Prime (Chroma Prime is tagged VT_VARIANT, not VT_PRIME,
// confirmed 2026-09-21 in the local dump) - name-suffix matching doesn't
// have that inconsistency.
export function isPrimeName(name: string): boolean {
  return name.endsWith(" Prime");
}

// Falls back to the ItemType path's last segment for anything not
// found in the catalog (e.g. a variant this project hasn't scoped a
// category for yet) - a raw-but-readable label, not a blank/error.
export function resolveItemName(itemType: string): string {
  const known = nameByItemType.get(itemType);
  if (known) return known;
  const parts = itemType.split("/");
  return parts[parts.length - 1] || itemType;
}

export function getCatalog(): CatalogEntry[] {
  return catalog;
}

export function getIconPath(itemType: string): string | null {
  return iconPathByItemType.get(itemType) ?? null;
}

const maxLevelCapByItemType = new Map(catalog.map((entry) => [entry.itemType, entry.maxLevelCap]));
export function getMaxLevelCap(itemType: string): number | null {
  return maxLevelCapByItemType.get(itemType) ?? null;
}

const masteryReqByItemType = new Map(catalog.map((entry) => [entry.itemType, entry.masteryReq]));
export function getMasteryReq(itemType: string): number | null {
  return masteryReqByItemType.get(itemType) ?? null;
}
