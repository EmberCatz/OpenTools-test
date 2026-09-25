// Manufacturing Requirements row for the Collection grid - one icon per
// real Foundry ingredient a buildable item needs (its own Blueprint plus
// any sub-component/relic-part recipes), matching the in-game
// "Manufacturing Requirements" panel shown for an unbuilt item (e.g.
// Excalibur: Blueprint, Neuroptics, Chassis, Systems).
//
// The REQUIREMENT GRAPH (which parts an item needs, and whether a given
// part needs its own separate blueprint built first) comes entirely from
// the LOCAL Public Export ExportRecipes.json - the same offline,
// authoritative source itemNames.ts already uses for the catalog itself,
// not a guess. Confirmed 2026-09-24 against real recipe data:
//   - Every buildable item has exactly one Recipe whose `resultType`
//     equals the item's own itemType (e.g. ExcaliburBlueprint's
//     resultType is Excalibur's own path /Lotus/Powersuits/Excalibur/
//     Excalibur) - that recipe's own key IS the item's main Blueprint
//     requirement. Some items (Prime variants obtained purely via relics
//     with no separate Foundry blueprint in this dump, quest rewards,
//     market-only cosmetics) have no such recipe at all - these
//     correctly get no manufacturing row rather than a fabricated one.
//   - That recipe's `ingredients` mixes raw resources (Ferrite, Orokin
//     Cell, credits-adjacent MiscItems - always under
//     /Lotus/Types/Items/, never shown as a requirement icon) with real
//     sub-requirements (always under /Lotus/Types/Recipes/).
//   - A sub-requirement comes in one of two confirmed shapes, told apart
//     by whether ExportRecipes.json has ANOTHER recipe whose resultType
//     equals it:
//       - Warframe/Archwing components (Chassis/Neuroptics/Systems, ...,
//         ItemType conventionally ending "...Component") DO have their
//         own recipe (e.g. ExcaliburChassisBlueprint's resultType is
//         ExcaliburChassisComponent) - a real two-step build (own that
//         component's own blueprint, THEN build it) - three
//         player-visible states: missing / blueprint owned / component
//         built.
//       - Prime weapon parts (Barrel/Receiver/Stock/...) have NO such
//         recipe (confirmed against Soma Prime's Barrel/Receiver/Stock) -
//         they're relic drops, ready to use in the final build the
//         moment you own them - two states: missing / owned (=crafted).
//
// The display LABEL + ICON for each requirement (e.g. "Chassis" +
// GenericWarframeChassis.png, "Barrel" + GenericGunPrimeBarrel.png) come
// from WFCD's Components.json (github.com/WFCD/warframe-items) - the
// same community data source itemIcons.ts already relies on for every
// other Collection icon, confirmed 2026-09-24 to carry exactly this
// name/imageName pair, keyed by the identical uniqueName this module's
// local recipe graph already uses. Network, loaded in the background
// exactly like itemIcons.ts's loadIcons() - a requirement whose
// label/icon hasn't resolved yet (or never will - an unmapped uniqueName)
// is left out of the row entirely rather than shown with a guessed name.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalog } from "./itemNames.js";

const WFCD_IMG_BASE = "https://cdn.warframestat.us/img/";
const COMPONENTS_URL = "https://raw.githubusercontent.com/wfcd/warframe-items/master/data/json/Components.json";

interface ComponentInfo {
  name: string;
  imageName: string;
}

const componentInfoByUniqueName = new Map<string, ComponentInfo>();
let componentsLoaded = false;
let componentsLoadError: string | null = null;

interface WfcdComponentEntry {
  uniqueName?: string;
  name?: string;
  imageName?: string;
}

async function loadComponents(): Promise<void> {
  const res = await fetch(COMPONENTS_URL);
  if (!res.ok) throw new Error(`Components.json: HTTP ${res.status}`);
  const entries = (await res.json()) as WfcdComponentEntry[];
  for (const entry of entries) {
    if (entry.uniqueName && entry.name && entry.imageName) {
      componentInfoByUniqueName.set(entry.uniqueName, { name: entry.name, imageName: entry.imageName });
    }
  }
  componentsLoaded = true;
  console.log(`OpenTools: loaded ${componentInfoByUniqueName.size} manufacturing component labels/icons from cdn.warframestat.us`);
}

const componentsLoadPromise = loadComponents().catch((err) => {
  componentsLoadError = err instanceof Error ? err.message : String(err);
  componentsLoaded = true; // done, just empty - don't retry forever on every request
  console.warn(`OpenTools: manufacturing component labels/icons failed to load - Collection rows will show no requirements. ${componentsLoadError}`);
});

export function getManufacturingComponentsStatus(): { loaded: boolean; count: number; error: string | null } {
  return { loaded: componentsLoaded, count: componentInfoByUniqueName.size, error: componentsLoadError };
}

export const manufacturingComponentsReadyPromise = componentsLoadPromise;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mirrors itemNames.ts's EXPORT_DIR pattern (each file that reads Public
// Export duplicates this rather than sharing an import - see that file's
// header comment / modsCatalog.ts for the established convention).
const EXPORT_DIR =
  process.env.OPENTOOLS_PUBLIC_EXPORT_DIR ??
  path.join(__dirname, "..", "..", "..", "database_scrapes", "warframe-public-export-plus-senpai");

interface RecipeEntry {
  resultType?: string;
  ingredients?: { ItemType: string; ItemCount: number }[];
}

function loadRecipes(): Record<string, RecipeEntry> {
  try {
    return JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, "ExportRecipes.json"), "utf8"));
  } catch (err) {
    console.warn(
      `OpenTools: couldn't load ExportRecipes.json from ${EXPORT_DIR} - manufacturing requirements will be empty. (${err instanceof Error ? err.message : err})`,
    );
    return {};
  }
}

const recipes = loadRecipes();

// First recipe wins for a given resultType. The ~57 real duplicate
// resultTypes in this file (confirmed 2026-09-24 via a full scan) are
// all alt-helmet cosmetic-skin conversions, never a resultType belonging
// to a real catalog item this app tracks - so first-wins never actually
// has to arbitrate a real ambiguity for anything this module is used for.
const recipeKeyByResultType = new Map<string, string>();
for (const [key, entry] of Object.entries(recipes)) {
  if (entry.resultType && !recipeKeyByResultType.has(entry.resultType)) {
    recipeKeyByResultType.set(entry.resultType, key);
  }
}

function isRecipeIngredient(itemType: string): boolean {
  return itemType.startsWith("/Lotus/Types/Recipes/");
}

interface RequirementShape {
  // The uniqueName to look up in Components.json for this requirement's
  // label/icon - the main recipe's own key for the Blueprint slot, the
  // raw ingredient ItemType for every other slot.
  uniqueName: string;
  // Recipes-bucket itemType to check for "own the blueprint, not built
  // yet" - null when this requirement has no separate blueprint step
  // (a direct relic-drop part).
  blueprintUniqueName: string | null;
  // Recipes-bucket itemType to check for "built/ready to use" - null
  // ONLY for the item's own main-Blueprint slot, whose "crafted" state
  // is instead the whole CollectionItem's owned flag (building it
  // produces the final item itself, not another Recipes-tracked object).
  craftedUniqueName: string | null;
  isMainBlueprint: boolean;
}

const requirementShapeCache = new Map<string, RequirementShape[] | null>();

function computeRequirementShapes(itemType: string): RequirementShape[] | null {
  const mainKey = recipeKeyByResultType.get(itemType);
  if (!mainKey) return null;
  const mainRecipe = recipes[mainKey];
  const shapes: RequirementShape[] = [
    { uniqueName: mainKey, blueprintUniqueName: mainKey, craftedUniqueName: null, isMainBlueprint: true },
  ];
  for (const ingredient of mainRecipe.ingredients ?? []) {
    if (!isRecipeIngredient(ingredient.ItemType)) continue; // raw resource (Ferrite, Orokin Cell, ...) - not a requirement icon
    const subKey = recipeKeyByResultType.get(ingredient.ItemType);
    shapes.push({
      uniqueName: ingredient.ItemType,
      blueprintUniqueName: subKey ?? null,
      craftedUniqueName: ingredient.ItemType,
      isMainBlueprint: false,
    });
  }
  return shapes;
}

function getRequirementShapes(itemType: string): RequirementShape[] | null {
  if (requirementShapeCache.has(itemType)) return requirementShapeCache.get(itemType)!;
  const shapes = computeRequirementShapes(itemType);
  requirementShapeCache.set(itemType, shapes);
  return shapes;
}

// Reverse of the above (2026-09-25, for db.ts's relic-reward icon
// resolution): every real Foundry Blueprint recipe key -> the FULL
// catalog item (Warframe/weapon) that Blueprint ultimately builds. Built
// by running getRequirementShapes() for every real catalog item (both
// this file's own local/synchronous data - no network dependency,
// unlike Components.json, so this can build eagerly at module load) and
// collecting each shape's own blueprintUniqueName:
//   - The item's OWN main Blueprint key (isMainBlueprint - e.g.
//     "NikanaPrimeBlueprint") maps to itself (Nikana Prime).
//   - Each sub-component's OWN Blueprint key (e.g.
//     "AtlasPrimeHelmetBlueprint", which despite the "Helmet" naming
//     quirk builds Atlas Prime's Neuroptics component - see this file's
//     header comment) maps to the PARENT full item (Atlas Prime the
//     Warframe), not the component itself - there is no standalone
//     "Neuroptics" catalog entry to point at.
// Prime PARTS (Barrel/Receiver/Stock/...) have no recipe of their own
// (confirmed in this file's header comment) and so never appear as a
// key here - they correctly keep their own distinct Components.json
// icon (e.g. a real stock/barrel shape) rather than being redirected.
const fullItemTypeByBlueprintKey = new Map<string, string>();
for (const entry of getCatalog()) {
  const shapes = getRequirementShapes(entry.itemType);
  if (!shapes) continue;
  for (const shape of shapes) {
    if (shape.blueprintUniqueName) fullItemTypeByBlueprintKey.set(shape.blueprintUniqueName, entry.itemType);
  }
}

// null for anything that isn't a real Foundry Blueprint recipe key at
// all (Prime parts, mods, raw resources) - db.ts falls back to the
// regular Components.json-based icon for those.
export function resolveBlueprintTargetItemType(uniqueName: string): string | null {
  return fullItemTypeByBlueprintKey.get(uniqueName) ?? null;
}

export interface ManufacturingRequirement {
  label: string;
  icon: string | null;
  blueprintUniqueName: string | null;
  craftedUniqueName: string | null;
  isMainBlueprint: boolean;
}

// Pure requirement list (label/icon resolved, no ownership yet - db.ts
// combines this with the live item_counts Recipes bucket to compute each
// requirement's actual missing/owned/crafted state per player). Returns
// null for anything with no matching Recipe at all (not buildable via
// Foundry) - the Collection grid renders no row for these, same
// "never fabricate a shape" standard as everywhere else in this project.
export function getManufacturingRequirements(itemType: string): ManufacturingRequirement[] | null {
  const shapes = getRequirementShapes(itemType);
  if (!shapes) return null;
  const requirements: ManufacturingRequirement[] = [];
  for (const shape of shapes) {
    const info = componentInfoByUniqueName.get(shape.uniqueName);
    if (!info) continue; // not yet loaded, or genuinely unmapped - skip rather than guess a label
    requirements.push({
      label: info.name,
      icon: WFCD_IMG_BASE + info.imageName,
      blueprintUniqueName: shape.blueprintUniqueName,
      craftedUniqueName: shape.craftedUniqueName,
      isMainBlueprint: shape.isMainBlueprint,
    });
  }
  return requirements.length > 0 ? requirements : null;
}

// Resolves a real icon for an arbitrary Recipes-namespace uniqueName -
// used by db.ts to icon Relic reward rows (2026-09-25). A relic reward's
// own uniqueName is one of two real shapes, confirmed by cross-checking
// every real Relics.json reward uniqueName (607 distinct items) against
// Components.json:
//   - A Prime PART (Barrel/Receiver/Blade/...) - its uniqueName IS a
//     direct Components.json key (440/607 matched this way).
//   - A Warframe COMPONENT's own Blueprint (e.g.
//     AtlasPrimeHelmetBlueprint) - Components.json does NOT index the
//     blueprint itself, only the Component it builds (e.g.
//     AtlasPrimeNeuroptics) - resolved via this recipe's own resultType
//     (153/607 matched only this way, via the same `recipes`/
//     `recipeKeyByResultType` this file already loads for the
//     Manufacturing Requirements row).
// The remaining 14/607 are genuinely absent from both local Public
// Export (a still-missing Citrine Prime recipe) and Components.json
// (pure resources - Kuva, Ayatan Stars, Riven Slivers) - correctly
// return null rather than a guessed icon.
export function resolveComponentIcon(uniqueName: string): string | null {
  const direct = componentInfoByUniqueName.get(uniqueName);
  if (direct) return WFCD_IMG_BASE + direct.imageName;
  const resultType = recipes[uniqueName]?.resultType;
  if (resultType) {
    const viaResult = componentInfoByUniqueName.get(resultType);
    if (viaResult) return WFCD_IMG_BASE + viaResult.imageName;
  }
  return null;
}
