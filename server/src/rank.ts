// Converts an item's raw affinity (XP) into a displayable rank, e.g.
// "17/30".
//
// REPLACED 2026-09-21, third and (hopefully) final version - the two
// earlier attempts are kept as history below since this took real
// wrong turns worth not repeating:
//
// 1. Started with a single uniform 1000*rank^2 curve (900,000 XP for
//    rank 30) for every category, cited from a comment in
//    SpaceNinjaServer's inventoryController.ts ("enough for rank 30
//    per wiki").
// 2. After a bug report (weapons under-ranked despite being maxed
//    in-game), switched to per-category thresholds (800k weapons/1.6M
//    Suits) taken from SpaceNinjaServer's admin "Max Rank All
//    Equipment" CHEAT tool (static/webui/script.js's
//    maxRankAllEquipment()). This was WRONG - it broke a confirmed-good
//    case (Frost, real XP 1,302,896, confirmed maxed in-game, would
//    show 27/30 under a 1.6M threshold). Reverted same-day.
// 3. **This version**: found the webui's own DISPLAY code (not a cheat
//    tool - the literal rendering logic that decides what rank number
//    to show a user browsing their inventory), same file, ~line 1405:
//      `let maxXP = Math.pow(itemMap[item.ItemType]?.maxLevelCap ?? 30, 2) * 1000;`
//      `if (![Suits, SpaceSuits, Hoverboards, MechSuits, Sentinels,
//            MoaPets, KubrowPets].includes(category)) { maxXP /= 2; }`
//    i.e. maxXP = maxLevelCap^2 * 1000, HALVED for weapons/everything
//    else. For the default maxLevelCap of 30: 900,000 for Suits/
//    Sentinels (unchanged from the original formula - consistent with
//    Frost staying correct), **450,000 for weapons** (half of the old
//    uniform value, NOT the 800,000 the cheat tool used). Verified
//    against every real data point available before adopting this:
//    Frost (Suit, 1,302,896 XP, confirmed maxed) -> 30/30 correct, AND
//    every previously-"wrong" weapon (Astilla 473,412, Boltor 519,205,
//    Braton 498,320, Burston 453,672, Cernos 463,254, Dera 456,448,
//    Drakgoon 471,188, Hind 454,906, Latron 467,680, Kohm 495,139,
//    Grakata 519,503, Corinth 672,777) -> all correctly compute 30/30
//    now. This is the first version with a FULL set of confirmed real
//    examples behind it, not just one citation or one counter-example.
//
// maxLevelCap comes from Public Export (itemNames.ts's getMaxLevelCap())
// - almost always absent/30 (the default), present on ~52 real
// Legendary-tier weapons (Kuva/Tenet/Coda) that rank past 30 with a
// Legendary Core, confirmed in the local Public Export dump.
//
// CAVEAT: the maxLevelCap>30 case is UNVERIFIED against any real
// example - none of the items confirmed correct above have one. This
// implementation extends the SAME formula the webui literally uses
// (Math.pow(maxLevelCap, 2) * 1000) rather than guessing something
// different, but Legendary-rank progression in the real game is
// achieved by consuming a Legendary Core item, not by earning more
// affinity - it's plausible the webui's own formula doesn't actually
// reflect how that progression works in practice for cap>30 items, only
// that it's literally what that code computes. If a Legendary-tier
// item's displayed rank is ever reported wrong, this is the first place
// to question - the cap=30 case above has real confirmed examples
// behind it, this one doesn't.
//
// CATEGORIES_NOT_HALVED matches the exact list from the webui source
// above. Our app currently has Suits/LongGuns/Pistols/Melee/Sentinels
// (see DEVLOG.md's 2026-09-21 field-shape entry) plus SentinelWeapons
// (added 2026-09-21 on an unattested lead, see the WFHelper-sourced
// DEVLOG entry) - correctly left OUT of this set, since a third-party
// source (WFHelper's masteryHelper.ts) independently treats companion
// weapons at the WEAPON affinity rate, not the suit rate, matching this
// app's default (halved) behavior for any category not listed here. The
// other entries in the source list (SpaceSuits/Hoverboards/MechSuits/
// MoaPets/KubrowPets) are kept here for when/if this app ever tracks
// those categories, so this doesn't need re-deriving later.
const MAX_RANK = 30;
const CATEGORIES_NOT_HALVED = new Set([
  "Suits",
  "SpaceSuits",
  "Hoverboards",
  "MechSuits",
  "Sentinels",
  "MoaPets",
  "KubrowPets",
]);

export function xpToRank(xp: number, category?: string, maxLevelCap?: number | null): { rank: number; maxRank: number } {
  const cap = maxLevelCap ?? 30;
  let maxXp = cap * cap * 1000;
  if (!category || !CATEGORIES_NOT_HALVED.has(category)) {
    maxXp /= 2;
  }
  const xpPerRankSquared = maxXp / (cap * cap);
  const rank = Math.min(cap, Math.floor(Math.sqrt(Math.max(0, xp) / xpPerRankSquared)));
  return { rank, maxRank: cap };
}
