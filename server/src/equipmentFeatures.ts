// The `Features` bitmask on an owned_equipment row - CONFIRMED 2026-09-21
// by reading this machine's own local SpaceNinjaServer source checkout
// directly (C:\OpenWF\Tools\SpaceNinjaServer\SpaceNinjaServer-main\src\
// types\equipmentTypes.ts's `eEquipmentFeatures` const), not inferred or
// borrowed from a third-party app. Only DOUBLE_CAPACITY (Catalyst/
// Reactor) and UTILITY_SLOT (Exilus adapter) are used by this app right
// now; the rest are kept here for completeness/future use.
export const EQUIPMENT_FEATURES = {
  DOUBLE_CAPACITY: 1,
  UTILITY_SLOT: 2,
  GRAVIMAG_INSTALLED: 4,
  GILDED: 8,
  ARCANE_SLOT: 32,
  SECOND_ARCANE_SLOT: 64,
  INCARNON_GENESIS: 512,
  VALENCE_SWAP: 1024,
} as const;

export function hasFeature(features: number, bit: number): boolean {
  return (features & bit) !== 0;
}
