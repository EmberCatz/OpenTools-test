// Colors + icons for the 7 "Progenitor Element" values (api.ts's
// CollectionItem.progenitorElement, from Public Export's real
// `nemesisUpgradeTag` field - see server/src/warframePortraits.ts).
//
// WHAT THIS ACTUALLY MEANS (corrected 2026-09-22 - see the removed
// per-card badge's history in App.tsx's ItemCard comment for the
// original wrong read): this is NOT "the damage element this Warframe
// deals in combat" or any other ambient per-frame trait. Per
// https://wiki.warframe.com/w/Adversary_System#Progenitor_Warframe, a
// Warframe's Progenitor Element only matters at the ONE MOMENT you
// perform the Parazon mercy/kill finisher on a Kuva Larvling or Corpus
// Candidate: WHICHEVER Warframe you have equipped at that moment
// determines the resulting Kuva Lich's/Sister of Parvos' (1) weapon
// element bonus, (2) ephemera type, and (3) ability kit/cosmetic helmet.
// You don't need to keep using that Warframe afterward - it only matters
// at creation. Technocyte Coda Liches are exempt (unaffected by
// progenitor choice).
//
// REAL USE CASES for this data (not built yet - kept wired through for
// when one of these gets picked up, not speculative scope creep to
// build now):
// - A "Lich/Sister creation helper": before mercy-killing a Larvling/
//   Candidate, show which of the player's owned Warframes would produce
//   a desired weapon element (e.g. "equip a Radiation-progenitor frame
//   to get a Radiation-bonus Kuva weapon").
// - Annotating a future Kuva Lich/Sister of Parvos tracker feature (not
//   built - this app has no Lich/Sister tracking at all yet) with which
//   progenitor element produced each tracked Adversary, once that
//   feature exists.
// - Filtering the Collection tab's Warframes by progenitor element FOR
//   THAT PURPOSE specifically (e.g. "show me every Radiation-progenitor
//   frame I own") - explicitly NOT as a generic per-card status badge,
//   which is what got removed here for implying the wrong meaning.
//
// No official hex values are exported anywhere (Public Export, WFCD, and
// the wiki all represent these as icons/text, never as a color
// constant) - these are hand-picked to match each element's real,
// widely-recognized in-game damage-type color, same "close approximation,
// not pixel-sourced" caveat this app already applies to the Helminth/
// Incarnon gradient borders (see App.css).
export const ELEMENT_COLORS: Record<string, string> = {
  Impact: "#c9c4b8",
  Heat: "#ff6a2b",
  Cold: "#6fd3ff",
  Electricity: "#4a7fff",
  Toxin: "#7cc33e",
  Magnetic: "#7a5cff",
  Radiation: "#d8c93e",
};

export function elementColor(element: string | null): string {
  if (!element) return "#8a8a8a";
  return ELEMENT_COLORS[element] ?? "#8a8a8a";
}

// Real per-element icons (2026-09-22, switched from the monochrome
// "(xWhite)" variant to the full-color "Symbol" one per follow-up
// feedback) - each Damage/<Element>_Damage wiki page's own colored
// infobox glyph (e.g. https://wiki.warframe.com/w/File:RadiationSymbol.png -
// a yellow/black radiation trefoil; ColdSymbol.png a blue snowflake, same
// generic-hazard-symbol style throughout), confirmed via the wiki's own
// File: pages for all 7 elements. Real colors baked into these images -
// ELEMENT_COLORS above is used only for the hover-preview glow now, not
// duplicated here as a tint.
export const ELEMENT_ICONS: Record<string, string> = {
  Impact: "https://wiki.warframe.com/images/ImpactSymbol.png",
  Heat: "https://wiki.warframe.com/images/HeatSymbol.png",
  Cold: "https://wiki.warframe.com/images/ColdSymbol.png",
  Electricity: "https://wiki.warframe.com/images/ElectricitySymbol.png",
  Toxin: "https://wiki.warframe.com/images/ToxinSymbol.png",
  Magnetic: "https://wiki.warframe.com/images/MagneticSymbol.png",
  Radiation: "https://wiki.warframe.com/images/RadiationSymbol.png",
};

export function elementIcon(element: string | null): string | null {
  if (!element) return null;
  return ELEMENT_ICONS[element] ?? null;
}
