// Fixed, well-known WFCD (cdn.warframestat.us) icon URLs for the small
// per-item status badges (Forma, Catalyst/Reactor, Exilus adapter).
// Confirmed 2026-09-21 by fetching each URL and visually inspecting the
// result - these are the real Warframe icons, not placeholders, despite
// some file names (e.g. GenericComponent.png for Forma) sounding
// generic. Filenames come from WFCD's warframe-items Misc.json
// (uniqueName/imageName pairs matching the same real Public Export
// paths this app's catalog already uses):
//   Forma            -> /Lotus/Types/Items/MiscItems/Forma
//   Orokin Catalyst  -> /Lotus/Types/Items/MiscItems/OrokinCatalyst
//   Orokin Reactor   -> /Lotus/Types/Items/MiscItems/OrokinReactor
//   Exilus Warframe Adapter -> /Lotus/Types/Items/MiscItems/UtilityUnlocker
//   Exilus Weapon Adapter   -> /Lotus/Types/Items/MiscItems/WeaponUtilityUnlocker
// These are fixed, static assets - no per-item lookup needed, unlike the
// dynamic catalog icons resolved server-side in itemIcons.ts.
const CDN_BASE = "https://cdn.warframestat.us/img/";

// Swapped 2026-09-23 for the real in-game Forma icon (wiki.warframe.com's
// own asset), per the user's direct ask - WFCD's GenericComponent.png
// (despite being the real underlying asset per Misc.json, see header
// comment) read as too generic/component-like at this icon's small size.
// Shown as-is via .item-status-icon (object-fit: contain, no filter) -
// no recolor/invert applied, unlike MASTERED_ICON below.
export const FORMA_ICON = "https://wiki.warframe.com/images/thumb/Forma.png/300px-Forma.png?c7d01";
export const CATALYST_ICON = CDN_BASE + "ComponentCatalyst.png";
export const REACTOR_ICON = CDN_BASE + "ComponentReactor.png";
export const EXILUS_WARFRAME_ICON = CDN_BASE + "UtilityModule.png";
export const EXILUS_WEAPON_ICON = CDN_BASE + "UtilityWeaponModule.png";
// WFCD's Misc.json calls this uniqueName "Helminth Segment" (imageName
// HelmithSegmentBp.png - the internal asset filename itself has a typo,
// "Helmith" not "Helminth", confirmed real on cdn.warframestat.us, not a
// typo introduced here). This is the closest real, correctly-labeled
// "Helminth" asset found in Public Export/WFCD - not the fanged-mouth
// mascot art some wiki pages use, since no such asset exists in either
// source. Swap this constant if a better one turns up later.
export const HELMINTH_ICON = CDN_BASE + "HelmithSegmentBp.png";

// The real in-game "Mastered" badge (the checkmark shown on a maxed item
// in Arsenal/Market/Foundry once it's hit its rank cap), not a text glyph
// stand-in. Not on WFCD's per-item CDN (it's a UI/text-icon asset, not an
// item icon) - sourced instead from wiki.warframe.com's own asset mirror
// of the game's `<MASTERED>` text-icon tag (`IconMastered(xWhite).png`),
// confirmed 2026-09-23 via a direct HTTP fetch (200, image/png, 512x512,
// CORS-open via `access-control-allow-origin: *`).
export const MASTERED_ICON =
  "https://wiki.warframe.com/images/IconMastered%28xWhite%29.png?4fcac&20230429144230";

// Mastery Rank requirement badge (top-left corner of a Collection card,
// 2026-09-25). No single generic "MR requirement" icon exists on WFCD's
// CDN or in the wiki's template system (checked before building this -
// per house rule, never fabricate one) - what DOES exist, and is what
// the user pointed to, is the wiki's own "Text Icons" page
// (wiki.warframe.com/w/Text_Icons#XP/Rank): the real in-game inline
// `<RANK_N>` glyph used to show a Tenno's OWN Mastery Rank inline in
// text, one distinct icon per rank (IconRank0.png..IconRank51+.png,
// confirmed 2026-09-25 - real PNG, 200, CORS-open). Reused here for an
// ITEM's Mastery Rank REQUIREMENT instead - same real per-rank icon
// DE ships, just applied to "the rank you need" rather than "the rank
// you are". Confirmed real weapon masteryReq values top out at 17 in
// the local Public Export dump, well inside the wiki's covered range.
export function masteryRankIconFor(rank: number): string {
  return `https://wiki.warframe.com/images/IconRank${rank}.png`;
}

// Suits/Sentinels take an Orokin Reactor + Warframe Exilus Adapter;
// everything else (weapons, companion weapons) takes an Orokin Catalyst
// + Weapon Exilus Adapter - same underlying Features bits either way
// (see ../../DEVLOG.md's 2026-09-21 "Catalyst/Reactor/Exilus confirmed"
// entry), just a different real-world name/icon per category.
const SUIT_LIKE_CATEGORIES = new Set(["Suits", "Sentinels"]);

export function isSuitLikeCategory(category: string): boolean {
  return SUIT_LIKE_CATEGORIES.has(category);
}

export function capacityIconFor(category: string): string {
  return isSuitLikeCategory(category) ? REACTOR_ICON : CATALYST_ICON;
}

export function capacityLabelFor(category: string): string {
  return isSuitLikeCategory(category) ? "Orokin Reactor" : "Orokin Catalyst";
}

export function exilusIconFor(category: string): string {
  return isSuitLikeCategory(category) ? EXILUS_WARFRAME_ICON : EXILUS_WEAPON_ICON;
}
