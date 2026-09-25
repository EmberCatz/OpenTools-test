import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getCatalog,
  getIconPath,
  getMaxLevelCap,
  getMasteryReq,
  resolveItemName,
  isIncarnonEligible,
  getIncarnonIconPath,
  isPrimeName,
} from "./itemNames.js";
import { getModsCatalog } from "./modsCatalog.js";
import { getArcanesCatalog } from "./arcanesCatalog.js";
import { getRelicsCatalog } from "./relicsCatalog.js";
import { getModSubcategories } from "./modSubcategories.js";
import { getWarframeExtra } from "./warframePortraits.js";
import {
  resolveItemIcon,
  resolveModPreview,
  resolveArcaneCategory,
  resolveRelicRewards,
  type RelicReward,
  getIconStatus,
} from "./itemIcons.js";
import { xpToRank } from "./rank.js";
import { ensureCategoryCached, getLocalIconUrl, isLocalExtractionAvailable } from "./localIcons.js";
import { EQUIPMENT_FEATURES, hasFeature } from "./equipmentFeatures.js";
import {
  getManufacturingRequirements,
  resolveComponentIcon,
  resolveBlueprintTargetItemType,
  type ManufacturingRequirement,
} from "./manufacturing.js";
import { getDropsForItem, type DropRow } from "./dropData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
// Overridable so a scratch/test server (e.g. a different OPENTOOLS_PORT
// for isolated testing) can point at its own throwaway file instead of
// silently sharing the real one - a real database contaminated a live
// user's data this way on 2026-09-21 (OPENTOOLS_PORT alone only
// isolates the network port, not storage) before this override existed.
const DB_PATH = process.env.OPENTOOLS_DB_PATH ?? path.join(DATA_DIR, "opentools.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Schema per DEVLOG.md's "Initial DB schema" entry (2026-09-20) - only
// tables backing data with a confirmed inventory.php field shape.
// Extending this needs its own DEVLOG entry, not a silent migration.
db.exec(`
  CREATE TABLE IF NOT EXISTS currencies (
    name TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS item_counts (
    item_type TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    count INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ranked_upgrades (
    oid TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    rank INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Owned warframes/weapons/sentinels/companion weapons - one row per
  -- unique instance. Suits/LongGuns/Pistols/Melee/Sentinels share this
  -- shape (confirmed live 2026-09-21, see DEVLOG.md) - generalized into
  -- one table rather than several near-identical ones, same reasoning as
  -- item_counts covering RawUpgrades/MiscItems/Recipes. SentinelWeapons
  -- was added 2026-09-21 on a lead (WFHelper's source) still unconfirmed
  -- against a real inventory.php response. polarized and features
  -- were ALSO added that day as unattested leads, but promoted to
  -- CONFIRMED the same day after reading this machine's own local
  -- SpaceNinjaServer checkout (C:\OpenWF\Tools\SpaceNinjaServer\
  -- SpaceNinjaServer-main\src\types\equipmentTypes.ts) - both are real
  -- fields on SNS's own IEquipmentDatabase interface, not a guess. See
  -- DEVLOG.md's 2026-09-21 "Catalyst/Reactor/Exilus confirmed" entry.
  CREATE TABLE IF NOT EXISTS owned_equipment (
    oid TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    -- 'Suits' | 'LongGuns' | 'Pistols' | 'Melee' | 'Sentinels' | 'SentinelWeapons'
    -- | 'SpaceSuits' | 'SpaceGuns' | 'SpaceMelee' | 'Hoverboards' (the
    -- last 4 added 2026-09-21 for Archwing/K-Drive tracking, same
    -- confidence tier as SentinelWeapons - see itemNames.ts's
    -- CATEGORY_SOURCES comment)
    category TEXT NOT NULL,
    xp INTEGER NOT NULL,
    polarized INTEGER NOT NULL DEFAULT 0, -- Forma count - confirmed field, see table comment above
    features INTEGER NOT NULL DEFAULT 0, -- bitmask - confirmed field, see table comment above
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS unlocks (
    node_key TEXT PRIMARY KEY,
    seen_at TEXT NOT NULL
  );

  -- Warframes ever fed to Helminth (InfestedFoundry.ConsumedSuits[].s) -
  -- confirmed field, see OpenTools Sync.pluto's header comment. Same
  -- full-state-replace pattern as unlocks - a suit that's fed to
  -- Helminth stays subsumed forever in the real game, but this table
  -- still gets cleared+repopulated each sync rather than only ever
  -- appended to, matching every other per-sync table's convention.
  CREATE TABLE IF NOT EXISTS subsumed_suits (
    item_type TEXT PRIMARY KEY,
    seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quest_keys (
    quest_key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Per-itemType XP that persists across a Forma reset (SNS's top-level
  -- XPInfo array of ItemType/XP pairs, confirmed real via this machine's
  -- own local SpaceNinjaServer checkout - see OpenTools Sync.pluto's
  -- header comment). Distinct from owned_equipment.xp (which DOES reset
  -- on Forma) - this table is what "mastered" (ever hit max rank) is
  -- computed from, via the same xpToRank() formula as current rank.
  CREATE TABLE IF NOT EXISTS mastery_xp (
    item_type TEXT PRIMARY KEY,
    xp INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    synced_at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    note TEXT
  );
`);

// Migration (2026-09-21): CREATE TABLE IF NOT EXISTS above doesn't add
// columns to an already-existing owned_equipment table from before the
// `polarized`/`features` columns existed - this ALTERs them in for any
// real DB created before today, idempotently (checked via
// PRAGMA table_info, not a try/catch over a failing ALTER).
const equipmentColumns = db.prepare(`PRAGMA table_info(owned_equipment)`).all() as { name: string }[];
if (!equipmentColumns.some((c) => c.name === "polarized")) {
  db.exec(`ALTER TABLE owned_equipment ADD COLUMN polarized INTEGER NOT NULL DEFAULT 0`);
}
if (!equipmentColumns.some((c) => c.name === "features")) {
  db.exec(`ALTER TABLE owned_equipment ADD COLUMN features INTEGER NOT NULL DEFAULT 0`);
}

export interface InventorySnapshot {
  currencies: Record<string, number>;
  itemCounts: Record<string, { category: string; count: number }>;
  rankedUpgrades: Record<string, { rank: number; oid: string }[]>;
  unlocks: string[];
  questKeys: Record<string, unknown>;
  // oid -> {itemType, category, xp, polarized, features}. Keyed by oid
  // (not itemType) since unlike item_counts these are unique instances,
  // not stackable counts - two owned copies of the same weapon (e.g. a
  // riven'd + a plain one) are two distinct rows. `polarized`/`features`
  // are confirmed real fields - see owned_equipment's table comment.
  equipment: Record<
    string,
    { itemType: string; category: string; xp: number; polarized?: number; features?: number }
  >;
  // Flat array of ItemTypes ever fed to Helminth - see
  // OpenTools Sync.pluto's header comment for the source confirmation
  // (InfestedFoundry.ConsumedSuits[].s, read from SNS's own subsume
  // handler).
  subsumedSuits: string[];
  // itemType -> XPInfo's real per-item XP (persists across Forma resets -
  // see mastery_xp table comment). Optional/defaults to {} server-side
  // (routes.ts) so older sync-script pushes that predate this field
  // don't get rejected as malformed.
  masteryXp?: Record<string, number>;
}

const upsertCurrency = db.prepare(
  `INSERT INTO currencies (name, amount, updated_at) VALUES (@name, @amount, @updatedAt)
   ON CONFLICT(name) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`,
);

const upsertItemCount = db.prepare(
  `INSERT INTO item_counts (item_type, category, count, updated_at) VALUES (@itemType, @category, @count, @updatedAt)
   ON CONFLICT(item_type) DO UPDATE SET category = excluded.category, count = excluded.count, updated_at = excluded.updated_at`,
);

const upsertRankedUpgrade = db.prepare(
  `INSERT INTO ranked_upgrades (oid, item_type, rank, updated_at) VALUES (@oid, @itemType, @rank, @updatedAt)
   ON CONFLICT(oid) DO UPDATE SET item_type = excluded.item_type, rank = excluded.rank, updated_at = excluded.updated_at`,
);

const upsertEquipment = db.prepare(
  `INSERT INTO owned_equipment (oid, item_type, category, xp, polarized, features, updated_at) VALUES (@oid, @itemType, @category, @xp, @polarized, @features, @updatedAt)
   ON CONFLICT(oid) DO UPDATE SET item_type = excluded.item_type, category = excluded.category, xp = excluded.xp, polarized = excluded.polarized, features = excluded.features, updated_at = excluded.updated_at`,
);

const upsertUnlock = db.prepare(
  `INSERT INTO unlocks (node_key, seen_at) VALUES (@nodeKey, @seenAt)
   ON CONFLICT(node_key) DO NOTHING`,
);

const upsertQuestKey = db.prepare(
  `INSERT INTO quest_keys (quest_key, data, updated_at) VALUES (@questKey, @data, @updatedAt)
   ON CONFLICT(quest_key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
);

const upsertSubsumedSuit = db.prepare(
  `INSERT INTO subsumed_suits (item_type, seen_at) VALUES (@itemType, @seenAt)
   ON CONFLICT(item_type) DO NOTHING`,
);

const upsertMasteryXp = db.prepare(
  `INSERT INTO mastery_xp (item_type, xp, updated_at) VALUES (@itemType, @xp, @updatedAt)
   ON CONFLICT(item_type) DO UPDATE SET xp = excluded.xp, updated_at = excluded.updated_at`,
);

const insertSyncLog = db.prepare(
  `INSERT INTO sync_log (synced_at, ok, note) VALUES (@syncedAt, @ok, @note)`,
);

// Found 2026-09-21 (during cleanup of test-data contamination): the
// comment this replaced claimed "full-state replace," but nothing ever
// actually DELETEd a stale row - every table only ever upserted, so a
// sold item/removed unlock/stale test entry would persist forever
// across real syncs instead of disappearing. Genuinely fixed now:
// item_counts/ranked_upgrades/owned_equipment/unlocks/quest_keys are
// cleared before each push's data is (re)inserted, so the DB always
// reflects exactly the latest snapshot for these tables - no stale
// leftovers, no manual cleanup needed if bad data ever lands again.
// currencies is deliberately EXCLUDED from this - it's a running
// account-level value, not an inventory listing, and the script only
// sends fields it found present on the response (see
// OpenTools Sync.pluto's CURRENCY_FIELDS comment) - clearing it on
// every push would zero out a currency that's just temporarily absent
// from one response instead of preserving its last known value.
const clearItemCounts = db.prepare(`DELETE FROM item_counts`);
const clearRankedUpgrades = db.prepare(`DELETE FROM ranked_upgrades`);
const clearEquipment = db.prepare(`DELETE FROM owned_equipment`);
const clearUnlocks = db.prepare(`DELETE FROM unlocks`);
const clearQuestKeys = db.prepare(`DELETE FROM quest_keys`);
const clearSubsumedSuits = db.prepare(`DELETE FROM subsumed_suits`);
const clearMasteryXp = db.prepare(`DELETE FROM mastery_xp`);

export const applySnapshot = db.transaction((snapshot: InventorySnapshot, note?: string) => {
  const updatedAt = new Date().toISOString();

  for (const [name, amount] of Object.entries(snapshot.currencies)) {
    upsertCurrency.run({ name, amount, updatedAt });
  }

  clearItemCounts.run();
  for (const [itemType, { category, count }] of Object.entries(snapshot.itemCounts)) {
    upsertItemCount.run({ itemType, category, count, updatedAt });
  }

  clearRankedUpgrades.run();
  for (const [itemType, instances] of Object.entries(snapshot.rankedUpgrades)) {
    for (const { rank, oid } of instances) {
      upsertRankedUpgrade.run({ oid, itemType, rank, updatedAt });
    }
  }

  clearEquipment.run();
  for (const [oid, { itemType, category, xp, polarized, features }] of Object.entries(snapshot.equipment)) {
    upsertEquipment.run({
      oid,
      itemType,
      category,
      xp,
      polarized: polarized ?? 0,
      features: features ?? 0,
      updatedAt,
    });
  }

  clearUnlocks.run();
  for (const nodeKey of snapshot.unlocks) {
    upsertUnlock.run({ nodeKey, seenAt: updatedAt });
  }

  clearQuestKeys.run();
  for (const [questKey, data] of Object.entries(snapshot.questKeys)) {
    upsertQuestKey.run({ questKey, data: JSON.stringify(data), updatedAt });
  }

  clearSubsumedSuits.run();
  for (const itemType of snapshot.subsumedSuits) {
    upsertSubsumedSuit.run({ itemType, seenAt: updatedAt });
  }

  clearMasteryXp.run();
  for (const [itemType, xp] of Object.entries(snapshot.masteryXp ?? {})) {
    upsertMasteryXp.run({ itemType, xp, updatedAt });
  }

  insertSyncLog.run({ syncedAt: updatedAt, ok: 1, note: note ?? null });
});

export function logFailedSync(note: string) {
  insertSyncLog.run({ syncedAt: new Date().toISOString(), ok: 0, note });
}

export interface CollectionItem {
  itemType: string;
  category: string;
  name: string;
  icon: string | null;
  owned: boolean;
  ownedCount: number;
  xp: number | null;
  rank: number | null;
  maxRank: number | null;
  // Forma count (the `Polarized` field) - confirmed real field, see
  // owned_equipment's table comment in this file. null for items not
  // owned (no instance to read a count from).
  formaCount: number | null;
  // DOUBLE_CAPACITY feature bit - Orokin Catalyst (weapons) or Orokin
  // Reactor (Suits/Sentinels), same underlying mechanism either way.
  // null for items not owned.
  capacityBoosted: boolean | null;
  // UTILITY_SLOT feature bit - Exilus adapter installed. null for items
  // not owned.
  exilusInstalled: boolean | null;
  // Helminth-subsumed duplicate tile (see DEVLOG.md's 2026-09-21
  // Helminth/Incarnon entry). null for anything that isn't a non-Prime
  // Warframe (Prime frames and every other category don't get a
  // duplicate at all) - true/false for eligible ones, independent of
  // `owned` (subsuming CONSUMES the original copy, so a fully-subsumed
  // frame is simultaneously unowned AND helminthSubsumed=true).
  helminthSubsumed: boolean | null;
  // Incarnon Genesis duplicate tile - true for the ~45 real Incarnon-
  // eligible weapons (see itemNames.ts's isIncarnonEligible - a derived-
  // but-exhaustively-verified mapping from Public Export, not a guess),
  // false for everything else. Always a real boolean, never null.
  incarnonEligible: boolean;
  // INCARNON_GENESIS feature bit (512) on an owned instance - only
  // meaningful when incarnonEligible is true. false (not null) for
  // unowned items, matching the "grayed until adapted" design regardless
  // of WHY it's not adapted (never owned vs. owned-but-not-adapted).
  incarnonInstalled: boolean;
  // The weapon's real, distinct Incarnon Genesis art (confirmed against
  // the actual wiki art, see itemNames.ts's loadIncarnonIconPaths
  // comment) - null when incarnonEligible is false. Falls back to the
  // base weapon `icon` in the frontend if this is ever null despite
  // incarnonEligible being true (shouldn't happen, but never worth a
  // broken image over).
  incarnonIcon: string | null;
  // The "Progenitor Element" shown on a Warframe's own wiki infobox -
  // see warframePortraits.ts for what this actually means (NOT a combat
  // trait of the frame itself - it's the element bonus a Kuva Lich/
  // Sister of Parvos inherits if THIS Warframe is equipped at the
  // moment you mercy/kill its Larvling/Candidate). null for anything
  // that isn't a Warframe with this attribute (Archwings, Necramechs,
  // non-Suits categories). Not currently surfaced anywhere in the UI -
  // see warframePortraits.ts's header comment for real future use cases.
  progenitorElement: string | null;
  // Real transparent full-body wiki render for the Collection tab's
  // hover preview (warframePortraits.ts) - null for non-Suits categories
  // or the handful of Suits entries with no confirmed wiki image.
  portraitImage: string | null;
  // Whether this item has EVER hit max rank (persists across a later
  // Forma reset, unlike `rank` above) - computed from mastery_xp
  // (SNS's real XPInfo field) via the same xpToRank() formula as
  // current rank. null when this item has no mastery_xp row yet (either
  // never ranked at all, or the sync script hasn't pushed masteryXp
  // for this account yet - see routes.ts) - deliberately NOT collapsed
  // to false, so the UI can distinguish "confirmed not mastered" from
  // "no data yet" if it ever needs to.
  mastered: boolean | null;
  // One icon per real Foundry ingredient this item needs (its own
  // Blueprint plus any sub-component/relic-part recipes) - see
  // manufacturing.ts's header comment for exactly where this graph and
  // its labels/icons come from. null for anything with no matching
  // Recipe in Public Export at all (not buildable via Foundry - relic-
  // only Prime variants missing from this dump, quest rewards,
  // market-only cosmetics) - never a fabricated row. `owned` items get
  // every requirement forced to "crafted" (see manufacturingRowFor()) -
  // building the item necessarily already consumed every ingredient.
  manufacturingRequirements: { label: string; icon: string | null; state: ManufacturingState }[] | null;
  // Mastery Rank required to USE the item - see itemNames.ts's
  // getMasteryReq comment. null when Public Export has no such field at
  // all (Sentinels/companions - no real requirement exists); 0 is a
  // real, distinct value (Warframes, MR0 starter weapons) meaning "no
  // requirement" - the frontend only shows the badge when this is a
  // positive number, matching the real in-game Arsenal.
  masteryReq: number | null;
}

export type ManufacturingState = "missing" | "owned" | "crafted";

// Combines manufacturing.ts's pure requirement shape (label/icon, which
// uniqueNames matter) with the live item_counts Recipes bucket (real
// SNS inventory data, see item_counts' table comment) to get each
// requirement's actual per-player state. `recipeCounts` is built once per
// getCollection() call, not per item - see call sites below.
function manufacturingStateFor(req: ManufacturingRequirement, recipeCounts: Map<string, number>, owned: boolean): ManufacturingState {
  if (owned) return "crafted";
  if (req.isMainBlueprint) {
    return req.blueprintUniqueName && (recipeCounts.get(req.blueprintUniqueName) ?? 0) > 0 ? "owned" : "missing";
  }
  if (req.craftedUniqueName && (recipeCounts.get(req.craftedUniqueName) ?? 0) > 0) return "crafted";
  if (req.blueprintUniqueName && (recipeCounts.get(req.blueprintUniqueName) ?? 0) > 0) return "owned";
  return "missing";
}

function manufacturingRowFor(
  itemType: string,
  recipeCounts: Map<string, number>,
  owned: boolean,
): { label: string; icon: string | null; state: ManufacturingState }[] | null {
  const requirements = getManufacturingRequirements(itemType);
  if (!requirements) return null;
  return requirements.map((req) => ({
    label: req.label,
    icon: req.icon,
    state: manufacturingStateFor(req, recipeCounts, owned),
  }));
}

// Prefers a locally-extracted icon (see localIcons.ts - fully offline,
// exact client version) over the cdn.warframestat.us network source,
// falling back to the latter whenever the local one isn't available yet
// (not configured, or this category hasn't finished its background
// extraction). ensureCategoryCached() is fire-and-forget and safe to
// call on every request - it's a no-op after the first call for a given
// category (extractedCategories/marker-file check in localIcons.ts).
function resolveIcon(itemType: string, category: string): string | null {
  ensureCategoryCached(category);
  const iconPath = getIconPath(itemType);
  if (iconPath) {
    const local = getLocalIconUrl(iconPath);
    if (local) return local;
  }
  return resolveItemIcon(itemType);
}

// Incarnon icons are a fixed, static WFCD asset per weapon (not
// resolved through localIcons.ts's on-demand extraction, same reasoning
// as modsCatalog.ts's icons - the internal path lives under a different
// tree than what that extractor knows how to pull). WFCD mirrors Public
// Export's own icon filename verbatim under cdn.warframestat.us/img/ -
// same convention already relied on for every other icon in this file
// and in statusIcons.ts, not a new assumption.
const WFCD_IMG_BASE = "https://cdn.warframestat.us/img/";
function resolveIncarnonIcon(itemType: string): string | null {
  const rawPath = getIncarnonIconPath(itemType);
  if (!rawPath) return null;
  const filename = rawPath.split("/").pop();
  return filename ? WFCD_IMG_BASE + filename : null;
}

// Returns one row per catalog entry (from Public Export, via
// itemNames.getCatalog()) PLUS any genuinely-owned item that isn't in
// that catalog (e.g. something Public Export doesn't cover) - so
// nothing a player actually owns silently disappears just because it's
// missing from the reference list. A player owning multiple copies of
// the same item (different oid, e.g. two separately-forma'd weapons) is
// deliberately collapsed to ONE grid entry showing the highest-XP
// copy's rank, with `ownedCount` carrying the real count - a scoping
// simplification for the grid view (see DEVLOG.md's 2026-09-21 entry),
// not a data loss - the per-instance oid/xp detail is still in
// owned_equipment if a future feature needs it.
export function getCollection(): {
  items: CollectionItem[];
  iconStatus: ReturnType<typeof getIconStatus>;
  localExtractionAvailable: boolean;
} {
  const ownedRows = db
    .prepare(`SELECT oid, item_type, category, xp, polarized, features FROM owned_equipment`)
    .all() as { oid: string; item_type: string; category: string; xp: number; polarized: number; features: number }[];

  const ownedByType = new Map<
    string,
    { category: string; maxXp: number; count: number; maxPolarized: number; featuresUnion: number }
  >();
  for (const row of ownedRows) {
    const existing = ownedByType.get(row.item_type);
    if (existing) {
      existing.count += 1;
      existing.maxXp = Math.max(existing.maxXp, row.xp);
      existing.maxPolarized = Math.max(existing.maxPolarized, row.polarized);
      existing.featuresUnion |= row.features;
    } else {
      ownedByType.set(row.item_type, {
        category: row.category,
        maxXp: row.xp,
        count: 1,
        maxPolarized: row.polarized,
        featuresUnion: row.features,
      });
    }
  }

  const subsumedItemTypes = new Set(
    (db.prepare(`SELECT item_type FROM subsumed_suits`).all() as { item_type: string }[]).map((r) => r.item_type),
  );

  // Weapon-part ingredients (Barrel/Receiver/Stock/...) live in the SNS
  // MiscItems bucket, not Recipes, despite their /Lotus/Types/Recipes/...
  // path namespace - confirmed 2026-09-24 against real synced data (e.g.
  // EpitaphPrimeBarrel/Receiver both category='MiscItems' while
  // EpitaphPrimeBlueprint itself is category='Recipes'), consistent
  // across every WeaponParts/* entry in the DB, Prime and non-Prime
  // alike. Only the standalone *Blueprint items land in Recipes. Pulling
  // both buckets in is safe - manufacturing.ts only ever looks up
  // Recipes-namespace uniqueNames here, so a raw MiscItems resource
  // (Ferrite, Orokin Cell, ...) never collides with a real lookup key.
  const recipeCounts = new Map(
    (
      db.prepare(`SELECT item_type, count FROM item_counts WHERE category IN ('Recipes', 'MiscItems')`).all() as {
        item_type: string;
        count: number;
      }[]
    ).map((r) => [r.item_type, r.count]),
  );

  const masteryXpByType = new Map(
    (db.prepare(`SELECT item_type, xp FROM mastery_xp`).all() as { item_type: string; xp: number }[]).map((r) => [
      r.item_type,
      r.xp,
    ]),
  );
  // null (not false) when this itemType has no mastery_xp row at all -
  // see CollectionItem.mastered's comment for why that distinction
  // matters. maxLevelCap mirrors the same argument xpToRank() already
  // takes for current rank, so a Legendary-tier item is judged "mastered"
  // against ITS real cap, not a blanket 30.
  function masteredStatus(itemType: string, category: string, maxLevelCap: number | null | undefined): boolean | null {
    const xp = masteryXpByType.get(itemType);
    if (xp === undefined) return null;
    const { rank, maxRank } = xpToRank(xp, category, maxLevelCap);
    return rank >= maxRank;
  }

  const catalog = getCatalog();
  const catalogItemTypes = new Set(catalog.map((entry) => entry.itemType));

  const items: CollectionItem[] = catalog.map((entry) => {
    const owned = ownedByType.get(entry.itemType);
    const rankInfo = owned ? xpToRank(owned.maxXp, entry.category, entry.maxLevelCap) : null;
    const eligibleForHelminth = entry.category === "Suits" && !isPrimeName(entry.name);
    const eligibleForIncarnon = isIncarnonEligible(entry.itemType);
    const warframeExtra = entry.category === "Suits" ? getWarframeExtra(entry.itemType) : null;
    return {
      itemType: entry.itemType,
      category: entry.category,
      name: entry.name,
      icon: resolveIcon(entry.itemType, entry.category),
      owned: !!owned,
      ownedCount: owned?.count ?? 0,
      xp: owned?.maxXp ?? null,
      rank: rankInfo?.rank ?? null,
      maxRank: rankInfo?.maxRank ?? null,
      formaCount: owned?.maxPolarized ?? null,
      capacityBoosted: owned ? hasFeature(owned.featuresUnion, EQUIPMENT_FEATURES.DOUBLE_CAPACITY) : null,
      exilusInstalled: owned ? hasFeature(owned.featuresUnion, EQUIPMENT_FEATURES.UTILITY_SLOT) : null,
      helminthSubsumed: eligibleForHelminth ? subsumedItemTypes.has(entry.itemType) : null,
      incarnonEligible: eligibleForIncarnon,
      incarnonInstalled: eligibleForIncarnon && !!owned && hasFeature(owned.featuresUnion, EQUIPMENT_FEATURES.INCARNON_GENESIS),
      incarnonIcon: eligibleForIncarnon ? resolveIncarnonIcon(entry.itemType) : null,
      progenitorElement: warframeExtra?.progenitorElement ?? null,
      portraitImage: warframeExtra?.portraitImage ?? null,
      mastered: masteredStatus(entry.itemType, entry.category, entry.maxLevelCap),
      manufacturingRequirements: manufacturingRowFor(entry.itemType, recipeCounts, !!owned),
      masteryReq: entry.masteryReq,
    };
  });

  for (const [itemType, data] of ownedByType) {
    if (catalogItemTypes.has(itemType)) continue;
    const rankInfo = xpToRank(data.maxXp, data.category, getMaxLevelCap(itemType));
    const name = resolveItemName(itemType);
    const eligibleForHelminth = data.category === "Suits" && !isPrimeName(name);
    const eligibleForIncarnon = isIncarnonEligible(itemType);
    const warframeExtra = data.category === "Suits" ? getWarframeExtra(itemType) : null;
    items.push({
      itemType,
      category: data.category,
      name,
      icon: resolveIcon(itemType, data.category),
      owned: true,
      ownedCount: data.count,
      xp: data.maxXp,
      rank: rankInfo.rank,
      maxRank: rankInfo.maxRank,
      formaCount: data.maxPolarized,
      capacityBoosted: hasFeature(data.featuresUnion, EQUIPMENT_FEATURES.DOUBLE_CAPACITY),
      exilusInstalled: hasFeature(data.featuresUnion, EQUIPMENT_FEATURES.UTILITY_SLOT),
      helminthSubsumed: eligibleForHelminth ? subsumedItemTypes.has(itemType) : null,
      incarnonEligible: eligibleForIncarnon,
      incarnonInstalled: eligibleForIncarnon && hasFeature(data.featuresUnion, EQUIPMENT_FEATURES.INCARNON_GENESIS),
      incarnonIcon: eligibleForIncarnon ? resolveIncarnonIcon(itemType) : null,
      progenitorElement: warframeExtra?.progenitorElement ?? null,
      portraitImage: warframeExtra?.portraitImage ?? null,
      mastered: masteredStatus(itemType, data.category, getMaxLevelCap(itemType)),
      manufacturingRequirements: manufacturingRowFor(itemType, recipeCounts, true),
      masteryReq: getMasteryReq(itemType),
    });
  }

  // A fully-subsumed Warframe (fed to Helminth, no copy currently owned)
  // still needs its Helminth duplicate shown as subsumed even though
  // it's otherwise unowned - the catalog loop above already covers this
  // (helminthSubsumed is independent of `owned`), but a subsumed suit
  // that ISN'T in the catalog at all (shouldn't happen for a real
  // Warframe, but don't silently drop it if it does) needs its own
  // fallback row so the duplicate has something to attach to.
  for (const itemType of subsumedItemTypes) {
    if (catalogItemTypes.has(itemType)) continue;
    if (items.some((i) => i.itemType === itemType)) continue;
    const name = resolveItemName(itemType);
    if (isPrimeName(name)) continue;
    const warframeExtra = getWarframeExtra(itemType);
    items.push({
      itemType,
      category: "Suits",
      name,
      icon: resolveIcon(itemType, "Suits"),
      owned: false,
      ownedCount: 0,
      xp: null,
      rank: null,
      maxRank: null,
      formaCount: null,
      capacityBoosted: null,
      exilusInstalled: null,
      helminthSubsumed: true,
      incarnonEligible: false,
      incarnonInstalled: false,
      incarnonIcon: null,
      progenitorElement: warframeExtra.progenitorElement,
      portraitImage: warframeExtra.portraitImage,
      mastered: masteredStatus(itemType, "Suits", null),
      manufacturingRequirements: manufacturingRowFor(itemType, recipeCounts, false),
      masteryReq: getMasteryReq(itemType),
    });
  }

  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return { items, iconStatus: getIconStatus(), localExtractionAvailable: isLocalExtractionAvailable() };
}

export interface ModItem {
  itemType: string;
  name: string;
  icon: string | null;
  // Full-size wiki card image for the hover preview (2026-09-22) - a
  // real, meaningfully higher-quality image than `icon`, not the same
  // URL. See itemIcons.ts's resolveModPreview() - falls back to `icon`
  // itself when no wiki image exists for that mod, never null.
  previewImage: string | null;
  owned: boolean;
  ownedCount: number;
  rank: number | null;
  maxRank: number;
  // See modsCatalog.ts's CATEGORY_LABELS - derived from ExportUpgrades.json's
  // real `type` field. Drives the Collection tab's Mods "Category" filter.
  category: string;
  // See modSubcategories.ts - the REAL https://wiki.warframe.com/w/Category:Mods
  // subcategory list (Bow Mods, Amalgam Mods, Set Mods, ...) this mod
  // belongs to, scraped from the wiki itself. A mod can be in several (or
  // zero, if the wiki lists it under none of the ~84 subcategories this
  // app tracks, or the wiki member name didn't match this project's own
  // catalog name - see that module's header comment). Drives the
  // Collection tab's Mods "Subcategories" filter.
  subcategories: string[];
  // Raw COMMON/UNCOMMON/RARE/LEGENDARY from ExportUpgrades.json - see
  // modsCatalog.ts's UpgradeEntry comment. null for the handful of
  // entries missing the field. Color-coding this is a client-side
  // presentation choice (App.tsx) since there's no sourced hex table for
  // these tiers - see that file's rarityColor() comment.
  rarity: string | null;
  // Resolved display name + official wiki icon URL for the mod's own
  // polarity (see polarityIcons.ts) - null when the mod has no polarity
  // a player would see (AP_UNIVERSAL - Parazon mods, riven placeholders)
  // or no polarity field at all.
  polarity: { name: string; icon: string } | null;
  // Mod capacity drain at rank 0 / at maxRank (+1 drain per rank, the
  // standard in-game formula - see modsCatalog.ts's ModCatalogEntry
  // comment). Can be negative for Aura mods. null only if baseDrain is
  // itself absent from Public Export for this entry (not expected - see
  // that file's comment).
  drainMin: number | null;
  drainMax: number | null;
}

// "Where do I get this" for a plain Collection card (2026-09-25) -
// unlike a relic reward row's OWN display name, which already IS a real
// drop-table item name (resolveRewardIcon above / the relic popup uses
// dropData.ts's exact-match getDropsForItem() directly on it), a
// Collection card represents the FULL item (e.g. "Volt Prime"), which
// never appears as an exact drop-table entry itself - only its
// Blueprint/component/part REWARDS do (e.g. "Volt Prime Blueprint",
// "Volt Prime Chassis Blueprint"). A naive fuzzy substring search on the
// bare name pulls in real false positives - confirmed 2026-09-25 against
// the live drop-data feed: searching "Volt" that way also matches "Volt
// PRIME Blueprint" rows (the wrong Warframe) and unrelated mods like
// "Voltaic Lance"/"High Voltage" (the name is just a substring of
// theirs). Instead, this reconstructs the EXACT real reward names this
// item's own Manufacturing Requirements already describe
// (getManufacturingRequirements() - the same data the Collection grid's
// requirement row already uses) and looks each up via dropData.ts's
// exact-match getDropsForItem() - the same real naming pattern confirmed
// across every relic reward in the two "Blueprint reward" DEVLOG entries:
//   - The item's own main Blueprint slot -> "<Name> Blueprint".
//   - A sub-component that needs its own Blueprint (Chassis/Systems/
//     Neuroptics) -> "<Name> <Label> Blueprint".
//   - A Prime part with no separate Blueprint (Barrel/Stock/Handle/...)
//     -> "<Name> <Label>" (no "Blueprint" suffix - a direct relic drop,
//     confirmed in manufacturing.ts's own header comment).
// Also tries the bare item name itself (rare, but some non-buildable
// catalog entries may appear as-is - never assumed absent without
// checking). Items with no Manufacturing Requirements at all (no
// matching Recipe - see manufacturing.ts) fall back to just that bare-
// name lookup, which usually finds nothing rather than a guessed row -
// same "never fabricate" standard as everywhere else in this project.
export function getDropSourcesForCollectionItem(itemType: string): DropRow[] {
  const name = resolveItemName(itemType);
  const candidates = new Set<string>([name]);
  for (const req of getManufacturingRequirements(itemType) ?? []) {
    if (req.isMainBlueprint) {
      candidates.add(`${name} Blueprint`);
    } else if (req.blueprintUniqueName) {
      candidates.add(`${name} ${req.label} Blueprint`);
    } else {
      candidates.add(`${name} ${req.label}`);
    }
  }
  const seen = new Set<string>();
  const rows: DropRow[] = [];
  for (const candidate of candidates) {
    for (const row of getDropsForItem(candidate)) {
      const key = `${row.item}|${row.place}|${row.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  rows.sort(
    (a, b) => a.item.localeCompare(b.item) || (b.chance ?? 0) - (a.chance ?? 0) || a.place.localeCompare(b.place),
  );
  return rows;
}

// Mods-only icon resolution - unlike resolveIcon() above, this never
// checks localIcons.ts. Mod icons live under a different internal path
// tree (/Lotus/Interface/Cards/Images/...) than the StoreIcons subtree
// localIcons.ts's on-demand extraction knows how to pull (see
// modsCatalog.ts's iconPath comment) - that internal path has never been
// confirmed via --ls, so this deliberately stays network-only (WFCD's
// Mods.json, via itemIcons.ts) rather than guessing a local-extraction
// path that might not exist.
function resolveModIcon(itemType: string): string | null {
  return resolveItemIcon(itemType);
}

// Combines item_counts (rank-0 stacks, category 'RawUpgrades') and
// ranked_upgrades (individual fused instances) per mod - same "collapse
// multiple owned instances into one grid tile, keep the highest rank,
// carry the real total in ownedCount" simplification getCollection()
// already uses for equipment. Only mods present in modsCatalog's
// ExportUpgrades.json-derived catalog are included - RawUpgrades/
// ranked_upgrades also contain arcanes (same underlying SNS mechanism,
// see market-emulator's itemsCache.ts), which aren't in this catalog and
// are out of scope for this pass (see modsCatalog.ts's header comment) -
// an owned arcane is simply not in this list, not shown with a wrong name.
export function getModsCollection(): { items: ModItem[]; iconStatus: ReturnType<typeof getIconStatus> } {
  const catalog = getModsCatalog();
  const catalogItemTypes = new Set(catalog.map((entry) => entry.itemType));

  const owned = new Map<string, { count: number; maxRank: number }>();
  function bump(itemType: string, count: number, rank: number) {
    if (!catalogItemTypes.has(itemType)) return;
    const existing = owned.get(itemType);
    if (existing) {
      existing.count += count;
      existing.maxRank = Math.max(existing.maxRank, rank);
    } else {
      owned.set(itemType, { count, maxRank: rank });
    }
  }

  const rank0Rows = db
    .prepare(`SELECT item_type, count FROM item_counts WHERE category = 'RawUpgrades'`)
    .all() as { item_type: string; count: number }[];
  for (const row of rank0Rows) {
    bump(row.item_type, row.count, 0);
  }

  const rankedRows = db.prepare(`SELECT item_type, rank FROM ranked_upgrades`).all() as {
    item_type: string;
    rank: number;
  }[];
  for (const row of rankedRows) {
    bump(row.item_type, 1, row.rank);
  }

  const items: ModItem[] = catalog.map((entry) => {
    const ownedEntry = owned.get(entry.itemType);
    return {
      itemType: entry.itemType,
      name: entry.name,
      icon: resolveModIcon(entry.itemType),
      previewImage: resolveModPreview(entry.itemType),
      owned: !!ownedEntry,
      ownedCount: ownedEntry?.count ?? 0,
      rank: ownedEntry?.maxRank ?? null,
      maxRank: entry.maxRank,
      category: entry.category,
      subcategories: getModSubcategories(entry.itemType),
      rarity: entry.rarity,
      polarity: entry.polarity,
      drainMin: entry.drainMin,
      drainMax: entry.drainMax,
    };
  });

  items.sort((a, b) => a.name.localeCompare(b.name));

  return { items, iconStatus: getIconStatus() };
}

export interface ArcaneItem {
  itemType: string;
  name: string;
  icon: string | null;
  owned: boolean;
  ownedCount: number;
  rank: number | null;
  // See arcanesCatalog.ts's header comment - varies per-arcane (5 or 3),
  // not a blanket constant.
  maxRank: number;
  // Raw COMMON/UNCOMMON/RARE/LEGENDARY - null for the handful missing it.
  rarity: string | null;
  // The equipment slot this arcane sockets into ("Warframe", "Melee",
  // "Operator", "Amp", ...) - see itemIcons.ts's resolveArcaneCategory().
  // A network-only field (no local Public Export equivalent), so this is
  // null until that background fetch resolves, same as `icon` above -
  // drives the Arcanes tab's Category filter.
  category: string | null;
}

// Same RawUpgrades/ranked_upgrades bucket getModsCollection() reads
// (arcanes and mods share the same underlying SNS mechanism - see that
// function's header comment) but scoped to ExportArcanes.json's own
// catalog instead via the same "only bump itemTypes this catalog knows
// about" guard - an owned mod never leaks into this list and vice versa.
export function getArcanesCollection(): { items: ArcaneItem[]; iconStatus: ReturnType<typeof getIconStatus> } {
  const catalog = getArcanesCatalog();
  const catalogItemTypes = new Set(catalog.map((entry) => entry.itemType));

  const owned = new Map<string, { count: number; maxRank: number }>();
  function bump(itemType: string, count: number, rank: number) {
    if (!catalogItemTypes.has(itemType)) return;
    const existing = owned.get(itemType);
    if (existing) {
      existing.count += count;
      existing.maxRank = Math.max(existing.maxRank, rank);
    } else {
      owned.set(itemType, { count, maxRank: rank });
    }
  }

  const rank0Rows = db
    .prepare(`SELECT item_type, count FROM item_counts WHERE category = 'RawUpgrades'`)
    .all() as { item_type: string; count: number }[];
  for (const row of rank0Rows) {
    bump(row.item_type, row.count, 0);
  }

  const rankedRows = db.prepare(`SELECT item_type, rank FROM ranked_upgrades`).all() as {
    item_type: string;
    rank: number;
  }[];
  for (const row of rankedRows) {
    bump(row.item_type, 1, row.rank);
  }

  const items: ArcaneItem[] = catalog.map((entry) => {
    const ownedEntry = owned.get(entry.itemType);
    return {
      itemType: entry.itemType,
      name: entry.name,
      icon: resolveItemIcon(entry.itemType),
      owned: !!ownedEntry,
      ownedCount: ownedEntry?.count ?? 0,
      rank: ownedEntry?.maxRank ?? null,
      maxRank: entry.maxRank,
      rarity: entry.rarity,
      category: resolveArcaneCategory(entry.itemType),
    };
  });

  items.sort((a, b) => a.name.localeCompare(b.name));

  return { items, iconStatus: getIconStatus() };
}

// itemIcons.ts's RelicReward plus a resolved icon URL (2026-09-25) -
// resolved HERE, per-request, rather than at itemIcons.ts's own load
// time, since it needs manufacturing.ts's Components.json map, a
// separate async load itemIcons.ts has no reason to depend on directly.
export interface RelicRewardWithIcon {
  itemName: string;
  rarity: string;
  chance: number;
  icon: string | null;
}

export interface RelicRefinementItem {
  refinement: string;
  ownedCount: number;
  // resolveRelicRewards(itemType) - null until that background fetch
  // resolves, or if WFCD genuinely has no table for this tier.
  rewards: RelicRewardWithIcon[] | null;
}

// Forma Blueprint's own uniqueName (both "Forma Blueprint" and "2X Forma
// Blueprint" reward rows share this exact uniqueName, confirmed
// 2026-09-25) - Components.json only has the generic shared "blueprint.png"
// for it (it's not a catalog Warframe/weapon, so
// resolveBlueprintTargetItemType below can't redirect it either), so it
// gets the same real Forma art the frontend's statusIcons.ts FORMA_ICON
// already uses, duplicated here since db.ts (server-side) can't import
// the frontend's constant.
const FORMA_BLUEPRINT_ITEM_TYPE = "/Lotus/Types/Recipes/Components/FormaBlueprint";
const FORMA_ICON = "https://wiki.warframe.com/images/thumb/Forma.png/300px-Forma.png?c7d01";

// Real icon for a relic reward row (2026-09-25 - "show the full
// weapon/Warframe/Forma picture for a Blueprint reward, not a generic
// gear icon"): Forma Blueprint first (a fixed special case - see above),
// then resolveBlueprintTargetItemType() (if this reward IS a Foundry
// Blueprint key, use the FULL Warframe/weapon it builds - see
// manufacturing.ts's header comment for exactly how the reverse mapping
// works), then the original two sources for everything else -
// resolveItemIcon() (Mods, the only non-Recipes-namespace category real
// reward rows use) and resolveComponentIcon() (Prime parts/components -
// these have no separate Blueprint, so resolveBlueprintTargetItemType
// never touches them, and they keep their own real distinct part icon
// rather than being redirected to anything). null for a reward with no
// itemType at all, or one none of these sources has - never a guessed
// icon.
function resolveRewardIcon(reward: RelicReward): string | null {
  if (!reward.itemType) return null;
  if (reward.itemType === FORMA_BLUEPRINT_ITEM_TYPE) return FORMA_ICON;
  const fullItemType = resolveBlueprintTargetItemType(reward.itemType);
  if (fullItemType) {
    const fullIcon = resolveItemIcon(fullItemType);
    if (fullIcon) return fullIcon;
  }
  return resolveItemIcon(reward.itemType) ?? resolveComponentIcon(reward.itemType);
}

export interface RelicItem {
  key: string;
  era: string;
  name: string;
  vaulted: boolean;
  // Resolved from the Intact tier's itemType, falling back to whichever
  // tier exists first for the ~handful of relics missing an Intact
  // entry - never null just because one specific tier's icon is absent.
  icon: string | null;
  // True if ANY refinement's ownedCount > 0.
  owned: boolean;
  refinements: RelicRefinementItem[];
}

// Fixed display order - real relic eras, not alphabetical. "Vanguard"
// (a newer era, 4 relics/16 entries, confirmed 2026-09-24) sorts last
// since it's outside the traditional Lith->Requiem progression.
const RELIC_ERA_ORDER = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Vanguard"];

// Same item_counts 'MiscItems' bucket relic ownership already flows
// into (see relicsCatalog.ts's header comment - relics are just
// resource-shaped entries from SNS's own perspective, same as Ferrite),
// scoped to relicsCatalog.ts's own uniqueName set via the same "only
// bump itemTypes this catalog knows about" guard getModsCollection()/
// getArcanesCollection() already use.
export function getRelicsCollection(): { items: RelicItem[]; iconStatus: ReturnType<typeof getIconStatus> } {
  const catalog = getRelicsCatalog();
  const catalogItemTypes = new Set(catalog.flatMap((entry) => entry.refinements.map((r) => r.itemType)));

  const countByItemType = new Map<string, number>();
  const miscRows = db
    .prepare(`SELECT item_type, count FROM item_counts WHERE category = 'MiscItems'`)
    .all() as { item_type: string; count: number }[];
  for (const row of miscRows) {
    if (!catalogItemTypes.has(row.item_type)) continue;
    countByItemType.set(row.item_type, (countByItemType.get(row.item_type) ?? 0) + row.count);
  }

  const items: RelicItem[] = catalog.map((entry) => {
    const refinements: RelicRefinementItem[] = entry.refinements.map((r) => ({
      refinement: r.refinement,
      ownedCount: countByItemType.get(r.itemType) ?? 0,
      rewards:
        resolveRelicRewards(r.itemType)?.map((reward) => ({
          itemName: reward.itemName,
          rarity: reward.rarity,
          chance: reward.chance,
          icon: resolveRewardIcon(reward),
        })) ?? null,
    }));
    const intact = entry.refinements.find((r) => r.refinement === "Intact") ?? entry.refinements[0];
    return {
      key: entry.key,
      era: entry.era,
      name: entry.name,
      vaulted: entry.vaulted,
      icon: intact ? resolveItemIcon(intact.itemType) : null,
      owned: refinements.some((r) => r.ownedCount > 0),
      refinements,
    };
  });

  items.sort(
    (a, b) => RELIC_ERA_ORDER.indexOf(a.era) - RELIC_ERA_ORDER.indexOf(b.era) || a.name.localeCompare(b.name),
  );

  return { items, iconStatus: getIconStatus() };
}

export function getDashboardSummary() {
  const currencies = db.prepare(`SELECT name, amount, updated_at FROM currencies`).all();
  const itemCountTotals = db
    .prepare(`SELECT category, COUNT(*) AS distinctItems, SUM(count) AS totalCount FROM item_counts GROUP BY category`)
    .all();
  const unlockCount = db.prepare(`SELECT COUNT(*) AS n FROM unlocks`).get() as { n: number };
  const lastSync = db
    .prepare(`SELECT synced_at, ok, note FROM sync_log ORDER BY id DESC LIMIT 1`)
    .get();

  return { currencies, itemCountTotals, unlockCount: unlockCount.n, lastSync };
}
