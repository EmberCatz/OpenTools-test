import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Per-Warframe data that only exists on the wiki, not in Public Export or
// WFCD's warframe-items repo (checked both - see modWikiSubcategories.json's
// header comment for the same reasoning applied to mods). Two things:
//
// 1. `portraitImage` - the real transparent full-body render each
//    Warframe's wiki page uses (e.g. "File:Garuda.png"), resolved via
//    MediaWiki's own `action=query&prop=imageinfo` API against every
//    Suits entry's real catalog name (confirmed 2026-09-22, 117/117
//    matched across two passes - Primes and a few special-cased names
//    like "Excalibur Umbra"/"Cyte-09" use a compound no-space/no-hyphen
//    file name, e.g. "VoltPrime.png"/"ExcaliburUmbra.png"/"Cyte09.png",
//    not a literal transliteration of the display name). NOT the same
//    as this app's regular grid icon (itemIcons.ts's WFCD-sourced
//    `imageName`, a small square icon) - this is the large portrait used
//    for the Collection tab's hover preview, same convention as the Mods
//    tab's `previewImage`.
// 2. `nemesisUpgradeTag` - real Public Export field (ExportWarframes.json,
//    confirmed 2026-09-22), the "Progenitor Element" shown on each
//    Warframe's own wiki infobox (cross-checked live against Garuda's
//    page: nemesisUpgradeTag "InnateRadDamage" == wiki "Radiation").
//    WHAT THIS MEANS (corrected 2026-09-22 - see app/src/warframeElements.ts's
//    header comment for the full writeup and real future use cases):
//    NOT a combat trait of the Warframe itself. Per
//    https://wiki.warframe.com/w/Adversary_System#Progenitor_Warframe,
//    this only matters at the moment you perform the Parazon mercy/kill
//    finisher on a Kuva Larvling or Corpus Candidate - whichever
//    Warframe is equipped at THAT moment determines the resulting Kuva
//    Lich's/Sister of Parvos' weapon element bonus, ephemera, and
//    ability kit. Currently threaded onto CollectionItem
//    (db.ts) but NOT surfaced in the UI (a per-card badge was tried and
//    removed - implied the wrong "combat element" meaning). Absent
//    (null) for Archwings, Necramechs, and one special item - none of
//    those participate in the Adversary System, confirmed by their real
//    catalog entries all lacking the field, not by omission here.
const RAW_PATH = path.join(__dirname, "warframePortraits.json");

const NEMESIS_TAG_TO_ELEMENT: Record<string, string> = {
  InnateImpactDamage: "Impact",
  InnateHeatDamage: "Heat",
  InnateFreezeDamage: "Cold",
  InnateElectricityDamage: "Electricity",
  InnateToxinDamage: "Toxin",
  InnateMagDamage: "Magnetic",
  InnateRadDamage: "Radiation",
};

interface RawEntry {
  nemesisUpgradeTag: string | null;
  portraitImage: string | null;
}

interface WarframeExtra {
  progenitorElement: string | null;
  portraitImage: string | null;
}

function load(): Map<string, WarframeExtra> {
  let raw: Record<string, RawEntry> = {};
  try {
    raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load warframePortraits.json - Progenitor Element icons and the Warframe hover preview will be unavailable. (${err instanceof Error ? err.message : err})`);
  }

  const map = new Map<string, WarframeExtra>();
  for (const [itemType, entry] of Object.entries(raw)) {
    map.set(itemType, {
      progenitorElement: entry.nemesisUpgradeTag ? (NEMESIS_TAG_TO_ELEMENT[entry.nemesisUpgradeTag] ?? null) : null,
      portraitImage: entry.portraitImage,
    });
  }
  return map;
}

const byItemType = load();

export function getWarframeExtra(itemType: string): WarframeExtra {
  return byItemType.get(itemType) ?? { progenitorElement: null, portraitImage: null };
}
