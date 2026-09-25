// On-demand local icon extraction via Warframe-Exporter-CLI (see
// docs/public-export-reference.md §7 for the full CLI reference/gotchas
// - don't re-derive them here). This is a fully offline, exact-version
// alternative to itemIcons.ts's cdn.warframestat.us network source -
// preferred when available, since it doesn't depend on WFCD's data
// covering the item and doesn't need network access at all.
//
// "On demand" specifically means: nothing is extracted until a category
// is actually requested via ensureCategoryCached() (called from
// db.ts's getCollection()), and extraction runs as a detached background
// process - the triggering request does NOT wait for it. The category's
// items just keep using the network-source icon (or no icon) until the
// background extraction finishes, at which point later requests pick up
// the local files automatically. A completed extraction is remembered
// via a marker file on disk, so it only ever runs once per category per
// cache directory (not once per server restart).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors itemNames.ts's EXPORT_DIR pattern - other_software/ lives at
// the OPENWF _ Modding project root, shared across subprojects.
const EXPORTER_PATH =
  process.env.OPENTOOLS_EXPORTER_PATH ??
  path.join(__dirname, "..", "..", "..", "other_software", "warframe_exporter", "Warframe-Exporter-CLI.exe");

// No sensible default - the client version (and therefore this path)
// changes over time, and guessing wrong would silently point at a
// stale/nonexistent install. Local extraction is simply OFF (falls back
// to itemIcons.ts's network source for everything) until this is set.
const CACHE_WINDOWS_DIR = process.env.OPENTOOLS_WARFRAME_CACHE_DIR ?? null;

const CACHE_ROOT = process.env.OPENTOOLS_ICON_CACHE_DIR ?? path.join(__dirname, "..", "data", "icon-cache");

const PORT = Number(process.env.OPENTOOLS_PORT ?? 7891); // must match index.ts's default

// Category -> internal StoreIcons subfolder to bulk-extract. Confirmed
// live 2026-09-21 via --ls against a real Cache.Windows (see
// docs/public-export-reference.md §7) - Warframes contains icons
// directly, the weapon categories nest one level deeper
// (PrimaryWeapons/Weapons/Paris.png) but extracting the whole
// PrimaryWeapons folder gets everything under it regardless.
const CATEGORY_EXTRACT_PATHS: Record<string, string> = {
  Suits: "/Lotus/Interface/Icons/StoreIcons/Warframes",
  LongGuns: "/Lotus/Interface/Icons/StoreIcons/Weapons/PrimaryWeapons",
  Pistols: "/Lotus/Interface/Icons/StoreIcons/Weapons/SecondaryWeapons",
  Melee: "/Lotus/Interface/Icons/StoreIcons/Weapons/MeleeWeapons",
  Sentinels: "/Lotus/Interface/Icons/StoreIcons/Companions/Sentinels/Types",
  // Added 2026-09-21 - NOT independently verified via --ls like the
  // others above, but directly read off ExportWeapons.json's own `icon`
  // field for SentinelWeapons entries (e.g.
  // ".../StoreIcons/Weapons/SentinelWeapons/SentinelFreezeRayRifle.png"),
  // which is the same local/offline Public Export source this project
  // already treats as authoritative - not a guess by analogy.
  SentinelWeapons: "/Lotus/Interface/Icons/StoreIcons/Weapons/SentinelWeapons",
  // Archwing suits (2026-09-21) - all 5 real SpaceSuits entries' `icon`
  // fields share this exact folder (checked every one, not sampled).
  SpaceSuits: "/Lotus/Interface/Icons/StoreIcons/Archwing/Archwings",
  // Arch-Melee (2026-09-21) - all 8 real SpaceMelee entries' `icon`
  // fields share this exact folder (checked every one, not sampled).
  SpaceMelee: "/Lotus/Interface/Icons/StoreIcons/Archwing/Weapons",
  // SpaceGuns (Arch-Guns) and Hoverboards (K-Drive parts) are
  // deliberately NOT in this map - checked every real entry's `icon`
  // field for both and found no single common folder (SpaceGuns spans
  // Weapons/HeavyWeapons, Mech/Weapons, and Archwing/Weapons; Hoverboards
  // spans Icons/Store/Hoverboards/Theme AND the separate
  // Icons/StoreIcons/Hoverboard/Parts tree) - guessing one folder would
  // either bulk-extract a huge unrelated tree or silently miss most of
  // the category's real icons, so both fall back to the network source
  // (SpaceGuns has one, via itemIcons.ts's Arch-Gun.json; Hoverboards has
  // none at all, so K-Drive parts show a placeholder icon for now).
  //
  // ZawParts/KitgunParts (2026-09-25, split into two categories the same
  // day) are the same story - Zaw pieces live under Weapons/MeleeWeapons
  // (shared with real melee, no separate folder) and Kitgun pieces are
  // scattered (SolarisUnited + Infested paths), so both categories just
  // fall back to the network source (itemIcons.ts's ZawParts/KitgunParts
  // entries), which already covers them.
};

export function isLocalExtractionAvailable(): boolean {
  return CACHE_WINDOWS_DIR !== null && fs.existsSync(EXPORTER_PATH);
}

const extractedCategories = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

function markerPath(category: string): string {
  return path.join(CACHE_ROOT, `.extracted-${category}`);
}

function categoryAlreadyExtracted(category: string): boolean {
  if (extractedCategories.has(category)) return true;
  if (fs.existsSync(markerPath(category))) {
    extractedCategories.add(category);
    return true;
  }
  return false;
}

async function extractCategory(category: string): Promise<void> {
  const internalPath = CATEGORY_EXTRACT_PATHS[category];
  if (!internalPath || !CACHE_WINDOWS_DIR) return;

  fs.mkdirSync(CACHE_ROOT, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const args = [
      "--cache-dir",
      CACHE_WINDOWS_DIR,
      "--package",
      "Texture",
      "--extract-textures",
      "--internal-path",
      internalPath,
      "--texture-format",
      "PNG",
      "--output-path",
      CACHE_ROOT,
    ];
    const child = spawn(EXPORTER_PATH, args);
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Warframe-Exporter-CLI exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });

  fs.writeFileSync(markerPath(category), new Date().toISOString());
  extractedCategories.add(category);
  console.log(`OpenTools: extracted local icons for category ${category}`);
}

// Fire-and-forget. Kicks off a background extraction if this category
// hasn't been cached (or isn't already extracting) and local extraction
// is configured; returns immediately regardless. Never throws - a
// failure just logs a warning and leaves that category on the network
// fallback.
export function ensureCategoryCached(category: string): void {
  if (!isLocalExtractionAvailable()) return;
  if (categoryAlreadyExtracted(category)) return;
  if (inFlight.has(category)) return;

  const promise = extractCategory(category)
    .catch((err) => {
      console.warn(
        `OpenTools: local icon extraction failed for ${category} - falling back to network icons for this category. ${err instanceof Error ? err.message : err}`,
      );
    })
    .finally(() => {
      inFlight.delete(category);
    });
  inFlight.set(category, promise);
}

// iconPath is the raw Public Export "/Lotus/..." path - the extractor
// preserves this exact directory structure under CACHE_ROOT (confirmed
// live 2026-09-21), so this is a direct file check, not a guess.
export function getLocalIconUrl(iconPath: string): string | null {
  const rel = iconPath.replace(/^\//, "");
  const full = path.join(CACHE_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return `http://127.0.0.1:${PORT}/icon-cache/${rel}`;
}

export function getCacheRoot(): string {
  return CACHE_ROOT;
}
