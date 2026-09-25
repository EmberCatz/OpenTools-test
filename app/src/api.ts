// Thin wrapper around OpenTools' own local server/ (see ../../server).
// Uses the webview's plain fetch, NOT the Tauri HTTP plugin - unlike
// OpenWF Mod Manager's bootstrapperApi.ts (which talks to the OpenWF
// Bootstrapper, a target that sends no CORS headers), server/ is this
// project's own code and already sends permissive CORS headers
// (see server/src/index.ts), so plain fetch works and stays directly
// testable against the Vite dev server without a real Tauri window.
// The Tauri http plugin is still wired into the app (Cargo.toml,
// capabilities/default.json) for future non-CORS targets like the
// Bootstrapper, once the Settings Port feature needs it.

// Overridable via a VITE_OPENTOOLS_PORT env var (Vite exposes any
// VITE_-prefixed env var through import.meta.env automatically, no config
// needed) so a scratch dev server can point this app at its own isolated
// backend port without editing this file - see
// "Launch OpenTools (Scratch).bat", added 2026-09-22 specifically to stop
// this port constant needing a manual edit/revert every time a scratch
// instance was needed for visual verification (see DEVLOG.md's
// 2026-09-22 mod-card entries for the repeated pain this caused).
const OPENTOOLS_PORT = Number(import.meta.env.VITE_OPENTOOLS_PORT ?? 7891); // must match server/src/index.ts's default OPENTOOLS_PORT

function baseUrl(): string {
  return `http://127.0.0.1:${OPENTOOLS_PORT}`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`${path} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface StatusResponse {
  schemaVersion: number;
  uptimeMs: number;
  sync: {
    connected: boolean;
    lastPushAt: number | null;
  };
}

export interface DashboardResponse {
  currencies: { name: string; amount: number; updated_at: string }[];
  itemCountTotals: { category: string; distinctItems: number; totalCount: number }[];
  unlockCount: number;
  lastSync: { synced_at: string; ok: number; note: string | null } | undefined;
}

export function getStatus(): Promise<StatusResponse> {
  return getJson<StatusResponse>("/api/status");
}

export function getDashboard(): Promise<DashboardResponse> {
  return getJson<DashboardResponse>("/api/dashboard");
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
  // Forma count (Polarized field) - field name confirmed against a local
  // SpaceNinjaServer source checkout, see ../../DEVLOG.md's 2026-09-21
  // "Catalyst/Reactor/Exilus confirmed" entry. Real account values not
  // yet eyeballed against known ground truth.
  formaCount: number | null;
  // DOUBLE_CAPACITY feature bit - Orokin Catalyst (weapons) / Orokin
  // Reactor (Suits/Sentinels). Same confidence tier as formaCount.
  capacityBoosted: boolean | null;
  // UTILITY_SLOT feature bit - Exilus adapter installed. Same confidence
  // tier as formaCount.
  exilusInstalled: boolean | null;
  // Helminth-subsumed duplicate tile - null for anything that isn't a
  // non-Prime Warframe. See ../../DEVLOG.md's 2026-09-21 Helminth/
  // Incarnon entry.
  helminthSubsumed: boolean | null;
  // Incarnon Genesis duplicate tile - true for the ~45 real Incarnon-
  // eligible weapons, always a real boolean (never null).
  incarnonEligible: boolean;
  incarnonInstalled: boolean;
  // The weapon's real, distinct Incarnon Genesis art - null unless
  // incarnonEligible is true.
  incarnonIcon: string | null;
  // "Progenitor Element", from Public Export's own real
  // `nemesisUpgradeTag` field. NOT a combat trait of the Warframe
  // itself - see server/src/warframePortraits.ts and
  // warframeElements.ts's header comments for what this actually means
  // (the Adversary System's Progenitor Warframe mechanic) and real
  // future use cases. Not currently shown anywhere in the UI. Only ever
  // set for Suits - null for every other category, and null for the
  // handful of Suits entries (Necramechs etc.) that don't participate in
  // the Adversary System.
  progenitorElement: string | null;
  // Real transparent full-body wiki render, for the Collection tab's
  // hover preview - null for non-Suits categories or an unmatched Suits
  // entry. See server/src/warframePortraits.ts.
  portraitImage: string | null;
  // Whether this item has EVER hit max rank (persists across a later
  // Forma reset, unlike `rank`) - from SNS's real XPInfo field. null
  // when there's no mastery data for this item yet (never ranked, or
  // the sync script hasn't pushed masteryXp for this account yet) -
  // distinct from false ("confirmed not mastered").
  mastered: boolean | null;
  // One icon per real Foundry ingredient this item needs (its own
  // Blueprint plus any sub-component/relic-part recipes) - see
  // server/src/manufacturing.ts's header comment for exactly where this
  // graph and its labels/icons come from. null for anything with no
  // matching Recipe in Public Export at all (not buildable via Foundry).
  // "crafted" (green check) means that part is actually built/ready to
  // use (or, for the item's own Blueprint slot, that the whole item is
  // owned); "owned" means only the blueprint for that part is held, not
  // yet built.
  manufacturingRequirements: { label: string; icon: string | null; state: "missing" | "owned" | "crafted" }[] | null;
  // Mastery Rank required to USE the item (not to build/acquire it) -
  // see server/src/itemNames.ts's getMasteryReq comment. null when
  // Public Export has no such field at all (Sentinels/companions - no
  // real requirement exists); 0 is a real, distinct value (Warframes,
  // MR0 starter weapons) meaning "no requirement" - only render the
  // badge when this is a positive number, matching the real in-game
  // Arsenal (which never shows "Mastery Rank 0 Required").
  masteryReq: number | null;
}

export interface CollectionResponse {
  items: CollectionItem[];
  iconStatus: { loaded: boolean; count: number; error: string | null };
  // Whether server/src/localIcons.ts is configured (OPENTOOLS_WARFRAME_CACHE_DIR
  // set + the exporter CLI found) - individual items' `icon` URLs already
  // prefer local extraction over the network source when both exist, so
  // this is informational only, not currently surfaced in the UI.
  localExtractionAvailable: boolean;
}

export function getCollectionData(): Promise<CollectionResponse> {
  return getJson<CollectionResponse>("/api/collection");
}

export interface ModItem {
  itemType: string;
  name: string;
  icon: string | null;
  // Full-size wiki card image for the hover preview - see
  // server/src/itemIcons.ts's resolveModPreview(). Never null (falls
  // back to `icon` server-side when no dedicated wiki image exists).
  previewImage: string | null;
  owned: boolean;
  ownedCount: number;
  rank: number | null;
  maxRank: number;
  // See server/src/modsCatalog.ts's CATEGORY_LABELS - a friendly label
  // ("Warframe", "Primary", "Melee", ...) derived from the mod's real
  // ExportUpgrades.json `type` field. "Other" for mods whose type isn't
  // in that map. One value per mod - drives the Mods "Category" filter.
  category: string;
  // The real https://wiki.warframe.com/w/Category:Mods subcategory list
  // (Bow Mods, Amalgam Mods, Set Mods, ...) this mod belongs to, scraped
  // from the wiki itself (server/src/modSubcategories.ts). Zero, one, or
  // several per mod. Drives the Mods "Subcategories" filter.
  subcategories: string[];
  // Real ExportUpgrades.json rarity (COMMON/UNCOMMON/RARE/LEGENDARY) -
  // null for the handful of entries missing it. See App.tsx's
  // rarityColor() for the color-coding caveat (no sourced hex table
  // exists for these tiers, best-effort approximation only).
  rarity: string | null;
  // Resolved polarity display name + official wiki icon URL
  // (server/src/polarityIcons.ts) - null when the mod has no
  // player-visible polarity.
  polarity: { name: string; icon: string } | null;
  // Mod capacity drain at rank 0 / maxRank (server/src/modsCatalog.ts).
  // Can be negative (Aura mods).
  drainMin: number | null;
  drainMax: number | null;
}

export interface ModsCollectionResponse {
  items: ModItem[];
  iconStatus: { loaded: boolean; count: number; error: string | null };
}

export function getModsCollectionData(): Promise<ModsCollectionResponse> {
  return getJson<ModsCollectionResponse>("/api/collection/mods");
}

export interface ArcaneItem {
  itemType: string;
  name: string;
  icon: string | null;
  owned: boolean;
  ownedCount: number;
  rank: number | null;
  // Varies per-arcane (5 for the standard tier, 3 for a handful of older
  // Warframe-slot arcanes) - see server/src/arcanesCatalog.ts.
  maxRank: number;
  // Real ExportArcanes.json rarity (COMMON/UNCOMMON/RARE/LEGENDARY) -
  // null for the handful of entries missing it.
  rarity: string | null;
  // The equipment slot this arcane sockets into ("Warframe", "Melee",
  // "Operator", "Amp", ...) - a network-only field (WFCD's Arcanes.json
  // `type`, no local Public Export equivalent), so null until that
  // background fetch resolves. Drives the Arcanes tab's Category filter.
  category: string | null;
}

export interface ArcanesCollectionResponse {
  items: ArcaneItem[];
  iconStatus: { loaded: boolean; count: number; error: string | null };
}

export function getArcanesCollectionData(): Promise<ArcanesCollectionResponse> {
  return getJson<ArcanesCollectionResponse>("/api/collection/arcanes");
}

export interface RelicReward {
  itemName: string;
  // Real WFCD values: "Common"/"Uncommon"/"Rare".
  rarity: string;
  chance: number;
  // Real icon (Components.json for Prime parts/components, or the same
  // network icon source every other tab uses for anything else, e.g.
  // Mods) - see server/src/db.ts's resolveRewardIcon comment. null for
  // the small handful WFCD/Components.json has no match for at all
  // (never a guessed icon).
  icon: string | null;
}

export interface RelicRefinementItem {
  refinement: string;
  ownedCount: number;
  // null until the background WFCD fetch resolves, or if that exact
  // quality tier genuinely has no reward table.
  rewards: RelicReward[] | null;
}

export interface RelicItem {
  key: string;
  era: string;
  name: string;
  vaulted: boolean;
  icon: string | null;
  owned: boolean;
  // 1-4 entries - only the quality tiers this relic actually has.
  refinements: RelicRefinementItem[];
}

export interface RelicsCollectionResponse {
  items: RelicItem[];
  iconStatus: { loaded: boolean; count: number; error: string | null };
}

export function getRelicsCollectionData(): Promise<RelicsCollectionResponse> {
  return getJson<RelicsCollectionResponse>("/api/collection/relics");
}

// Drop-rate data (server/src/dropData.ts, WFCD's warframe-drop-data feed
// - https://github.com/WFCD/warframe-drop-data#api-endpoints). Kept as
// its own section, deliberately not tied to the Drop Rates tab below -
// any other tab can import these same functions/types to look up "where
// does X drop" without knowing anything about the search UI.
export type DropKind = "enemy" | "mission" | "bounty" | "relic" | "sortie" | "quest" | "syndicate" | "other";

export interface DropRow {
  item: string;
  place: string;
  rarity: string;
  chance: number | null;
  kind: DropKind;
}

export type DropSearchMode = "item" | "place" | "enemy";

export interface DropSearchResult {
  rows: DropRow[];
  total: number;
}

export interface DropStatus {
  loaded: boolean;
  count: number;
  error: string | null;
  updatedAt: string | null;
}

export function getDropsStatus(): Promise<DropStatus> {
  return getJson<DropStatus>("/api/drops/status");
}

export function searchDrops(query: string, mode: DropSearchMode, limit = 300): Promise<DropSearchResult> {
  const params = new URLSearchParams({ q: query, mode, limit: String(limit) });
  return getJson<DropSearchResult>(`/api/drops/search?${params.toString()}`);
}

// Exact-name lookup - the hook other tabs use instead of the fuzzy
// search above (see searchDrops's doc comment on the server side).
export function getDropsForItem(itemName: string): Promise<{ rows: DropRow[] }> {
  return getJson<{ rows: DropRow[] }>(`/api/drops/item/${encodeURIComponent(itemName)}`);
}

// "Where do I get this" for a plain Collection card (Warframes/weapons/
// companions/Archwing/K-Drive) - see server/src/db.ts's
// getDropSourcesForCollectionItem comment for why this is a separate,
// precise, manufacturing-requirements-driven lookup rather than the
// fuzzy searchDrops() or the relic-reward exact getDropsForItem() above
// (a Collection card's own bare name, e.g. "Volt Prime", never appears
// as an exact drop-table entry itself - only its Blueprint/component/
// part rewards do).
export function getDropSourcesForCollectionItem(itemType: string): Promise<{ rows: DropRow[] }> {
  const params = new URLSearchParams({ itemType });
  return getJson<{ rows: DropRow[] }>(`/api/collection/drop-sources?${params.toString()}`);
}

export async function refreshDrops(): Promise<{ changed: boolean; status: DropStatus }> {
  const res = await fetch(`${baseUrl()}/api/drops/refresh`, { method: "POST" });
  if (!res.ok) throw new Error(`/api/drops/refresh failed: HTTP ${res.status}`);
  return (await res.json()) as { changed: boolean; status: DropStatus };
}
