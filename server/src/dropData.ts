// Drop-rate data: WFCD's warframe-drop-data feed
// (https://github.com/WFCD/warframe-drop-data#api-endpoints), same
// community project family as the icon source (itemIcons.ts) and the
// modsCatalog/warframePortraits data. Two endpoints, per that repo's own
// README:
//   - info.json - small, just a content hash + timestamp, cheap to poll
//   - all.json  - the real payload (missions/relics/bounties/sorties/
//                 enemies/syndicates/dojo research/etc, several MB)
// Flattened once into a single flat DropRow[] the rest of this app (and,
// per the "modular" ask, ANY future tab - Relics ownership, a Wiki
// lookup, a Collection card's "where do I get this" link, etc.) can
// query by item OR by place OR by enemy without knowing any of the
// upstream table shapes. This module owns the fetch/cache/flatten/search
// pipeline; it has no UI and no opinion about which tab calls it.
//
// Flatten logic (pushRow/pushRewardContainer/flatten below) is a direct
// port of WFHelper's `services/dropData.ts`
// (`../other_software/WFHelper-2.1.0/`, see CLAUDE.md's "Primary
// feature-parity reference") - same upstream feed, already-solved
// shape-handling (rewards as a flat array vs. a {rotation: reward[]}
// map, the half-dozen differently-keyed table families), not re-derived
// from scratch. Two things deliberately NOT ported: the bundled
// ACQUISITION_ROWS quest-reward patch (WFHelper's own hand-maintained
// list for rewards missing from the random tables entirely - out of
// scope until this app actually needs one) and the dojo-research table
// (WFHelper reads it from a wiki-scraped file this project doesn't have
// a copy of - Dojo Rush Refund's guild-attribution blocker is the same
// class of problem, see project_database_scrapes_full_rescan memory).
// Both are additive if ever needed later; leaving them out doesn't lose
// any upstream data.
//
// No on-disk cache (unlike WFHelper's jsonCache-backed version) - this
// project's own convention for network-sourced reference data is a
// fire-and-forget in-memory load at module import (see itemIcons.ts,
// modsCatalog.ts's header comments); a `/api/drops/refresh` route lets
// the frontend re-pull on demand instead of polling automatically.
//
// ONE deliberate deviation from the WFHelper port, found 2026-09-24 via
// a real discrepancy report (Boar Blueprint from Drekar Trooper showing
// 100% here vs. the wiki's real 0.5%): `blueprintLocations`' per-enemy
// `chance` field is NOT the final drop probability - it's only that
// item's share WITHIN the enemy's own blueprint-reward pool (every
// blueprint an enemy can drop sums to ~100% there), and needs
// multiplying by that enemy's own `enemyBlueprintDropChance` (the real
// "does a blueprint drop happen at all" trigger chance) to get the true
// per-kill percentage - confirmed via a full scan of a live all.json
// pull: Boar Blueprint/Drekar Trooper is chance=100 (its ONLY possible
// blueprint, so 100% of that pool) × enemyBlueprintDropChance=0.5 = the
// real 0.5%. `modLocations`' mod-drop `chance` field does NOT have this
// problem - spot-checked against several real known values (e.g.
// Serration/Nauseous Void Shade's 11.06%, which matches the wiki
// directly), it's already the final resolved percentage, so mods are
// left untouched. WFHelper's own flatten() has this exact same
// blueprint bug (it uses the raw `chance` field unmodified, same as an
// earlier version of this file did) - not something to blindly re-port.
// `enemyBlueprintTables`/`enemyModTables` (the enemy -> items direction)
// are ALSO dropped from flatten() entirely below - confirmed via the
// same full scan that they're an exact-duplicate dual of
// blueprintLocations/modLocations (identical item+enemy pair sets, zero
// rows unique to either direction), so keeping both only risked
// re-introducing the uncorrected 100%-style value as a second row with
// no way to fix it (that direction never carries the
// enemyBlueprintDropChance field at all).

import { correctedDropRarity } from "./relicRarity.js";

const INFO_URL = "https://drops.warframestat.us/data/info.json";
const ALL_URL = "https://drops.warframestat.us/data/all.json";

export type DropKind =
  | "enemy"
  | "mission"
  | "bounty"
  | "relic"
  | "sortie"
  | "quest"
  | "syndicate"
  | "other";

export interface DropRow {
  item: string;
  // Where it drops (e.g. "Draco (Ceres), Rotation C", "Lith G1 Relic").
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

let rows: DropRow[] = [];
let loaded = false;
let loadError: string | null = null;
let loadedHash: string | null = null;
let updatedAt: string | null = null;
let refreshPromise: Promise<{ changed: boolean }> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// flattening - see this file's header comment for the WFHelper port note.

type Reward = {
  itemName?: string;
  item?: string;
  modName?: string;
  rarity?: string;
  chance?: number;
  rotation?: string;
  stage?: string;
  enemyName?: string;
  place?: string;
  // blueprintLocations entries only - see this file's header comment.
  // Always equal where both are present (confirmed via a full scan of a
  // live all.json pull, 2026-09-24) - WFCD just duplicates the same
  // value under two field names.
  enemyBlueprintDropChance?: number;
  enemyItemDropChance?: number;
};

function rewardName(r: Reward): string | null {
  return r.itemName || r.item || r.modName || null;
}

function pushRow(out: DropRow[], item: string | null, place: string, r: Reward, kind: DropKind): void {
  if (!item || !place) return;
  const raw = typeof r.chance === "number" ? r.chance : Number(r.chance);
  const chance = Number.isFinite(raw) ? raw : 0;
  out.push({
    item,
    place,
    rarity: correctedDropRarity(place, chance, r.rarity || ""),
    chance,
    kind,
  });
}

// blueprintLocations-only: `r.chance` there is just that item's share
// WITHIN the enemy's own blueprint pool (sums to ~100% across every
// blueprint that enemy can drop), not the final per-kill probability -
// see this file's header comment. Multiplying by the enemy's own
// enemyBlueprintDropChance/enemyItemDropChance ("does a blueprint drop
// happen at all") gives the real value.
function pushBlueprintRow(out: DropRow[], item: string | null, place: string, r: Reward): void {
  if (!item || !place) return;
  const poolShare = typeof r.chance === "number" ? r.chance : Number(r.chance);
  const triggerRaw =
    typeof r.enemyBlueprintDropChance === "number" ? r.enemyBlueprintDropChance : r.enemyItemDropChance;
  const trigger = typeof triggerRaw === "number" ? triggerRaw : Number(triggerRaw);
  // Rounded to 4dp - the multiplication otherwise leaves float noise
  // (e.g. 1.1381999999999999) in the raw served value.
  const chance =
    Number.isFinite(poolShare) && Number.isFinite(trigger) ? Math.round(((poolShare * trigger) / 100) * 10000) / 10000 : 0;
  out.push({
    item,
    place,
    rarity: correctedDropRarity(place, chance, r.rarity || ""),
    chance,
    kind: "enemy",
  });
}

/** Rewards may be a flat array or a {rotation: reward[]} map; emit either way. */
function pushRewardContainer(
  out: DropRow[],
  basePlace: string,
  rewards: Reward[] | Record<string, Reward[]> | undefined,
  kind: DropKind,
): void {
  const emit = (place: string, list: Reward[]): void => {
    for (const r of list) {
      let p = place;
      if (r.rotation) p += `, Rotation ${r.rotation}`;
      if (r.stage) p += ` (${r.stage})`;
      pushRow(out, rewardName(r), p, r, kind);
    }
  };
  if (Array.isArray(rewards)) {
    emit(basePlace, rewards);
  } else if (rewards && typeof rewards === "object") {
    for (const [rotation, list] of Object.entries(rewards)) {
      if (Array.isArray(list)) emit(`${basePlace}, Rotation ${rotation}`, list);
    }
  }
}

interface AllData {
  missionRewards?: Record<string, Record<string, { gameMode?: string; rewards?: unknown }>>;
  relics?: Array<{ tier?: string; relicName?: string; state?: string; rewards?: Reward[] }>;
  transientRewards?: Array<{ objectiveName?: string; rewards?: Reward[] }>;
  sortieRewards?: Reward[];
  keyRewards?: Array<{ keyName?: string; rewards?: Record<string, Reward[]> }>;
  modLocations?: Array<{ modName?: string; enemies?: Reward[] }>;
  blueprintLocations?: Array<{ itemName?: string; enemies?: Reward[] }>;
  resourceByAvatar?: Array<{ source?: string; items?: Reward[] }>;
  sigilByAvatar?: Array<{ source?: string; items?: Reward[] }>;
  additionalItemByAvatar?: Array<{ source?: string; items?: Reward[] }>;
  syndicates?: Record<string, Reward[]>;
  [key: string]: unknown;
}

const BOUNTY_KEYS = [
  "cetusBountyRewards",
  "solarisBountyRewards",
  "deimosRewards",
  "zarimanRewards",
  "entratiLabRewards",
  "hexRewards",
] as const;

function flatten(data: AllData): DropRow[] {
  const out: DropRow[] = [];

  // place -> rewards (rotations)
  for (const [planet, nodes] of Object.entries(data.missionRewards || {})) {
    for (const [node, info] of Object.entries(nodes || {})) {
      const place = `${node} (${planet})`;
      pushRewardContainer(out, place, (info?.rewards as Reward[]) || [], "mission");
    }
  }
  for (const relic of data.relics || []) {
    if (relic.state && relic.state !== "Intact") continue; // dedupe refinements
    const place = `${relic.tier} ${relic.relicName} Relic`;
    pushRewardContainer(out, place, relic.rewards || [], "relic");
  }
  for (const t of data.transientRewards || []) {
    pushRewardContainer(out, t.objectiveName || "Mission", t.rewards || [], "mission");
  }
  for (const r of data.sortieRewards || []) pushRow(out, rewardName(r), "Sortie", r, "sortie");
  for (const k of data.keyRewards || []) {
    pushRewardContainer(out, k.keyName || "Quest", k.rewards || {}, "quest");
  }
  for (const key of BOUNTY_KEYS) {
    const list = data[key] as Array<{ bountyLevel?: string; rewards?: Record<string, Reward[]> }> | undefined;
    for (const b of list || [])
      pushRewardContainer(out, b.bountyLevel || "Bounty", b.rewards || {}, "bounty");
  }

  // item -> enemies. (No separate "enemy -> items" pass for these two -
  // enemyModTables/enemyBlueprintTables are an exact-duplicate dual of
  // modLocations/blueprintLocations, confirmed via a full pair-set scan
  // of a live all.json pull, 2026-09-24 - pushing both directions only
  // risked a second, uncorrectable row for every blueprint, since that
  // direction never carries the enemyBlueprintDropChance field. See this
  // file's header comment.)
  for (const m of data.modLocations || []) {
    for (const e of m.enemies || []) pushRow(out, m.modName || null, e.enemyName || "", e, "enemy");
  }
  for (const b of data.blueprintLocations || []) {
    for (const e of b.enemies || []) pushBlueprintRow(out, b.itemName || null, e.enemyName || "", e);
  }

  // "byAvatar" tables are keyed by enemy too.
  for (const key of ["resourceByAvatar", "sigilByAvatar", "additionalItemByAvatar"] as const) {
    for (const s of data[key] || []) {
      for (const it of s.items || []) pushRow(out, rewardName(it), s.source || "", it, "enemy");
    }
  }

  // syndicates: already carry their own place
  for (const list of Object.values(data.syndicates || {})) {
    for (const r of list || []) pushRow(out, rewardName(r), r.place || "Syndicate", r, "syndicate");
  }

  // Upstream has duplicate reward entries; collapse identical rows. An
  // enemy row wins a tie so the name stays traceable to a real kill
  // source when a table lists the same drop twice.
  const byKey = new Map<string, DropRow>();
  for (const row of out) {
    const key = `${row.item}|${row.place}|${row.rarity}|${row.chance}`;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, row);
    else if (seen.kind !== "enemy" && row.kind === "enemy") byKey.set(key, row);
  }
  return [...byKey.values()];
}

export async function refreshFromUpstream(): Promise<{ changed: boolean }> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const info = await fetchJson<{ hash?: string }>(INFO_URL);
      const hash = info?.hash || "";
      if (hash && hash === loadedHash) {
        loaded = true;
        return { changed: false };
      }
      const all = await fetchJson<AllData>(ALL_URL);
      rows = flatten(all);
      loadedHash = hash;
      updatedAt = new Date().toISOString();
      loaded = true;
      loadError = null;
      console.log(`OpenTools: loaded ${rows.length} drop-table rows from drops.warframestat.us`);
      return { changed: true };
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      loaded = true; // still "done," just with whatever rows (possibly none) were already there
      console.warn(`OpenTools: drop-table refresh failed. ${loadError}`);
      return { changed: false };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Fire-and-forget at module load, same convention as itemIcons.ts -
// callers check getDropsStatus() rather than blocking on this.
const loadPromise = refreshFromUpstream();

export function getDropsStatus(): DropStatus {
  return { loaded, count: rows.length, error: loadError, updatedAt };
}

// Exposed for tests/tools that want to wait for the initial load rather
// than racing it - not used by the HTTP routes themselves.
export const dropsReadyPromise = loadPromise;

/** Substring search by item (default), place or enemy, ranked: prefix > word-start > contains. */
export function searchDrops(query: string, mode: DropSearchMode = "item", limit = 300): DropSearchResult {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return { rows: [], total: 0 };

  const scored: Array<{ row: DropRow; score: number }> = [];
  for (const row of rows) {
    if (mode === "enemy" && row.kind !== "enemy") continue;
    const field = (mode === "item" ? row.item : row.place).toLowerCase();
    const idx = field.indexOf(q);
    if (idx < 0) continue;
    const score = idx === 0 ? 0 : /\s/.test(field[idx - 1] || "") ? 1 : 2;
    scored.push({ row, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (b.row.chance ?? 0) - (a.row.chance ?? 0) ||
      a.row.item.localeCompare(b.row.item) ||
      a.row.place.localeCompare(b.row.place),
  );

  return { rows: scored.slice(0, limit).map((s) => s.row), total: scored.length };
}

// Exact (case-insensitive) item-name lookup - the hook other tabs use
// instead of the fuzzy search above, e.g. a future Collection card
// "where do I get this" link keyed off the item's own already-known
// display name. Real Public Export/WFCD display names line up with
// upstream's `item`/`itemName` field in spot checks (both ultimately
// trace to the same DE localization strings) but this hasn't been
// cross-checked exhaustively - a name that doesn't resolve here isn't
// necessarily absent from the real drop tables, it may just be spelled
// slightly differently upstream (e.g. a missing "Blueprint" suffix).
export function getDropsForItem(itemName: string): DropRow[] {
  const q = itemName.trim().toLowerCase();
  if (!q) return [];
  return rows.filter((r) => r.item.toLowerCase() === q);
}
