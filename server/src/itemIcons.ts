// Icon source for the Collection grid. Public Export's own "icon" field
// (itemNames.ts's source) only gives internal packed-game-asset paths
// (e.g. "/Lotus/Interface/Icons/StoreIcons/Warframes/Volt.png") - not
// hotlinkable. warframe.market (the icon source market-emulator already
// uses, see project_market_emulator memory) only catalogs TRADEABLE
// items - confirmed 2026-09-21 that plain "Volt" isn't on it at all,
// only "Volt Prime" variants are, which would leave most of a player's
// owned base-rank gear with no icon at all.
//
// Source used instead: the WFCD (Warframe Community Developers)
// warframe-items project's raw data files on GitHub, keyed by the exact
// same real `uniqueName` path SpaceNinjaServer uses for `ItemType` -
// confirmed live 2026-09-21 for all 5 of this app's equipment
// categories (Volt, HuntingBow/Paris, Pistol/Lato, Staff/Bo, Taxon all
// resolved correctly). Images are served via cdn.warframestat.us
// (redirects to the same repo's raw content) - a long-established,
// widely-used public community project (the same project behind
// warframestat.us, which this app's future Hub Dashboard is explicitly
// modeled on), not an ad-hoc source.
//
// This is a NETWORK dependency, unlike Public Export's local files -
// the server does not block startup on it (listens immediately), the
// icon map populates in the background, and any item not yet resolved
// (or if the fetch fails entirely) just has no icon rather than
// breaking anything else. Never assumed working without checking the
// actual fetch result.

const CATEGORY_FILES: Record<string, string> = {
  Suits: "Warframes.json",
  LongGuns: "Primary.json",
  Pistols: "Secondary.json",
  Melee: "Melee.json",
  Sentinels: "Sentinels.json",
  // Added for the Mods tab (2026-09-21) - confirmed WFCD also publishes
  // a Mods.json with the same uniqueName/imageName shape as every other
  // category here, keyed by the same real path ExportUpgrades.json uses
  // (modsCatalog.ts). Chosen over market-emulator's warframe.market-CDN
  // approach because warframe.market only lists TRADABLE items, which
  // would leave untradable mods with no icon at all - same reasoning
  // that already ruled out warframe.market for warframe/weapon icons
  // above.
  Mods: "Mods.json",
  // Added for companion weapon tracking (2026-09-21) - confirmed WFCD
  // also publishes a dedicated SentinelWeapons.json (24 entries), same
  // uniqueName/imageName shape, keyed by the same real path
  // ExportWeapons.json uses for this category (itemNames.ts).
  SentinelWeapons: "SentinelWeapons.json",
  // Archwing suits/Arch-Guns/Arch-Melee (2026-09-21) - confirmed via
  // `gh api repos/WFCD/warframe-items/contents/data/json` that
  // Archwing.json/Arch-Gun.json/Arch-Melee.json all exist in the repo
  // (not guessed by naming-convention analogy like some earlier entries
  // in this file). No "Hoverboard.json" exists in that same directory
  // listing - K-Drive parts (this app's `Hoverboards` category) have NO
  // WFCD icon source and are deliberately left out of this map rather
  // than guessing a filename that isn't there; they fall back to a
  // placeholder icon unless local extraction (localIcons.ts) is
  // configured.
  SpaceSuits: "Archwing.json",
  SpaceGuns: "Arch-Gun.json",
  SpaceMelee: "Arch-Melee.json",
  // Added for the Arcanes tab (2026-09-24) - confirmed via `gh api
  // repos/WFCD/warframe-items/contents/data/json` that Arcanes.json
  // exists (177 entries) with the same uniqueName/imageName shape as
  // every other category here, keyed by the same real path
  // ExportArcanes.json uses (arcanesCatalog.ts).
  Arcanes: "Arcanes.json",
  // Added for the Relics tab (2026-09-24) - confirmed via `gh api
  // repos/WFCD/warframe-items/contents/data/json` that Relics.json
  // exists (3204 entries), keyed by the same real per-quality-tier
  // uniqueName ExportRelics.json/relicsCatalog.ts use. Unlike every
  // other category file here, each entry ALSO carries that exact
  // quality tier's own reward table directly - captured below into
  // relicRewardsByItemType alongside the icon, same pass.
  Relics: "Relics.json",
  // Added for the Zaw/Kitgun-parts sub-categories (2026-09-25, later
  // split into two - see itemNames.ts). Confirmed live via a real fetch:
  // Zaw pieces (Ostron/Melee/...) are in Melee.json (already fetched via
  // the Melee entry above; listed again here for clarity, not because it
  // adds anything new), while the Kitgun pieces (SolarisUnited/...,
  // Infested/Pistols/InfKitGun/...) are NOT in Secondary.json at all -
  // they're only in Misc.json. iconByItemType below is a single flat map
  // merged across every unique file in this object regardless of which
  // key pointed at it, so listing Misc.json here is enough to pull the
  // missing Kitgun icons in - no per-category dispatch needed.
  ZawParts: "Melee.json",
  KitgunParts: "Misc.json",
};

const BASE_URL = "https://raw.githubusercontent.com/wfcd/warframe-items/master/data/json/";

interface WfcdEntry {
  uniqueName?: string;
  imageName?: string;
  // Only present on Mods.json entries (1578/1806 mods, confirmed
  // 2026-09-22) - a direct wiki.warframe.com full-size card image, not a
  // downscaled thumbnail despite the field name (same URL shape as the
  // user's own reference example). Meaningfully higher quality than the
  // cdn.warframestat.us icon this app otherwise uses everywhere - used
  // ONLY for the Mods tab's hover preview (modPreviewByItemType below),
  // not as a replacement for the regular grid icon anywhere.
  wikiaThumbnail?: string;
  // Only present on Arcanes.json entries (confirmed 2026-09-24 via a
  // real fetch) - the equipment slot the arcane sockets into ("Warframe
  // Arcane", "Secondary Arcane", "Operator Arcane", "Amp Arcane", "Zaw
  // Arcane", "Kitgun Arcane", ..., plus a bare "Arcane" for 7
  // generic/legacy entries). Local Public Export's ExportArcanes.json has
  // no equivalent field - this is the ONLY source for it, unlike every
  // other per-item field this app tracks. Used ONLY for the Arcanes tab's
  // Category filter (arcaneCategoryByItemType below), mirroring
  // modsCatalog.ts's CATEGORY_LABELS friendly-label pattern.
  type?: string;
  // Only present on Relics.json entries (confirmed 2026-09-24 via a
  // real fetch) - THIS SPECIFIC quality tier's own reward table,
  // already scoped to the right refinement (fetching the Radiant
  // variant's entry gives Radiant odds directly, no separate join
  // needed). Captured into relicRewardsByItemType below.
  rewards?: WfcdRelicReward[];
}

export interface RelicReward {
  itemName: string;
  // Real WFCD values: "Common"/"Uncommon"/"Rare".
  rarity: string;
  chance: number;
  // The reward item's own real uniqueName (WFCD's `item.uniqueName`,
  // present on 19180/19184 real reward rows checked 2026-09-25) - kept
  // raw here (not yet resolved to an icon URL) since resolving it needs
  // manufacturing.ts's Components.json map, a separate async load this
  // module has no reason to depend on. db.ts resolves the actual icon
  // per-request via resolveComponentIcon() (manufacturing.ts) once this
  // reaches getRelicsCollection(). null for the handful of reward rows
  // WFCD itself has no uniqueName for.
  itemType: string | null;
}

interface WfcdRelicReward {
  chance?: number;
  rarity?: string;
  item?: { name?: string; uniqueName?: string };
}

// Raw WFCD `type` -> this app's own friendly label, same "drop the
// redundant suffix" treatment modsCatalog.ts's CATEGORY_LABELS gives
// ExportUpgrades.json's raw type enum. Bare "Arcane" (7 generic/legacy
// entries with no more specific slot) maps to "Other" rather than a
// confusing bare "Arcane" option sitting next to "Warframe"/"Melee"/etc.
const ARCANE_CATEGORY_LABELS: Record<string, string> = {
  "Warframe Arcane": "Warframe",
  "Operator Arcane": "Operator",
  "Primary Arcane": "Primary",
  "Secondary Arcane": "Secondary",
  "Melee Arcane": "Melee",
  "Shotgun Arcane": "Shotgun",
  "Bow Arcane": "Bow",
  "Amp Arcane": "Amp",
  "Zaw Arcane": "Zaw",
  "Kitgun Arcane": "Kitgun",
  Arcane: "Other",
};

const iconByItemType = new Map<string, string>();
const modPreviewByItemType = new Map<string, string>();
const arcaneCategoryByItemType = new Map<string, string>();
const relicRewardsByItemType = new Map<string, RelicReward[]>();
let loaded = false;
let loadError: string | null = null;

async function loadIcons(): Promise<void> {
  const uniqueFiles = [...new Set(Object.values(CATEGORY_FILES))];
  const results = await Promise.allSettled(
    uniqueFiles.map(async (file) => {
      const res = await fetch(BASE_URL + file);
      if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
      const entries = (await res.json()) as WfcdEntry[];
      for (const entry of entries) {
        if (entry.uniqueName && entry.imageName) {
          iconByItemType.set(entry.uniqueName, `https://cdn.warframestat.us/img/${entry.imageName}`);
        }
        if (file === "Mods.json" && entry.uniqueName && entry.wikiaThumbnail) {
          modPreviewByItemType.set(entry.uniqueName, entry.wikiaThumbnail);
        }
        if (file === "Arcanes.json" && entry.uniqueName && entry.type) {
          arcaneCategoryByItemType.set(entry.uniqueName, ARCANE_CATEGORY_LABELS[entry.type] ?? "Other");
        }
        if (file === "Relics.json" && entry.uniqueName && entry.rewards) {
          const rewards: RelicReward[] = [];
          for (const r of entry.rewards) {
            if (r.item?.name && r.rarity && typeof r.chance === "number") {
              rewards.push({
                itemName: r.item.name,
                rarity: r.rarity,
                chance: r.chance,
                itemType: r.item.uniqueName ?? null,
              });
            }
          }
          if (rewards.length > 0) relicRewardsByItemType.set(entry.uniqueName, rewards);
        }
      }
    }),
  );

  const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failures.length > 0) {
    loadError = failures.map((f) => String(f.reason)).join("; ");
    console.warn(`OpenTools: some icon sources failed to load - icons for those categories will be missing. ${loadError}`);
  }
  loaded = true;
  console.log(`OpenTools: loaded ${iconByItemType.size} item icons from cdn.warframestat.us`);
}

// Fire-and-forget at module load - callers check iconsReady()/getIconStatus()
// rather than blocking on this.
const loadPromise = loadIcons().catch((err) => {
  loadError = err instanceof Error ? err.message : String(err);
  loaded = true; // still "done," just with zero icons - don't retry forever on every request
  console.warn(`OpenTools: icon loading failed entirely - Collection will show no icons. ${loadError}`);
});

export function resolveItemIcon(itemType: string): string | null {
  return iconByItemType.get(itemType) ?? null;
}

// Falls back to the regular icon (still real, just lower-res) when a mod
// has no wikiaThumbnail - never null just because the higher-quality
// source is missing for that one entry.
export function resolveModPreview(itemType: string): string | null {
  return modPreviewByItemType.get(itemType) ?? iconByItemType.get(itemType) ?? null;
}

// null until this background fetch finishes (same as resolveItemIcon)
// or for the handful of entries WFCD itself has no `type` for - never
// guessed, and never blocks the Arcanes tab from rendering in the
// meantime (see getArcanesCollection's iconStatus-driven "loading" hint,
// same pattern the icon map itself already uses).
export function resolveArcaneCategory(itemType: string): string | null {
  return arcaneCategoryByItemType.get(itemType) ?? null;
}

// null until this background fetch finishes, or if WFCD genuinely has
// no reward table for this exact quality-tier uniqueName (never
// fabricated) - same convention as resolveArcaneCategory above.
export function resolveRelicRewards(itemType: string): RelicReward[] | null {
  return relicRewardsByItemType.get(itemType) ?? null;
}

export function getIconStatus(): { loaded: boolean; count: number; error: string | null } {
  return { loaded, count: iconByItemType.size, error: loadError };
}

// Exposed for tests/tools that want to wait for the initial load rather
// than racing it - not used by the HTTP routes themselves (they should
// stay responsive even if this never resolves).
export const iconsReadyPromise = loadPromise;
