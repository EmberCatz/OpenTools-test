// Visual theming for real, distinct catalog items with their own named
// identity (Prime/Coda/Prisma/Wraith/Vandal/Kuva Lich/Sisters of Parvos/
// Archwing) - unlike Helminth/Incarnon (states layered onto an item that
// already has its own separate identity, needing a second duplicate
// tile), these are just recolors of each real item's own card, per the
// user's own answer when this pattern was first established for Kuva/
// Sisters of Parvos (2026-09-21): "recolor the existing card."
//
// All of these are detected by the resolved display name's prefix/suffix
// (or, for Archwing, by category) rather than itemType path - a first
// pass at Kuva/Sisters detection tried path matching and missed several
// real weapons living under unrelated internal codenames (see DEVLOG.md's
// "Fixed: incomplete Kuva/Tenet roster" entry) - name-based matching,
// confirmed exhaustively against a full Public Export scan for each
// theme below, is what actually finds the complete real roster.
//
// isPrimeItem() applies across EVERY category (Warframes AND weapons AND
// Archwing gear - e.g. "Odonata Prime") - it's checked first in
// App.tsx's themeClassesFor() so a Prime Archwing frame gets the Prime
// theme, not the Archwing default theme.
export function isPrimeItem(name: string): boolean {
  return name.endsWith(" Prime");
}

// Coda weapons (Infested "Techrot" strain, 1999 quest) - confirmed via a
// full ExportWeapons.json scan: 13 real weapons, all with a "Coda "
// prefix, zero false positives within the Weapons categories this app
// scans.
export function isCodaWeapon(name: string): boolean {
  return name.startsWith("Coda ");
}

// Prisma weapons (Baro Ki'Teer / Void Trader exclusives) - confirmed via
// a full ExportWeapons.json scan: 14 real weapons with a "Prisma " prefix
// (including one SentinelWeapons and one SpaceGuns entry - Prisma Burst
// Laser and Prisma Dual Decurions - so this is checked ahead of the
// Archwing/companion-weapon fallback themes).
export function isPrismaWeapon(name: string): boolean {
  return name.startsWith("Prisma ");
}

// Wraith weapons (Grineer death-squad variants, event-exclusive) -
// confirmed via a full ExportWeapons.json scan: 11 real weapons, all with
// a " Wraith" suffix.
export function isWraithWeapon(name: string): boolean {
  return name.endsWith(" Wraith");
}

// Vandal weapons (Corpus field-test variants, event-exclusive) -
// confirmed via a full ExportWeapons.json scan: 12 real weapons (11
// distinct + Imperator Vandal, an Archwing weapon, appearing once as the
// real player weapon and once - excluded server-side, see
// itemNames.ts's "/Enemies/" filter - as an unrelated enemy-only asset
// reusing the same display name), all with a " Vandal" suffix.
export function isVandalWeapon(name: string): boolean {
  return name.endsWith(" Vandal");
}

// Kuva Lich weapons - see DEVLOG.md's 2026-09-21 "Fixed: incomplete
// Kuva/Tenet roster" entry for the full verification writeup (21 real
// weapons, confirmed complete via a full ExportWeapons.json scan).
export function isKuvaLichWeapon(name: string): boolean {
  return name.startsWith("Kuva ");
}

// Sisters of Parvos ("Tenet") weapons - same entry as above (16 real
// weapons, confirmed complete).
export function isSisterOfParvosWeapon(name: string): boolean {
  return name.startsWith("Tenet ");
}

// Archwing suits/Arch-Guns/Arch-Melee fallback theme - by category, not
// name, since these items (Itzal, Velocitus, Amesha, ...) don't share a
// naming convention the way the other themes' variants do. Checked LAST
// in themeClassesFor() so a Prime/Prisma/Vandal/Kuva Archwing item (e.g.
// Odonata Prime, Prisma Dual Decurions, Imperator Vandal, Kuva Grattler)
// gets that theme instead of this default one.
export function isArchwingCategory(category: string): boolean {
  return category === "SpaceSuits" || category === "SpaceGuns" || category === "SpaceMelee";
}
