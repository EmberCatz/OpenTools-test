// Mod polarity -> friendly name + official icon URL.
//
// Source: wiki.warframe.com's own Polarity/Text_Icons pages (per
// ASSET_LINKS.md), fetched 2026-09-23. Each icon URL was individually
// confirmed to resolve to a real image (Vazarin_Pol as SVG, Any_Pol as
// PNG both fetched and rendered) - not guessed filenames. The AP_* codes
// themselves come straight from ExportUpgrades.json (see modsCatalog.ts's
// UpgradeEntry comment) - this file only supplies the display layer
// (name + icon) for a code that's already real, sourced data.
//
// No hex color table exists for these on the wiki (checked) - the icons
// are single-color black-on-transparent SVG/PNG ("xBlack" variant), shown
// as-is in the app (inverted to white via CSS, since this app's theme is
// always dark - see App.css's .mod-polarity-icon).
//
// AP_UNIVERSAL is deliberately NOT mapped - it only appears on Parazon
// mods and riven mod-bin placeholder templates in ExportUpgrades.json
// (confirmed via a raw scan), not on any real polarity a player-owned mod
// card would show. Treated as "no polarity" (returns null), not guessed.
const WIKI_IMG_BASE = "https://wiki.warframe.com/images/";

interface PolarityInfo {
  name: string;
  icon: string;
}

const POLARITY_MAP: Record<string, PolarityInfo> = {
  AP_ATTACK: { name: "Madurai", icon: WIKI_IMG_BASE + "Madurai_Pol%28xBlack%29.svg" },
  AP_DEFENSE: { name: "Vazarin", icon: WIKI_IMG_BASE + "Vazarin_Pol%28xBlack%29.svg" },
  AP_TACTIC: { name: "Naramon", icon: WIKI_IMG_BASE + "Naramon_Pol%28xBlack%29.svg" },
  AP_POWER: { name: "Zenurik", icon: WIKI_IMG_BASE + "Zenurik_Pol%28xBlack%29.svg" },
  AP_WARD: { name: "Unairu", icon: WIKI_IMG_BASE + "Unairu_Pol%28xBlack%29.svg" },
  AP_PRECEPT: { name: "Penjaga", icon: WIKI_IMG_BASE + "Penjaga_Pol%28xBlack%29.svg" },
  AP_UMBRA: { name: "Umbra", icon: WIKI_IMG_BASE + "Umbra_Pol%28xBlack%29.svg" },
  AP_ANY: { name: "Any", icon: WIKI_IMG_BASE + "Any_Pol%28xBlack%29.png" },
};

export function resolvePolarity(code: string | undefined): PolarityInfo | null {
  if (!code) return null;
  return POLARITY_MAP[code] ?? null;
}
