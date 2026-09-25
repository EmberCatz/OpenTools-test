// Shared resolver for the local Public Export+ data directory every
// catalog module (itemNames.ts, modsCatalog.ts, arcanesCatalog.ts,
// relicsCatalog.ts, manufacturing.ts, rivenData.ts) reads from. Used to
// be duplicated per-file as a fixed `path.join(__dirname, "..", "..",
// "..", "database_scrapes", ...)` - three directories up from
// server/src, correct ONLY for this project's own dev layout
// (<root>/OpenTools/server/src, database_scrapes/ a sibling of
// OpenTools/).
//
// Found broken 2026-09-25 testing the `EmberCatz/OpenTools-test` sharing
// repo (a flattened snapshot - server/, app/ etc. sit directly at the
// repo root, no OpenTools/ nesting): three-up from server/src there
// lands ONE LEVEL ABOVE the repo's own clone root, not at a sibling
// database_scrapes/ inside it - the fixed depth assumption silently
// broke for anyone testing a bundled/flattened copy instead of this
// exact monorepo. Fixed by searching upward from `__dirname` for a real
// `database_scrapes/warframe-public-export-plus-senpai` directory
// instead of assuming a specific depth - works for both this repo's own
// 3-up layout and a flattened 2-up bundled copy, without needing two
// hardcoded numbers or a manual OPENTOOLS_PUBLIC_EXPORT_DIR override for
// the common bundled case.
import fs from "node:fs";
import path from "node:path";

const CANDIDATE_NAME = path.join("database_scrapes", "warframe-public-export-plus-senpai");
const MAX_LEVELS_UP = 6;

let resolved: string | null = null;
let warned = false;

/** Overridable via OPENTOOLS_PUBLIC_EXPORT_DIR; otherwise walks upward
 *  from `__dirname` (the caller's own module directory) looking for a
 *  real `database_scrapes/warframe-public-export-plus-senpai` folder, up
 *  to MAX_LEVELS_UP directories, so it works regardless of how deep
 *  `server/src` sits under the actual project root. Falls back to this
 *  project's own conventional 3-up path (unchanged prior behavior, and
 *  what every caller's error message already names) if nothing is found
 *  anywhere in the walk - so a genuinely missing dump still fails with
 *  the same familiar path in its warning, not a confusing "not found at
 *  any of 6 places" dump. */
export function resolveExportDir(callerDirname: string): string {
  if (resolved) return resolved;

  const envOverride = process.env.OPENTOOLS_PUBLIC_EXPORT_DIR;
  if (envOverride) {
    resolved = envOverride;
    return resolved;
  }

  let dir = callerDirname;
  for (let i = 0; i < MAX_LEVELS_UP; i++) {
    const candidate = path.join(dir, CANDIDATE_NAME);
    if (fs.existsSync(candidate)) {
      resolved = candidate;
      return resolved;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Nothing found anywhere in the walk - fall back to the original
  // fixed 3-up path so the "couldn't load X" warnings every caller
  // already prints still point at a sensible, previously-documented
  // location rather than an arbitrary one.
  resolved = path.join(callerDirname, "..", "..", "..", CANDIDATE_NAME);
  if (!warned) {
    warned = true;
    console.warn(
      `OpenTools: couldn't find a database_scrapes/warframe-public-export-plus-senpai/ folder searching up from ${callerDirname} - set OPENTOOLS_PUBLIC_EXPORT_DIR if it's somewhere non-standard. Falling back to ${resolved}.`,
    );
  }
  return resolved;
}
