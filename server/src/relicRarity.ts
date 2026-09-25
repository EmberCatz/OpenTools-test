// Relic reward rarity correction, split out of dropData.ts so any future
// consumer (a Relics tab's own refinement picker, say) can reuse it
// without pulling in the whole drop-table module.
//
// DE's own drop-table export mislabels a chunk of relic rewards' rarity
// (the "Rare" chance-band items sometimes carry a stale "Common"/
// "Uncommon" string from an older table revision) - the real rarity is
// reliably recoverable from the reward's OWN drop chance plus which
// refinement (Intact/Exceptional/Flawless/Radiant) the relic row is for,
// since each refinement's three reward slots always land on one of a
// small, fixed set of chance values. Ported 2026-09-24 from WFHelper's
// `services/relicRarity.ts` (`../other_software/WFHelper-2.1.0/`) - see
// its `tests/main/dropData.test.ts` for the upstream cases this table was
// checked against. Not independently re-derived here; flagged per this
// project's "verify, don't assert" standard as inherited-not-attested
// against OpenTools' own drop-data fetch specifically, though the
// underlying chance bands are DE mechanic constants, not something that
// varies by data source.
type RelicRefinement = "intact" | "exceptional" | "flawless" | "radiant";

const CHANCE_RARITY: Record<RelicRefinement, [number, string][]> = {
  intact: [
    [25.33, "Common"],
    [11, "Uncommon"],
    [2, "Rare"],
  ],
  exceptional: [
    [23.33, "Common"],
    [13, "Uncommon"],
    [4, "Rare"],
  ],
  flawless: [
    [20, "Common"],
    [17, "Uncommon"],
    [6, "Rare"],
  ],
  radiant: [
    [16.67, "Common"],
    [20, "Uncommon"],
    [10, "Rare"],
  ],
};

function relicRewardRarity(refinement: string, chance: number, fallback: string): string {
  const table = CHANCE_RARITY[refinement.toLowerCase() as RelicRefinement];
  if (!table) return fallback;
  for (const [expected, rarity] of table) {
    if (Math.abs(chance - expected) < 0.5) return rarity;
  }
  return fallback;
}

// A drop-row place string looks like "Lith G1 Relic" (bare = Intact) or
// "Lith G1 Relic (Radiant)" once a refinement is folded in.
function relicRefinementFromPlace(place: string): RelicRefinement {
  const match = /\((Intact|Exceptional|Flawless|Radiant)\)/i.exec(place);
  return (match ? match[1].toLowerCase() : "intact") as RelicRefinement;
}

function isRelicPlace(place: string): boolean {
  return /\bRelic\b/i.test(place);
}

// Non-relic rows pass through untouched - this correction only applies
// to the relic reward table's own mislabeling.
export function correctedDropRarity(place: string, chance: number, rarity: string): string {
  if (!isRelicPlace(place)) return rarity;
  return relicRewardRarity(relicRefinementFromPlace(place), chance, rarity);
}
