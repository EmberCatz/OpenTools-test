// Local-only UI preferences (this machine's Tauri window, not synced
// anywhere) - localStorage is the right tool here since it's a pure
// per-installation display preference, not account/game data.

const UI_SCALE_KEY = "opentools-ui-scale";

export const UI_SCALE_OPTIONS = [75, 100, 125, 150, 175, 200] as const;
export type UiScalePercent = (typeof UI_SCALE_OPTIONS)[number];

// The app's raw (unscaled) CSS was sized for what's now labeled "75%" -
// tightened up before this setting existed, and reported by the user as
// too small. 100% is the new default going forward (noticeably bigger
// than what shipped before this setting), with 75% still available for
// anyone who preferred the original size.
const BASE_PERCENT = 75;
const DEFAULT_SCALE: UiScalePercent = 100;

function isValidScale(n: number): n is UiScalePercent {
  return (UI_SCALE_OPTIONS as readonly number[]).includes(n);
}

export function getStoredUiScale(): UiScalePercent {
  try {
    const raw = localStorage.getItem(UI_SCALE_KEY);
    const n = raw ? Number(raw) : NaN;
    return isValidScale(n) ? n : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

export function setStoredUiScale(percent: UiScalePercent): void {
  try {
    localStorage.setItem(UI_SCALE_KEY, String(percent));
  } catch {
    // Per-viewer convenience only - fine to lose across sessions if
    // storage is unavailable, not worth surfacing an error for.
  }
}

// Converts the labeled percentage into the actual CSS zoom multiplier
// relative to the app's raw (100%-labeled-as-75%) CSS baseline.
export function zoomFor(percent: UiScalePercent): number {
  return percent / BASE_PERCENT;
}

// Added 2026-09-21 - an opt-out for the per-item-type theming (Prime/
// Coda/Prisma/Wraith/Vandal/Kuva Lich/Sisters of Parvos/Archwing/
// Helminth/Incarnon, each with their own gradient border + Google Font),
// for anyone who'd rather every card looked and read the same. When on,
// every item card (including the Helminth/Incarnon duplicate tiles) uses
// the plain Normal theme's classes instead of its own - see App.tsx's
// themeClassesFor()/HelminthCard/IncarnonCard, which is where this is
// actually consumed.
const UNIFORM_ITEM_STYLE_KEY = "opentools-uniform-item-style";

export function getStoredUniformItemStyle(): boolean {
  try {
    return localStorage.getItem(UNIFORM_ITEM_STYLE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredUniformItemStyle(enabled: boolean): void {
  try {
    localStorage.setItem(UNIFORM_ITEM_STYLE_KEY, enabled ? "1" : "0");
  } catch {
    // Per-viewer convenience only - fine to lose across sessions if
    // storage is unavailable, not worth surfacing an error for.
  }
}

// Added 2026-09-24 - hides the "Vaulted" badge on Relic cards (the
// Collection tab's Relics sub-tab) for anyone who'd rather not see it
// (e.g. doesn't care about farmability, or just wants a cleaner card).
// Default is false (labels shown, current behavior unchanged). See
// ../CLAUDE.md's "Vaulted-label setting" section for the FULL list of
// every place that displays vaulted status text - keep that list
// current if a new one is ever added, per the house rule written there.
const HIDE_VAULTED_LABELS_KEY = "opentools-hide-vaulted-labels";

export function getStoredHideVaultedLabels(): boolean {
  try {
    return localStorage.getItem(HIDE_VAULTED_LABELS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredHideVaultedLabels(enabled: boolean): void {
  try {
    localStorage.setItem(HIDE_VAULTED_LABELS_KEY, enabled ? "1" : "0");
  } catch {
    // Per-viewer convenience only - fine to lose across sessions if
    // storage is unavailable, not worth surfacing an error for.
  }
}
