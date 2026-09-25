import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getModsCatalog } from "./modsCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The real "Subcategories" list under https://wiki.warframe.com/w/Category:Mods
// (84 categories, confirmed 2026-09-22 via a scrape of that page), each
// mapped to its real member list pulled from the wiki's own MediaWiki API
// (`action=query&list=categorymembers`, not HTML scraping - avoids both
// summarizer hallucination and the pagination truncation a plain page
// scrape would hit on large categories like Tradeable Mods). Stored raw
// (wiki display names, not itemTypes) since itemType is this app's own
// internal concept the wiki has no notion of - matched against the real
// catalog below at load time, the same way modsCatalog.ts matches
// ExportUpgrades.json against dict.en.json.
const RAW_PATH = path.join(__dirname, "modWikiSubcategories.json");

interface RawCategories {
  [category: string]: string[] | null;
}

// Wiki page titles disambiguate a handful of mods that share a name with
// something else on the wiki (e.g. "Scorch (Mod)" vs. the Grineer unit
// "Scorch", "Exalted Blade (Stance)" vs. the ability) - strip the
// trailing "(...)" and normalize curly apostrophes/whitespace before
// matching against this project's own catalog names, which never carry
// wiki disambiguation suffixes.
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function build(): { byItemType: Map<string, string[]>; allCategories: string[] } {
  let raw: RawCategories = {};
  try {
    raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  } catch (err) {
    console.warn(`OpenTools: couldn't load modWikiSubcategories.json - the Mods Subcategories filter will be empty. (${err instanceof Error ? err.message : err})`);
  }

  const catalogByNorm = new Map<string, string[]>();
  for (const entry of getModsCatalog()) {
    const key = normalize(entry.name);
    const list = catalogByNorm.get(key) ?? [];
    list.push(entry.itemType);
    catalogByNorm.set(key, list);
  }

  const byItemType = new Map<string, Set<string>>();
  const categoriesWithMatches = new Set<string>();
  let unmatchedCount = 0;

  for (const [category, members] of Object.entries(raw)) {
    if (!members) continue;
    for (const memberName of members) {
      const itemTypes = catalogByNorm.get(normalize(memberName));
      if (!itemTypes) {
        // Expected in practice - see modWikiSubcategories.json's header
        // comment above: wiki categories also list their own description
        // page (e.g. "Amalgam Mods" as a member of itself), meta pages
        // ("Mods 1.0"), and genuinely archived/vaulted mods no longer in
        // the current Public Export dump. Not fabricated as a match.
        unmatchedCount++;
        continue;
      }
      categoriesWithMatches.add(category);
      for (const itemType of itemTypes) {
        const set = byItemType.get(itemType) ?? new Set();
        set.add(category);
        byItemType.set(itemType, set);
      }
    }
  }

  console.log(
    `OpenTools: matched ${byItemType.size} catalog mods against ${categoriesWithMatches.size} wiki subcategories (${unmatchedCount} wiki member names had no current catalog match - archived/meta entries, expected).`,
  );

  const result = new Map<string, string[]>();
  for (const [itemType, set] of byItemType.entries()) {
    result.set(itemType, [...set].sort());
  }
  return { byItemType: result, allCategories: [...categoriesWithMatches].sort() };
}

const { byItemType, allCategories } = build();

export function getModSubcategories(itemType: string): string[] {
  return byItemType.get(itemType) ?? [];
}

// Only categories that matched at least one real catalog mod - a filter
// dropdown option with zero possible results would just be dead weight.
export function getAllModSubcategoryNames(): string[] {
  return allCategories;
}
