import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import {
  getCollectionData,
  getModsCollectionData,
  getArcanesCollectionData,
  getRelicsCollectionData,
  getDashboard,
  getStatus,
  searchDrops,
  refreshDrops,
  getDropsForItem,
  getDropSourcesForCollectionItem,
  type CollectionItem,
  type CollectionResponse,
  type ModItem,
  type ModsCollectionResponse,
  type ArcaneItem,
  type ArcanesCollectionResponse,
  type RelicItem,
  type RelicsCollectionResponse,
  type DashboardResponse,
  type StatusResponse,
  type DropRow,
  type DropSearchMode,
} from "./api";
import {
  FORMA_ICON,
  HELMINTH_ICON,
  MASTERED_ICON,
  capacityIconFor,
  capacityLabelFor,
  exilusIconFor,
  masteryRankIconFor,
} from "./statusIcons";
import {
  UI_SCALE_OPTIONS,
  type UiScalePercent,
  getStoredUiScale,
  setStoredUiScale,
  zoomFor,
  getStoredUniformItemStyle,
  setStoredUniformItemStyle,
  getStoredHideVaultedLabels,
  setStoredHideVaultedLabels,
} from "./settings";
import {
  isPrimeItem,
  isCodaWeapon,
  isPrismaWeapon,
  isWraithWeapon,
  isVandalWeapon,
  isKuvaLichWeapon,
  isSisterOfParvosWeapon,
  isArchwingCategory,
} from "./itemThemes";

// Friendly labels for SpaceNinjaServer's real currency field names - see
// reference_spaceninjaserver_addcurrency memory / ../../DEVLOG.md.
const CURRENCY_LABELS: Record<string, string> = {
  RegularCredits: "Credits",
  PremiumCredits: "Platinum",
  FusionPoints: "Endo",
  CrewShipFusionPoints: "Dirac",
  PrimeTokens: "Regal Aya",
};

const TABS = ["Dashboard", "Collection", "Drop Rates", "Market", "Wiki", "Settings"] as const;
type Tab = (typeof TABS)[number];

function DashboardView() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [s, d] = await Promise.all([getStatus(), getDashboard()]);
      setStatus(s);
      setDashboard(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="panel panel-error">
        <p>Can't reach the OpenTools server.</p>
        <p className="hint">
          Make sure it's running (<code>npm start</code> in <code>server/</code>) on port 7891.
        </p>
        <p className="hint">{error}</p>
      </div>
    );
  }

  if (!status || !dashboard) {
    return <div className="panel">Loading…</div>;
  }

  return (
    <div className="dashboard-grid">
      <div className="panel">
        <h2>Sync status</h2>
        <p>
          <span className={`dot ${status.sync.connected ? "dot-ok" : "dot-off"}`} />
          {status.sync.connected ? "Receiving live pushes" : "No recent push from OpenTools Sync.pluto"}
        </p>
        {dashboard.lastSync && (
          <p className="hint">
            Last write: {new Date(dashboard.lastSync.synced_at).toLocaleString()}
            {dashboard.lastSync.ok ? "" : " (failed)"}
          </p>
        )}
        {!dashboard.lastSync && <p className="hint">No data received yet.</p>}
      </div>

      <div className="panel">
        <h2>Currencies</h2>
        {dashboard.currencies.length === 0 && <p className="hint">Unknown until the first sync.</p>}
        <ul className="stat-list">
          {dashboard.currencies.map((c) => (
            <li key={c.name}>
              <span>{CURRENCY_LABELS[c.name] ?? c.name}</span>
              <span className="stat-value">{c.amount.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>Tracked items</h2>
        {dashboard.itemCountTotals.length === 0 && <p className="hint">Unknown until the first sync.</p>}
        <ul className="stat-list">
          {dashboard.itemCountTotals.map((t) => (
            <li key={t.category}>
              <span>{t.category}</span>
              <span className="stat-value">
                {t.distinctItems} types / {t.totalCount} total
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">Unlocks recorded: {dashboard.unlockCount}</p>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  Suits: "Warframes",
  LongGuns: "Primary Weapons",
  Pistols: "Secondary Weapons",
  Melee: "Melee Weapons",
  // Zaw/Kitgun raw components (2026-09-25, split into two separate
  // category sections the same day per a follow-up ask) - see
  // server/src/itemNames.ts's isZawPart/isKitgunPart comment for why
  // these need splitting out of Pistols/Sidearms rather than staying
  // lumped in with real secondary weapons.
  ZawParts: "Zaw Parts",
  KitgunParts: "Kitgun Parts",
  Sentinels: "Sentinels",
  SentinelWeapons: "Companion Weapons",
  // Archwing/K-Drive (2026-09-21) - category names reuse SpaceNinjaServer's
  // own inventory key names (see ../../server/src/itemNames.ts's
  // CATEGORY_SOURCES comment), not invented ones.
  SpaceSuits: "Archwing",
  SpaceGuns: "Arch-Gun",
  SpaceMelee: "Arch-Melee",
  Hoverboards: "K-Drive",
};

const CATEGORY_ORDER = [
  "Suits",
  "LongGuns",
  "Pistols",
  "Melee",
  "ZawParts",
  "KitgunParts",
  "Sentinels",
  "SentinelWeapons",
  "SpaceSuits",
  "SpaceGuns",
  "SpaceMelee",
  "Hoverboards",
];

// Collection sub-tabs. "Weapons" gets its own second-level filter
// (WEAPON_SUB_FILTERS below) rather than being split into 3 top-level
// tabs, per the user's requested grouping. "Companions" covers Sentinels
// + SentinelWeapons - the latter added 2026-09-21 on an UNATTESTED lead
// (see ../../DEVLOG.md's "Leads from WFHelper's source" entry and
// ../../TODO.md) - not yet confirmed against a real inventory.php
// response, hence the in-UI caveat in EquipmentGrid below. "Archwing"
// (bundling SpaceSuits/SpaceGuns/SpaceMelee) and "K-Drive" (Hoverboards
// only) added 2026-09-21, same UNATTESTED-sync caveat as Companions.
// "Mods", "Arcanes", and "Relics" are visually set apart from the
// equipment tabs by a "|" divider (rendered in the nav below, not part
// of this array - see COLLECTION_SUB_TAB_DIVIDER_BEFORE) since they're
// a different data source (RawUpgrades/ranked_upgrades or MiscItems,
// not owned_equipment) and grid shape (ModsGrid/ArcanesGrid/RelicsGrid,
// not EquipmentGrid) from everything to their left. Relics needs no
// divider of its own - it's grouped with Mods/Arcanes as "not an
// equipment grid".
const COLLECTION_SUB_TABS = [
  "All",
  "Warframes",
  "Weapons",
  "Companions",
  "Archwing",
  "K-Drive",
  "Mods",
  "Arcanes",
  "Relics",
] as const;
type CollectionSubTab = (typeof COLLECTION_SUB_TABS)[number];

// Which tab(s) get a "|" divider rendered immediately before them in the
// sub-tab nav - see the comment above.
const COLLECTION_SUB_TAB_DIVIDER_BEFORE: ReadonlySet<CollectionSubTab> = new Set(["Mods"]);

// Display order for the Mods "Category" dropdown - matches
// server/src/modsCatalog.ts's CATEGORY_LABELS map order. "Other"
// (mods whose ExportUpgrades.json `type` isn't in that map) always sorts
// last, after every real category that's actually present in the data.
// Distinct from MOD_SUBCATEGORY below - the real, possibly-multi-valued
// wiki.warframe.com/w/Category:Mods subcategory list.
const MOD_CATEGORY_ORDER = [
  "Warframe",
  "Primary",
  "Secondary",
  "Melee",
  "Stance",
  "Aura",
  "Archwing",
  "Archwing Gun",
  "Archwing Melee",
  "Sentinel",
  "Kavat",
  "Kubrow",
  "Helminth Charger",
  "Parazon",
];

// Display order for the Arcanes "Category" dropdown - matches
// server/src/itemIcons.ts's ARCANE_CATEGORY_LABELS map order. "Other"
// (the 7 generic/legacy arcanes WFCD's own `type` doesn't slot into a
// specific equipment type) always sorts last, same convention as
// MOD_CATEGORY_ORDER above.
const ARCANE_CATEGORY_ORDER = [
  "Warframe",
  "Primary",
  "Secondary",
  "Melee",
  "Shotgun",
  "Bow",
  "Operator",
  "Amp",
  "Zaw",
  "Kitgun",
];

// Display order for the Relics "Era" dropdown - real relic eras, matches
// server/src/db.ts's RELIC_ERA_ORDER (Lith->Requiem is the traditional
// progression; "Vanguard" is a newer era, sorts last).
const RELIC_ERA_ORDER = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Vanguard"];

// Refinement display order - real quality tiers, Intact->Radiant.
const RELIC_REFINEMENT_ORDER = ["Intact", "Exceptional", "Flawless", "Radiant"];

const WEAPON_SUB_FILTERS = ["All", "Primary", "Sidearms", "Melee", "Zaw Parts", "Kitgun Parts"] as const;
type WeaponSubFilter = (typeof WEAPON_SUB_FILTERS)[number];
const WEAPON_SUB_FILTER_CATEGORY: Record<Exclude<WeaponSubFilter, "All">, string> = {
  Primary: "LongGuns",
  Sidearms: "Pistols",
  Melee: "Melee",
  "Zaw Parts": "ZawParts",
  "Kitgun Parts": "KitgunParts",
};
const WEAPON_CATEGORIES = ["LongGuns", "Pistols", "Melee", "ZawParts", "KitgunParts"];
const ARCHWING_CATEGORIES = ["SpaceSuits", "SpaceGuns", "SpaceMelee"];

// Shared by both the equipment grid (CollectionItem) and the Mods grid
// (ModItem) - both shapes carry `icon`/`name`, everything else about how
// they're displayed differs (rank formula, oid vs. stack semantics).
//
// Bidirectional lazy loading (2026-09-22): the Collection grid can hold
// several thousand cards (1601 mods alone). Native `loading="lazy"` on
// the `<img>` already deferred the network fetch, but every card's DOM
// (icon element, name, badge row) was still created immediately on
// mount - fine for a few hundred items, wasteful at this app's actual
// scale. IconOrPlaceholder itself now gates on IntersectionObserver
// (`rootMargin` gives a vertical buffer so a card starts rendering
// slightly before it's actually on-screen, in either scroll direction -
// IntersectionObserver has no notion of "up" vs. "down," it just fires
// whenever the buffered viewport rectangle changes, which covers both),
// rendering a pulsing skeleton at the same footprint until then. Once
// visible it stays mounted permanently (`observer.disconnect()` after
// the first hit) - re-hiding an already-loaded card on scroll-away would
// just refetch/re-render it later for no benefit, and would fight the
// hover-preview state ItemCard/ModCard already keep on their own root
// element.
const LAZY_ROOT_MARGIN = "600px 0px 600px 0px";

function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  // Empty deps - runs once on mount, by which point `ref.current` is
  // already attached (refs commit before effects run). Nothing else
  // about this hook's own state should re-trigger it; re-observing on
  // every render would be pointless since the element doesn't move.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true); // no-op fallback for a non-browser test env - never silently blank
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: LAZY_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, inView];
}

// Blocks the page/Collection-grid scroll behind ANY active popup
// (2026-09-25, per the user's ask). REWORKED the same day into a real
// reference-counted lock after a follow-up bug report ("sometimes the
// normal scrolling doesn't work anymore") - the original version saved
// whatever `document.body.style.overflow` already was at activation and
// restored exactly that value on deactivation, which assumed at most one
// lock is ever active per "logical" popup. That assumption held for a
// SINGLE relic popup + its ONE hover panel, but every reward row in the
// popup gets its OWN RewardDropSourcesHoverTrigger instance with its own
// independent `hovered` state and its own call to this hook - and
// RewardDropSourcesHoverTrigger deliberately keeps a hover panel alive
// for 150ms after the mouse leaves (scheduleHide's grace period, so the
// user can move the cursor onto the panel itself) specifically so the
// user CAN glide from one reward row to another. Doing exactly that
// (mousing from row A to row B before A's 150ms timer fires) makes two
// locks active at once: B's lock snapshots "hidden" (A's lock already
// set it) as ITS "previous" value, and if A's timer then fires first, A
// restores its own correct-at-the-time "" snapshot - but B still thinks
// its own restore target is "hidden", so when B's hover ends later it
// sets `overflow` BACK to "hidden" even though nothing is open anymore,
// permanently wedging page scroll until something else happens to touch
// `overflow` again. A plain counter fixes this regardless of how many
// locks overlap or in what order they release: the true "was this ever
// unlocked before any lock existed" value is captured ONCE, only when
// the count rises from 0, and restored ONLY when the count falls back to
// 0 - no lock's own start/end needs to know about any other lock.
let scrollLockCount = 0;
let scrollLockPreviousOverflow = "";
function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLockCount === 0) {
      scrollLockPreviousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount += 1;
    return () => {
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        document.body.style.overflow = scrollLockPreviousOverflow;
      }
    };
  }, [active]);
}

// Generic reusable popup-window foundation (2026-09-24) - a portal-
// rendered floating window with a title bar, close button, backdrop,
// and dismiss-on-outside-click/Escape, for ANY feature that needs a
// click-triggered overlay (first user: the Relics tab's reward-contents
// view, replacing what used to be an inline expand-in-grid row). Portal-
// rendered to document.body (same technique ModCard's hover preview
// already uses) so it's never clipped/dimmed by an ancestor card's own
// `filter`/`overflow`. Deliberately NOT anchored to the triggering
// element (unlike ModCard's cursor-anchored preview) - centered in the
// viewport via the backdrop's flex centering, which is the right shape
// for a "window" with real height (a reward table, a future settings
// panel, etc.) rather than a small hover tooltip.
//
// Click-outside-to-close: the backdrop itself is the full-viewport
// click target; a click only closes when the click's target IS the
// backdrop element (`e.target === e.currentTarget`), not a descendant -
// so clicks inside the window itself never bubble-trigger a false
// close. Escape also closes, a standard expectation for any dismissable
// overlay, not just a nice-to-have.
function PopupWindow({
  title,
  onClose,
  children,
  className,
  windowRef,
}: {
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  // Exposes the outer `.popup-window` div's own DOM node to the caller
  // (2026-09-25) - lets a popup's OWN content (e.g. RelicCard's reward
  // rows) anchor a separate, no-backdrop hover panel relative to THIS
  // window's real on-screen position (getBoundingClientRect()) rather
  // than the cursor. Optional and unused by every other current caller.
  windowRef?: React.RefObject<HTMLDivElement | null>;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="popup-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`popup-window ${className ?? ""}`} ref={windowRef}>
        <div className="popup-window-header">
          <div className="popup-window-title">{title}</div>
          <button className="popup-window-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="popup-window-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function IconOrPlaceholder({ icon, name }: { icon: string | null; name: string }) {
  // HTMLElement (not HTMLDivElement/HTMLImageElement specifically) - the
  // observed element switches between a <div> (skeleton/placeholder) and
  // an <img> (loaded icon) depending on `inView`/`icon` below, and the
  // hook only ever touches generic Element methods, so the base type
  // covers every case without a cast at either call site.
  const [ref, inView] = useInView<HTMLElement>();

  if (!inView) {
    return <div ref={ref as React.RefObject<HTMLDivElement>} className="item-icon item-icon-skeleton" aria-hidden="true" />;
  }
  if (icon) {
    return (
      <img
        ref={ref as React.RefObject<HTMLImageElement>}
        className="item-icon item-icon-loaded"
        src={icon}
        alt=""
        loading="lazy"
      />
    );
  }
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className="item-icon item-icon-placeholder item-icon-loaded" aria-hidden="true">
      {name.charAt(0)}
    </div>
  );
}

// Forma count, Catalyst/Reactor, and Exilus adapter status were all
// CONFIRMED against a real in-game sync 2026-09-21 (see ../../DEVLOG.md's
// "Real in-game confirmation" entries) - plain tooltips, no more caveat.

// Item-card theming (2026-09-21, see itemThemes.ts) - reuses the
// "low-alpha border while unowned" dim convention from the Helminth/
// Incarnon tiles for every themed variant, rather than the plain
// item-card-unowned grayscale-everything treatment, since that would
// desaturate the themed border too (the icon/name still gray out the
// same way, just scoped to the theme class instead). Checked in a fixed
// precedence order since an item can only ever match ONE of these named
// variant schemes in practice (Prime/Coda/Prisma/Wraith/Vandal/Kuva/
// Tenet are mutually exclusive naming conventions), with Archwing
// category and then a plain "Normal" theme as the final fallbacks - so a
// Prime Archwing frame (Odonata Prime) or a Kuva Archwing weapon (Kuva
// Grattler) gets that specific theme, not the generic Archwing one.
// `uniformItemStyle` (Settings toggle, 2026-09-21) forces every item onto
// the plain Normal look regardless of what it'd otherwise match - for
// anyone who'd rather every card looked/read the same. Checked first, so
// none of the theme-detection functions below even run when it's on.
function themeClassesFor(item: CollectionItem, uniformItemStyle: boolean): string {
  const dim = !item.owned;
  if (!uniformItemStyle) {
    if (isPrimeItem(item.name)) return `item-card-prime ${dim ? "item-card-prime-dim" : ""}`;
    if (isCodaWeapon(item.name)) return `item-card-coda ${dim ? "item-card-coda-dim" : ""}`;
    if (isPrismaWeapon(item.name)) return `item-card-prisma ${dim ? "item-card-prisma-dim" : ""}`;
    if (isWraithWeapon(item.name)) return `item-card-wraith ${dim ? "item-card-wraith-dim" : ""}`;
    if (isVandalWeapon(item.name)) return `item-card-vandal ${dim ? "item-card-vandal-dim" : ""}`;
    if (isKuvaLichWeapon(item.name)) return `item-card-kuva ${dim ? "item-card-kuva-dim" : ""}`;
    if (isSisterOfParvosWeapon(item.name)) return `item-card-sister ${dim ? "item-card-sister-dim" : ""}`;
    if (isArchwingCategory(item.category)) return `item-card-archwing ${dim ? "item-card-archwing-dim" : ""}`;
  }
  return `item-card-normal ${dim ? "item-card-normal-dim" : ""}`;
}

// "Where do I get this" for a plain Collection card (Warframes/weapons/
// companions/Archwing/K-Drive), added 2026-09-25 alongside the relic
// reward hover panel above/below - CLICK-triggered here (not hover, per
// the user's explicit ask: this tab's icons aren't already inside
// another open popup the way a relic reward row is, so there's no
// "moving the mouse across the grid keeps popping things open" concern
// hover would have). Wraps just the icon (not the whole card, which has
// no other click behavior to conflict with) in a plain reset <button>.
// Uses api.ts's getDropSourcesForCollectionItem() - see
// server/src/db.ts's getDropSourcesForCollectionItem comment for why
// this is a separate, precise, manufacturing-requirements-driven lookup
// rather than the relic reward table's exact-name getDropsForItem()
// above (this card's own bare name, e.g. "Volt Prime", never appears as
// an exact drop-table entry itself). A plain, single-backdrop
// PopupWindow (unlike the relic reward's no-backdrop hover panel) -
// there's no already-open outer popup here to avoid double-dimming
// against. `showItemColumn` on DropSourcesTableContent since one lookup
// can span several distinct reward names (Blueprint AND Chassis AND
// Systems AND ...).
function CollectionItemDropSourcesButton({
  itemType,
  itemName,
  icon,
  children,
}: {
  itemType: string;
  itemName: string;
  icon: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DropRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    getDropSourcesForCollectionItem(itemType)
      .then((r) => {
        if (!cancelled) setRows(r.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemType]);

  return (
    <>
      <button
        type="button"
        className="item-icon-drop-sources-button"
        onClick={() => setOpen(true)}
        title="Where do I get this?"
      >
        {children}
      </button>
      {open && (
        <PopupWindow
          title={
            <span className="popup-window-title-with-icon">
              {icon && <img className="relic-popup-title-icon" src={icon} alt="" />}
              {itemName}
            </span>
          }
          onClose={() => setOpen(false)}
        >
          {/* Fixed-px max-height + scroll (not the shared PopupWindow's own
              vh-based cap) - a real item like Acceltra Prime has 4 distinct
              reward names x ~6 relics each, tall enough to reveal that
              `.popup-window`'s `max-height: 85vh` doesn't account for the
              app's own body-level UI-zoom (Settings -> UI Size) the way
              this file's other zoom-aware portals do (found 2026-09-25
              while building this feature - vh under a zoomed, non-
              counter-zoomed ancestor rendered ~1450px tall instead of
              ~85% of the real viewport). A plain px value doesn't have
              that vh-specific interaction, so it stays correctly bounded
              regardless of zoom level - a scoped fix for this table
              specifically, not a change to the shared PopupWindow
              foundation every other popup also relies on. */}
          <div className="drop-sources-popup-table-wrap">
            <DropSourcesTableContent rows={rows} error={error} showItemColumn />
          </div>
        </PopupWindow>
      )}
    </>
  );
}

// Mastered badge (top-right).
//
// NO Progenitor Element badge here (removed 2026-09-22) - the mechanic
// was initially misread as "the damage element this Warframe deals" and
// surfaced as a per-card status icon on that basis. It's actually a
// ONE-TIME-EVENT attribute (see
// https://wiki.warframe.com/w/Adversary_System#Progenitor_Warframe):
// whichever Warframe is EQUIPPED at the moment you perform the Parazon
// mercy/kill finisher on a Kuva Larvling or Corpus Candidate determines
// that resulting Kuva Lich's/Sister of Parvos' weapon element bonus,
// ephemera type, and ability kit - it has nothing to do with that
// Warframe's own combat behavior day-to-day, so badging every card with
// it implied a meaning the data doesn't have. `item.progenitorElement`/
// `item.portraitImage` (db.ts) and warframeElements.ts's
// ELEMENT_COLORS/ELEMENT_ICONS are all still wired through and kept
// as-is - see warframeElements.ts's header comment for the real use
// case this data is for and isn't built yet.
//
// NO hover preview here either (removed 2026-09-24, per the user's ask -
// the full-body wiki-render popup that used to show on Warframe hover).
// `item.portraitImage` itself is left wired through (db.ts/api.ts) since
// warframeElements.ts still has an unbuilt use for that data - only the
// popup UI that consumed it here is gone.
const ItemCard = memo(function ItemCard({
  item,
  uniformItemStyle,
}: {
  item: CollectionItem;
  uniformItemStyle: boolean;
}) {
  return (
    <div className={`item-card ${themeClassesFor(item, uniformItemStyle)}`} title={item.itemType}>
      {!!item.masteryReq && (
        <span
          className="corner-badge corner-badge-left mr-badge"
          title={`Mastery Rank ${item.masteryReq} required`}
        >
          <img className="mr-badge-icon" src={masteryRankIconFor(item.masteryReq)} alt="" />
          {item.masteryReq}
        </span>
      )}
      {item.mastered !== null && (
        <span
          className="corner-badge corner-badge-right mastered-badge"
          title={item.mastered ? "Mastered (ever hit max rank)" : "Not yet mastered"}
        >
          <img
            className={`mastered-badge-icon ${item.mastered ? "" : "mastered-badge-icon-dim"}`}
            src={MASTERED_ICON}
            alt={item.mastered ? "Mastered" : "Not yet mastered"}
          />
        </span>
      )}
      <CollectionItemDropSourcesButton itemType={item.itemType} itemName={item.name} icon={item.icon}>
        <IconOrPlaceholder icon={item.icon} name={item.name} />
      </CollectionItemDropSourcesButton>
      <div className="item-name">{item.name}</div>
      {/* Always rendered (even for unowned items / items with no rank data)
          so every card reserves the same fixed height for this row - an
          item-badge-row that only sometimes exists made unowned cards
          shorter than owned ones, which shifted the item-name block's
          center point card-to-card. Content inside is conditional; the
          row's reserved space (.item-badge-row's min-height) is not. */}
      <div className="item-badge-row">
        {item.owned && item.rank !== null && item.maxRank !== null && (
          <>
            <div className="item-badge-side">
              <img
                className={`item-status-icon ${item.capacityBoosted ? "" : "item-status-icon-off"}`}
                src={capacityIconFor(item.category)}
                alt=""
                title={`${capacityLabelFor(item.category)} ${item.capacityBoosted ? "installed" : "not installed"}`}
              />
              <img
                className={`item-status-icon ${item.exilusInstalled ? "" : "item-status-icon-off"}`}
                src={exilusIconFor(item.category)}
                alt=""
                title={`Exilus adapter ${item.exilusInstalled ? "installed" : "not installed"}`}
              />
            </div>
            <div className="item-rank">
              {item.rank}/{item.maxRank}
            </div>
            <div className="item-badge-side item-badge-side-right">
              {!!item.formaCount && (
                <div className="item-forma" title={`Forma count: ${item.formaCount}`}>
                  <img className="item-status-icon" src={FORMA_ICON} alt="" />
                  {item.formaCount}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* Manufacturing Requirements row (2026-09-24) - one real icon per
          Foundry ingredient this item needs (its own Blueprint plus any
          sub-component/relic-part recipes - see server/src/manufacturing.ts's
          header comment for where this comes from), e.g. Excalibur:
          Blueprint, Neuroptics, Chassis, Systems. Always rendered (own
          reserved min-height) for the same reason .item-badge-row is -
          null for anything with no matching Recipe at all, so most
          non-buildable items just show this row empty. Outline color is
          the state: red = not owned, white = blueprint owned but not
          yet built, green = actually built (or, for the item's own
          Blueprint slot, the whole item is owned). */}
      <div className="item-manufacturing-row">
        {item.manufacturingRequirements?.map((req, i) => (
          <div
            key={i}
            className="item-manufacturing-icon-wrap"
            title={`${req.label}: ${
              req.state === "crafted" ? "Built" : req.state === "owned" ? "Blueprint owned, not built" : "Not owned"
            }`}
          >
            {req.icon && (
              <img
                className={`item-manufacturing-icon item-manufacturing-icon-${req.state}`}
                src={req.icon}
                alt={req.label}
              />
            )}
          </div>
        ))}
      </div>
      {item.owned && item.ownedCount > 1 && <div className="item-owned-count">×{item.ownedCount}</div>}
    </div>
  );
});

// Maps "anchor item's itemType" -> "Helminth-eligible item to render right
// after it" - repositions the Helminth duplicate to sit immediately after
// its Prime counterpart's card (e.g. Excalibur, Excalibur Prime,
// Excalibur-Helminth) rather than immediately after the non-Prime item
// itself (2026-09-21, per user feedback that it should be "immediately to
// the right of the Prime frame"). Falls back to anchoring on the item
// itself when it has no Prime counterpart in this same list (e.g.
// Excalibur Umbra, or any newer frame with no Prime yet) - unaffected,
// same position as before. Scoped to a single category-section's items
// (always "Suits" in practice, since only Suits ever have
// helminthSubsumed !== null) rather than the whole catalog, since Prime
// lookup is by exact name match within the same list being rendered.
function computeHelminthPlacement(items: CollectionItem[]): Map<string, CollectionItem> {
  const byName = new Map(items.map((i) => [i.name, i]));
  const placement = new Map<string, CollectionItem>();
  for (const item of items) {
    if (item.helminthSubsumed === null) continue;
    const prime = byName.get(`${item.name} Prime`);
    const anchor = prime ?? item;
    placement.set(anchor.itemType, item);
  }
  return placement;
}

// Helminth duplicate - one per non-Prime Warframe (item.helminthSubsumed
// is null for anything else, see api.ts), icon+name only per the user's
// spec. Dim state keeps the border partially visible (via a low-opacity
// gradient, not a desaturating filter) while still graying the
// icon/name - "grayed out, color still slightly visible." A Helminth
// icon overlays the Warframe's own icon at 20% opacity, always (not
// just in the dim state) - a compositing detail of the tile, not a
// status indicator on its own (the border/dimming already carries that).
// Border is a Body/Highlight color gradient (Bruised Purple, Deep
// Maroon, Fleshy Pink, Calcified Tan - the user's own naming of the
// Infested/Helminth color scheme), same technique as the Incarnon
// gradient border. On hover, an Energy-color glow (Bile Yellow/Toxic
// Green) appears - see App.css for the same hex-approximation caveat
// as the Incarnon colors (no exported table for these named colors).
// `uniformItemStyle` swaps this tile's classes to the plain Normal ones
// (border AND font, since the Creepster override is scoped to
// .item-card-helminth) instead of adding extra CSS overrides - see
// themeClassesFor()'s comment.
function HelminthCard({ item, uniformItemStyle }: { item: CollectionItem; uniformItemStyle: boolean }) {
  const subsumed = !!item.helminthSubsumed;
  const themeClass = uniformItemStyle
    ? `item-card-normal ${subsumed ? "" : "item-card-unowned"}`
    : `item-card-helminth ${subsumed ? "" : "item-card-helminth-dim"}`;
  return (
    <div
      className={`item-card ${themeClass}`}
      title={`${item.itemType} (Helminth)${subsumed ? " - subsumed" : " - not yet subsumed"}`}
    >
      <div className="item-icon-stack">
        <IconOrPlaceholder icon={item.icon} name={item.name} />
        <img className="item-icon-overlay" src={HELMINTH_ICON} alt="" />
      </div>
      <div className="item-name">{item.name}</div>
    </div>
  );
}

// Incarnon Genesis duplicate - one per circuit-eligible Incarnon weapon
// (item.incarnonEligible), using the weapon's real Incarnon Genesis art
// (item.incarnonIcon - confirmed against the actual wiki art, see
// itemNames.ts) rather than the base weapon icon - dim until adapted.
function IncarnonCard({ item, uniformItemStyle }: { item: CollectionItem; uniformItemStyle: boolean }) {
  const installed = !!item.incarnonInstalled;
  const themeClass = uniformItemStyle
    ? `item-card-normal ${installed ? "" : "item-card-unowned"}`
    : `item-card-incarnon ${installed ? "" : "item-card-incarnon-dim"}`;
  return (
    <div
      className={`item-card ${themeClass}`}
      title={`${item.itemType} (Incarnon Genesis)${installed ? " - adapted" : " - not yet adapted"}`}
    >
      <IconOrPlaceholder icon={item.incarnonIcon ?? item.icon} name={item.name} />
      <div className="item-name">{item.name}</div>
      <div className="item-incarnon-tag">Incarnon</div>
    </div>
  );
}

// Fixed footprint for the hover preview (2026-09-22, per the user's "keep
// every image the same size" ask) - every mod's preview renders inside
// this exact box via object-fit: contain in the CSS, regardless of that
// particular wiki image's own native dimensions, so hovering different
// mods doesn't make the popup jump to a different size each time.
const MOD_PREVIEW_WIDTH = 300;
const MOD_PREVIEW_HEIGHT = 420;
const MOD_PREVIEW_CURSOR_GAP = 18;

// Settings -> UI Size (settings.ts's zoomFor()) sets `document.body.style
// .zoom` - the app's DEFAULT ("100%" label) is actually a 1.333 zoom
// factor, not 1 (the raw CSS was sized for what's now labeled "75%").
// This popup is portaled straight into document.body, so it inherits
// that zoom like everything else - any px value in ITS OWN inline style
// gets rendered at px*zoom on screen. mouse event coordinates and
// window.innerWidth/innerHeight are NOT affected by an element's zoom
// (they're always real/visual pixels), so mixing the two without
// converting caused the popup to land far from the cursor at the app's
// actual default zoom - found 2026-09-22 while verifying this feature:
// a "cursor+18px" offset was rendering ~200px away in practice.
function currentUiZoom(): number {
  const raw = document.body.style.zoom;
  const n = raw ? parseFloat(raw) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// CSS zoom's interaction with `position: fixed` containing blocks isn't
// well-specified (zoom is non-standard - a legacy-IE property Chromium
// later adopted, not part of the CSS spec the way transform/filter are)
// and measured as genuinely inconsistent here: dividing the popup's own
// left/top by the ancestor zoom (the first fix attempted) correctly
// countered the SIZE scaling but not the fixed-positioning offset -
// confirmed by comparing computed inline style values against
// getBoundingClientRect() before and after, they didn't reconcile with
// simple multiplication either way. Simplest reliable fix: cancel the
// inherited zoom entirely on the popup's own subtree via its own
// `zoom: 1 / bodyZoom` (nested CSS zoom values compound multiplicatively
// in Chromium, so ancestor 1.333 * own 0.75 = net 1.0) - once the
// popup's subtree renders at true 1:1 scale, it behaves like any other
// un-zoomed fixed-position element and plain cursor-relative pixel math
// works exactly as it would on a page with no zoom at all.
function modPreviewCounterZoom(): number {
  return 1 / currentUiZoom();
}

// Anchors to the right of the cursor per the user's ask, flipping to the
// left only if there's no room on the right (e.g. cursor near the right
// edge of the window) - and clamps vertically so the popup never runs
// off the top/bottom of the viewport regardless of where in the grid the
// cursor is. Plain real-pixel math throughout - safe because the popup
// cancels its own inherited zoom (see modPreviewCounterZoom() above), so
// its left/top live in the same real-pixel space as cursorX/cursorY and
// window.innerWidth/innerHeight.
function modPreviewPosition(cursorX: number, cursorY: number): { left: number; top: number } {
  let left = cursorX + MOD_PREVIEW_CURSOR_GAP;
  if (left + MOD_PREVIEW_WIDTH > window.innerWidth) {
    left = cursorX - MOD_PREVIEW_CURSOR_GAP - MOD_PREVIEW_WIDTH;
  }
  left = Math.max(8, left);

  let top = cursorY - MOD_PREVIEW_HEIGHT / 2;
  top = Math.max(8, Math.min(top, window.innerHeight - MOD_PREVIEW_HEIGHT - 8));

  return { left, top };
}

// Plain item-card (same as every other Collection tab) with one addition:
// a small dot row translating rank visually instead of "3/5" text, per
// the user's 2026-09-22 steer away from the earlier full in-game card-
// chrome rebuild (real frame/polarity/drain assets) - that approach used
// fixed-px chrome inside a fluid-width grid cell, which looked fine at
// one tested viewport size but broke proportion at the grid's actual
// min/max column widths. Not worth rebuilding the whole card for; a
// small addition to the existing simple card gets the useful part (rank
// at a glance) without any of that risk. Sits between the icon and the
// name (own flow row, not an overlay on the icon) per follow-up
// feedback the same day - the overlay covered part of the mod art.
// Best-effort approximation of the in-game mod-card rarity colors
// (white/Common, green/Uncommon, gold/Rare, orange-red/Legendary) - these
// are widely recognized from the game's own UI, but NOT sourced from
// Public Export/WFCD (no hex table exists there, checked) - same caveat
// this file's other approximated palettes already carry (see App.css's
// --incarnon-*/--helminth-* comments). The TIER itself (which bucket a
// mod is in) IS a real, confirmed ExportUpgrades.json field - only the
// exact hex value is a visual approximation, not a sourced one.
const RARITY_COLORS: Record<string, string> = {
  COMMON: "#c9c9c9",
  UNCOMMON: "#5fbf5f",
  RARE: "#e0c040",
  LEGENDARY: "#e0622f",
};

function rarityColor(rarity: string | null): string {
  if (!rarity) return "var(--muted)";
  return RARITY_COLORS[rarity] ?? "var(--muted)";
}

function rarityLabel(rarity: string): string {
  return rarity.charAt(0) + rarity.slice(1).toLowerCase();
}

// Every real wiki subcategory name ends in " Mods" except one out of 84
// ("Mods With Hidden Stats", confirmed via a full scan of
// modWikiSubcategories.json 2026-09-23) - that trailing word is dead
// weight here (already on the Mods tab), so it's stripped for display
// only to shrink each tag's footprint per the user's "least horizontal
// space" ask. Full name still shown via the tag's title attribute.
function shortSubcategoryLabel(name: string): string {
  return name.endsWith(" Mods") ? name.slice(0, -5) : name;
}

const ModCard = memo(function ModCard({ item }: { item: ModItem }) {
  const rank = item.rank ?? 0;
  // JS-driven hover state + a portal, not pure CSS :hover (2026-09-22) -
  // tried CSS-only first (a child `position: fixed` popup revealed via
  // the card's :hover), but unowned cards carry `filter: grayscale(...)`
  // (item-card-unowned), and `filter` on an ancestor creates a new
  // containing block for `position: fixed` descendants per the CSS spec
  // - the popup ended up trapped inside that small card's own box
  // instead of centered on the viewport, confirmed via
  // getBoundingClientRect() while debugging. Portaling to document.body
  // sidesteps this entirely since the popup is no longer a DOM
  // descendant of the filtered card at all.
  //
  // Cursor position is NOT React state (2026-09-23 perf fix) - it used
  // to be, but that meant every single `mousemove` pixel re-rendered this
  // whole ModCard (name/rank dots/rarity/type/subcategory tags/badges,
  // all real DOM work), reported as laggy once this card grew from a
  // plain icon+name into everything the mod-card rework added. `hovered`
  // (a rare on/off flip) still drives the actual React render that
  // mounts/unmounts the portal; the high-frequency position updates
  // while already hovered go straight to the popup DOM node's own style
  // via popupRef, bypassing React/this component's render function
  // entirely - the fix targets the actual hot path, not a general
  // "throttle everything" workaround. wrapped in memo() for the same
  // reason at the grid level - a parent re-render (e.g. a filter change)
  // shouldn't re-render every other still-matching card.
  const [hovered, setHovered] = useState(false);
  const entryCursor = useRef({ x: 0, y: 0 });
  const popupRef = useRef<HTMLDivElement | null>(null);

  function trackCursor(e: React.MouseEvent) {
    if (!popupRef.current) return;
    const pos = modPreviewPosition(e.clientX, e.clientY);
    popupRef.current.style.left = `${pos.left}px`;
    popupRef.current.style.top = `${pos.top}px`;
  }

  return (
    <div
      className={`item-card ${item.owned ? "" : "item-card-unowned"}`}
      title={item.itemType}
      onMouseEnter={(e) => {
        entryCursor.current = { x: e.clientX, y: e.clientY };
        setHovered(true);
      }}
      onMouseMove={trackCursor}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Owned count (top-left) + polarity/drain (top-right) are anchored
          to THIS wrapper, not the whole card (2026-09-23) - anchoring
          them to .item-card directly put them at the card's top edge,
          which overlapped content above the icon (found via a real-
          browser check with synthetic owned data, fixed before
          shipping). Sized to match the icon's own footprint (100x100,
          bumped from 56x56 the same day per the user's follow-up ask) so
          both badges sit ON the icon's corners and deliberately overlap
          its art, not floating above/beside it - see .mod-owned-count/
          .mod-polarity-badge in App.css for the positive (inset, not
          negative/outset) offsets that make that overlap happen. */}
      <div className="mod-icon-wrap">
        {/* Owned count, top-left (2026-09-23, moved off the former
            bottom-right spot per the user's spec - unique to ModCard,
            doesn't touch ItemCard's bottom-right .item-owned-count). */}
        {item.owned && item.ownedCount > 1 && <div className="mod-owned-count">×{item.ownedCount}</div>}
        {/* Polarity, top-right (2026-09-23): drain cost (min/max) to the
            left of the official wiki polarity icon (polarityIcons.ts) -
            null when the mod has no player-visible polarity (AP_UNIVERSAL
            or missing), renders nothing rather than an empty slot. */}
        {item.polarity && (
          <div className="mod-polarity-badge" title={item.polarity.name}>
            {item.drainMin !== null && item.drainMax !== null && (
              <span className="mod-drain-cost">
                {item.drainMin}/{item.drainMax}
              </span>
            )}
            <img className="mod-polarity-icon" src={item.polarity.icon} alt={item.polarity.name} />
          </div>
        )}
        <IconOrPlaceholder icon={item.icon} name={item.name} />
      </div>
      {/* Rarity (2026-09-23) - real ExportUpgrades.json tier, color per
          rarityColor()'s approximation caveat above. */}
      {item.rarity && (
        <div className="mod-rarity-label" style={{ color: rarityColor(item.rarity) }}>
          {rarityLabel(item.rarity)}
        </div>
      )}
      {item.owned && item.maxRank > 0 && (
        <div className="mod-rank-dots" title={`Rank ${rank}/${item.maxRank}`}>
          {Array.from({ length: item.maxRank }, (_, i) => (
            <span key={i} className={`mod-rank-dot ${i < rank ? "mod-rank-dot-filled" : ""}`} />
          ))}
        </div>
      )}
      <div className="item-name">{item.name}</div>
      {/* Mod type (2026-09-23) - the same friendly label that drives the
          Mods "Category" filter (Primary/Melee/Warframe/...), shown here
          as a plain label below the name per the user's spec. */}
      <div className="mod-type-label">{item.category}</div>
      {/* Subcategory (2026-09-23, moved below the type label + switched
          from a joined text line to individual tags per the user's
          follow-up ask). The real wiki-scraped list - a mod can carry
          several, one tag per hit. Empty for the ~unmapped mods (see
          modSubcategories.ts) - renders nothing, not an empty row, so
          cards without one don't look "broken". */}
      {item.subcategories.length > 0 && (
        <div className="mod-subcategory-tags">
          {item.subcategories.map((s) => (
            <span key={s} className="mod-subcategory-tag" title={s}>
              {shortSubcategoryLabel(s)}
            </span>
          ))}
        </div>
      )}
      {/* Full-quality preview on hover - item.previewImage is the real
          wiki card image (server/src/itemIcons.ts's resolveModPreview),
          a genuinely higher-res source than `icon` above, not the same
          URL upscaled. Anchored to the right of the cursor (flips left
          near the window's right edge), no backdrop dimming, fixed
          footprint via modPreviewPosition()/MOD_PREVIEW_* above - see
          App.css's .mod-preview-popup for the fixed size + entry
          animation. */}
      {hovered &&
        item.previewImage &&
        createPortal(
          <div
            ref={popupRef}
            className="mod-preview-popup"
            style={{ ...modPreviewPosition(entryCursor.current.x, entryCursor.current.y), zoom: modPreviewCounterZoom() }}
          >
            <img src={item.previewImage} alt={item.name} />
          </div>,
          document.body,
        )}
    </div>
  );
});

function EquipmentGrid({
  data,
  subTab,
  weaponFilter,
  showUnowned,
  nameFilter,
  uniformItemStyle,
}: {
  data: CollectionResponse;
  subTab: CollectionSubTab;
  weaponFilter: WeaponSubFilter;
  showUnowned: boolean;
  nameFilter: string;
  uniformItemStyle: boolean;
}) {
  const byCategory = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    const map = new Map<string, CollectionItem[]>();
    for (const item of data.items) {
      if (!showUnowned && !item.owned) continue;
      if (needle && !item.name.toLowerCase().includes(needle)) continue;

      if (subTab === "Warframes" && item.category !== "Suits") continue;
      if (subTab === "Companions" && item.category !== "Sentinels" && item.category !== "SentinelWeapons")
        continue;
      if (subTab === "Weapons") {
        if (!WEAPON_CATEGORIES.includes(item.category)) continue;
        if (weaponFilter !== "All" && item.category !== WEAPON_SUB_FILTER_CATEGORY[weaponFilter]) continue;
      }
      if (subTab === "Archwing" && !ARCHWING_CATEGORIES.includes(item.category)) continue;
      if (subTab === "K-Drive" && item.category !== "Hoverboards") continue;

      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [data, subTab, weaponFilter, showUnowned, nameFilter]);

  const totalShown = [...byCategory.values()].reduce((n, items) => n + items.length, 0);

  return (
    <div>
      {subTab === "Companions" && (
        <p className="hint">
          Companion weapon tracking is new and not yet confirmed against a live sync — see DEVLOG.md if this
          section looks empty or wrong after syncing.
        </p>
      )}
      {(subTab === "Archwing" || subTab === "K-Drive") && (
        <p className="hint">
          {subTab} tracking is new and not yet confirmed against a live sync — see DEVLOG.md if this section
          looks empty or wrong after syncing.
        </p>
      )}
      {totalShown === 0 && <p className="hint">Nothing in this view yet.</p>}
      {[...byCategory.entries()]
        .sort(([a], [b]) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
        .map(([category, items]) => {
          const helminthPlacement = computeHelminthPlacement(items);
          return (
            <section className="category-section" key={category}>
              <h2>
                {CATEGORY_LABELS[category] ?? category} ({items.filter((i) => i.owned).length}/{items.length})
              </h2>
              <div className="item-grid">
                {items.map((item) => {
                  const helminthItem = helminthPlacement.get(item.itemType);
                  return (
                    <Fragment key={item.itemType}>
                      <ItemCard item={item} uniformItemStyle={uniformItemStyle} />
                      {helminthItem && (showUnowned || helminthItem.helminthSubsumed) && (
                        <HelminthCard item={helminthItem} uniformItemStyle={uniformItemStyle} />
                      )}
                      {item.incarnonEligible && (showUnowned || item.incarnonInstalled) && (
                        <IncarnonCard item={item} uniformItemStyle={uniformItemStyle} />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}

function ModsGrid({
  data,
  showUnowned,
  nameFilter,
  category,
  subcategory,
}: {
  data: ModsCollectionResponse;
  showUnowned: boolean;
  nameFilter: string;
  category: string;
  subcategory: string;
}) {
  const items = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    return data.items.filter((i) => {
      if (!showUnowned && !i.owned) return false;
      if (needle && !i.name.toLowerCase().includes(needle)) return false;
      if (category !== "All" && i.category !== category) return false;
      if (subcategory !== "All" && !i.subcategories.includes(subcategory)) return false;
      return true;
    });
  }, [data, showUnowned, nameFilter, category, subcategory]);

  return (
    <div>
      {items.length === 0 && <p className="hint">Nothing in this view yet.</p>}
      <div className="item-grid">
        {items.map((item) => (
          <ModCard item={item} key={item.itemType} />
        ))}
      </div>
    </div>
  );
}

// Arcanes (2026-09-24) - a much plainer sibling of ModCard: real icon,
// name, rarity, rank + owned count, no hover preview/polarity/drain/
// subcategory tags (none of that applies to arcanes - see
// server/src/arcanesCatalog.ts). Reuses ModCard's exact CSS classes
// (mod-owned-count, mod-rarity-label, mod-rank-dots/-dot/-dot-filled)
// rather than inventing near-duplicate ones, since the visual language
// is meant to read as the same family as Mods (same underlying SNS
// RawUpgrades/Upgrades mechanism).
const ArcaneCard = memo(function ArcaneCard({ item }: { item: ArcaneItem }) {
  const rank = item.rank ?? 0;
  return (
    <div className={`item-card ${item.owned ? "" : "item-card-unowned"}`} title={item.itemType}>
      <div className="mod-icon-wrap arcane-icon-wrap">
        {item.owned && item.ownedCount > 1 && <div className="mod-owned-count">×{item.ownedCount}</div>}
        <IconOrPlaceholder icon={item.icon} name={item.name} />
      </div>
      {item.rarity && (
        <div className="mod-rarity-label" style={{ color: rarityColor(item.rarity) }}>
          {rarityLabel(item.rarity)}
        </div>
      )}
      {item.owned && item.maxRank > 0 && (
        <div className="mod-rank-dots" title={`Rank ${rank}/${item.maxRank}`}>
          {Array.from({ length: item.maxRank }, (_, i) => (
            <span key={i} className={`mod-rank-dot ${i < rank ? "mod-rank-dot-filled" : ""}`} />
          ))}
        </div>
      )}
      <div className="item-name">{item.name}</div>
      {/* Equipment slot ("Warframe"/"Melee"/"Operator"/...) - same plain
          label-under-name treatment as ModCard's .mod-type-label, shown
          only once resolved (see ArcaneItem.category's null-until-loaded
          comment). */}
      {item.category && <div className="mod-type-label">{item.category}</div>}
    </div>
  );
});

function ArcanesGrid({
  data,
  showUnowned,
  nameFilter,
  category,
}: {
  data: ArcanesCollectionResponse;
  showUnowned: boolean;
  nameFilter: string;
  category: string;
}) {
  const items = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    return data.items.filter((i) => {
      if (!showUnowned && !i.owned) return false;
      if (needle && !i.name.toLowerCase().includes(needle)) return false;
      if (category !== "All" && i.category !== category) return false;
      return true;
    });
  }, [data, showUnowned, nameFilter, category]);

  return (
    <div>
      {items.length === 0 && <p className="hint">Nothing in this view yet.</p>}
      <div className="item-grid">
        {items.map((item) => (
          <ArcaneCard item={item} key={item.itemType} />
        ))}
      </div>
    </div>
  );
}

// Shared table body for every "where do I get this" view (relic reward
// hover panel below, and the plain-Collection-card click popup further
// down) - `showItemColumn` is on for the Collection-card case (a single
// lookup there can span several distinct reward names - Blueprint AND
// Chassis AND Systems AND ... - so the row needs to say which one each
// line is) and off for the relic-reward case (the panel's own title
// already names the one exact item every row is for).
function DropSourcesTableContent({
  rows,
  error,
  showItemColumn,
}: {
  rows: DropRow[] | null;
  error: string | null;
  showItemColumn?: boolean;
}) {
  if (error) return <p className="hint">Couldn't load drop sources: {error}</p>;
  if (rows === null) return <p className="hint">Loading…</p>;
  if (rows.length === 0) return <p className="hint">No known drop sources for this item.</p>;
  return (
    <table className="drop-results-table">
      <thead>
        <tr>
          {showItemColumn && <th>Item</th>}
          <th>Place</th>
          <th>Rarity</th>
          <th>Chance</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.item}|${row.place}|${i}`}>
            {showItemColumn && <td>{row.item}</td>}
            <td>{row.place}</td>
            <td style={{ color: dropRarityColor(row.rarity) }}>{row.rarity || "—"}</td>
            <td>{formatDropChance(row.chance)}</td>
            <td>{DROP_KIND_LABELS[row.kind]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Fixed footprint for the relic-reward "where do I get this" hover panel
// (2026-09-25) - same "every popup the same size" reasoning as
// MOD_PREVIEW_WIDTH/HEIGHT above, but width-only (height varies with
// however many real sources an item has - capped/scrollable instead of a
// fixed box, since that count isn't known ahead of the fetch resolving
// the way a mod's preview image's box is).
const DROP_SOURCES_PANEL_WIDTH = 420;
const DROP_SOURCES_PANEL_GAP = 14;
// Grace window (2026-09-25) for moving the cursor from the trigger row to
// the panel itself (they don't touch - the panel sits to the popup's
// left) without it disappearing mid-transit - see
// RewardDropSourcesHoverTrigger's scheduleHide()/cancelHide() comment.
const DROP_SOURCES_HOVER_HIDE_DELAY_MS = 150;

// Anchors to the LEFT of the relic popup that's already open (per the
// user's ask), flipping to the right only if there's genuinely no room
// on the left (a narrow/small window). Top aligns with the popup's own
// top edge rather than tracking the individual hovered row - simpler,
// and the ask was about the popup's position, not per-row tracking.
// `maxHeight` (2026-09-25, per the user's follow-up ask) never exceeds
// the relic popup's OWN rendered height - a real item with a lot of
// sources (Forma Blueprint's real Mission rewards, not just relics) used
// to grow taller than the popup it's attached to, which read as the
// hover panel "taking over" the screen rather than a small side panel;
// also never exceeds the viewport space actually available below `top`,
// so it can't run off the bottom of the window either. The panel's own
// `overflow-y: auto` (App.css) turns this cap into an internal scrollbar
// instead of further growth.
function dropSourcesPanelPosition(anchorRect: DOMRect): { left: number; top: number; maxHeight: number } {
  let left = anchorRect.left - DROP_SOURCES_PANEL_GAP - DROP_SOURCES_PANEL_WIDTH;
  if (left < 8) left = anchorRect.right + DROP_SOURCES_PANEL_GAP;
  const top = Math.max(8, anchorRect.top);
  const maxHeight = Math.min(anchorRect.height, window.innerHeight - top - 8);
  return { left, top, maxHeight };
}

// "Where do I get this" for a relic reward row (2026-09-25) - switched
// from click to HOVER per the user's follow-up ask, and from a nested
// PopupWindow to a plain no-backdrop floating panel (the same cursor-
// independent portal technique ModCard's mod-preview-popup already uses,
// including the same inherited-UI-zoom cancel - see
// modPreviewCounterZoom()'s header comment for why any portaled element
// doing real-pixel getBoundingClientRect() math needs that). A second
// PopupWindow would render its own `.popup-backdrop` on top of the
// relic popup's own - stacking a second dim layer, exactly the "second
// dimming effect" the user asked to remove - so this renders no backdrop
// at all. `anchorRef` is the relic popup's own outer `.popup-window` DOM
// node (exposed via PopupWindow's `windowRef` prop) - used to position
// this panel to ITS left, not the cursor's.
//
// scheduleHide()/cancelHide() (2026-09-25, per the user's follow-up ask
// to let the cursor move onto the panel to scroll it): the panel doesn't
// sit under the trigger row - it's off to the popup's left - so a
// straight mouseleave-hides-it rule would close the panel the instant the
// cursor starts traveling toward it, before it could ever be scrolled.
// Hiding is deferred by a short delay instead of happening immediately;
// the panel ALSO has its own onMouseEnter that cancels a pending hide, so
// entering the panel within that window keeps it open, and its own
// onMouseLeave re-schedules the hide for when the cursor actually leaves
// for good.
function RewardDropSourcesHoverTrigger({
  itemName,
  icon,
  anchorRef,
  children,
}: {
  itemName: string;
  icon: string | null;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [rows, setRows] = useState<DropRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const hideTimeout = useRef<number | null>(null);

  useBodyScrollLock(hovered);

  function cancelHide() {
    if (hideTimeout.current !== null) {
      window.clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  }

  function scheduleHide() {
    cancelHide();
    hideTimeout.current = window.setTimeout(() => setHovered(false), DROP_SOURCES_HOVER_HIDE_DELAY_MS);
  }

  useEffect(() => cancelHide, []);

  useEffect(() => {
    if (!hovered) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    getDropsForItem(itemName)
      .then((r) => {
        if (!cancelled) setRows(r.rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [hovered, itemName]);

  return (
    <span
      className="reward-item-hover-trigger"
      onMouseEnter={() => {
        cancelHide();
        if (anchorRef.current) setPosition(dropSourcesPanelPosition(anchorRef.current.getBoundingClientRect()));
        setHovered(true);
      }}
      onMouseLeave={scheduleHide}
    >
      {children}
      {hovered &&
        position &&
        createPortal(
          <div
            className="drop-sources-hover-panel"
            style={{
              left: position.left,
              top: position.top,
              width: DROP_SOURCES_PANEL_WIDTH,
              maxHeight: position.maxHeight,
              zoom: modPreviewCounterZoom(),
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="drop-sources-hover-panel-title">
              {icon && <img className="relic-popup-title-icon" src={icon} alt="" />}
              {itemName}
            </div>
            <DropSourcesTableContent rows={rows} error={error} />
          </div>,
          document.body,
        )}
    </span>
  );
}

// Relics (2026-09-24; popup rework 2026-09-24 same day) - the card shows
// icon/name/vaulted badge/per-refinement owned-count pips; clicking it
// opens a PopupWindow (see that component's own header comment for the
// reusable-foundation rationale) showing the full reward table for one
// selected refinement tier at a time, real per-tier odds (server/src/
// relicsCatalog.ts's header comment - WFCD's Relics.json already scopes
// rewards to the exact quality tier, no client-side recomputation
// needed). Reuses the Drop Rates tab's own `dropRarityColor()`/
// `formatDropChance()` helpers and `.drop-results-table` styling rather
// than inventing new ones - same rarity/chance data shape (DropData's
// relic rows and this feature's rewards both ultimately come from the
// same WFCD project family). `hideVaultedLabels` (Settings toggle,
// 2026-09-24) - see settings.ts's getStoredHideVaultedLabels comment and
// ../CLAUDE.md's "Vaulted-label setting" section - this is the ONLY
// place vaulted status is ever displayed, so this is the ONLY prop-check
// that setting needs.
const RelicCard = memo(function RelicCard({
  item,
  hideVaultedLabels,
}: {
  item: RelicItem;
  hideVaultedLabels: boolean;
}) {
  const [open, setOpen] = useState(false);
  const popupWindowRef = useRef<HTMLDivElement | null>(null);
  const availableRefinements = RELIC_REFINEMENT_ORDER.filter((r) =>
    item.refinements.some((ref) => ref.refinement === r),
  );
  const [selectedRefinement, setSelectedRefinement] = useState(
    () => item.refinements.find((r) => r.ownedCount > 0)?.refinement ?? availableRefinements[0] ?? "Intact",
  );
  const selected = item.refinements.find((r) => r.refinement === selectedRefinement);

  return (
    <>
      <div
        className={`item-card ${item.owned ? "" : "item-card-unowned"}`}
        title={item.key}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen(true);
        }}
      >
        {item.vaulted && !hideVaultedLabels && (
          <span className="relic-vaulted-badge" title="Vaulted - not currently available to farm">
            Vaulted
          </span>
        )}
        <IconOrPlaceholder icon={item.icon} name={item.key} />
        <div className="item-name">{item.key}</div>
        <div className="relic-refinement-pips">
          {availableRefinements.map((r) => {
            const info = item.refinements.find((ref) => ref.refinement === r);
            const owned = info?.ownedCount ?? 0;
            return (
              <span
                key={r}
                className={`relic-refinement-pip ${owned > 0 ? "relic-refinement-pip-owned" : ""}`}
                title={`${r}: ${owned} owned`}
              >
                {r[0]}
                {owned > 0 ? ` ×${owned}` : ""}
              </span>
            );
          })}
        </div>
      </div>
      {open && (
        <PopupWindow
          title={
            <span className="popup-window-title-with-icon">
              {item.icon && <img className="relic-popup-title-icon" src={item.icon} alt="" />}
              {item.key}
            </span>
          }
          onClose={() => setOpen(false)}
          className="relic-popup"
          windowRef={popupWindowRef}
        >
          <div className="relic-refinement-tabs">
            {availableRefinements.map((r) => (
              <button
                key={r}
                className={`sub-tab ${r === selectedRefinement ? "sub-tab-active" : ""}`}
                onClick={() => setSelectedRefinement(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {selected?.rewards ? (
            <table className="drop-results-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Rarity</th>
                  <th>Chance</th>
                </tr>
              </thead>
              <tbody>
                {selected.rewards.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <RewardDropSourcesHoverTrigger itemName={r.itemName} icon={r.icon} anchorRef={popupWindowRef}>
                        <span className="relic-reward-item-cell">
                          {r.icon && <img className="relic-reward-item-icon" src={r.icon} alt="" />}
                          {r.itemName}
                        </span>
                      </RewardDropSourcesHoverTrigger>
                    </td>
                    <td style={{ color: dropRarityColor(r.rarity) }}>{r.rarity}</td>
                    <td>{formatDropChance(r.chance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">Reward data not loaded yet.</p>
          )}
        </PopupWindow>
      )}
    </>
  );
});

function RelicsGrid({
  data,
  showUnowned,
  nameFilter,
  era,
  hideVaultedLabels,
}: {
  data: RelicsCollectionResponse;
  showUnowned: boolean;
  nameFilter: string;
  era: string;
  hideVaultedLabels: boolean;
}) {
  const items = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    return data.items.filter((i) => {
      if (!showUnowned && !i.owned) return false;
      if (needle && !i.key.toLowerCase().includes(needle)) return false;
      if (era !== "All" && i.era !== era) return false;
      return true;
    });
  }, [data, showUnowned, nameFilter, era]);

  return (
    <div>
      {items.length === 0 && <p className="hint">Nothing in this view yet.</p>}
      <div className="item-grid">
        {items.map((item) => (
          <RelicCard item={item} key={item.key} hideVaultedLabels={hideVaultedLabels} />
        ))}
      </div>
    </div>
  );
}

function CollectionView({
  uniformItemStyle,
  hideVaultedLabels,
}: {
  uniformItemStyle: boolean;
  hideVaultedLabels: boolean;
}) {
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modsData, setModsData] = useState<ModsCollectionResponse | null>(null);
  const [modsError, setModsError] = useState<string | null>(null);
  const [arcanesData, setArcanesData] = useState<ArcanesCollectionResponse | null>(null);
  const [arcanesError, setArcanesError] = useState<string | null>(null);
  const [relicsData, setRelicsData] = useState<RelicsCollectionResponse | null>(null);
  const [relicsError, setRelicsError] = useState<string | null>(null);
  const [showUnowned, setShowUnowned] = useState(true);
  const [subTab, setSubTab] = useState<CollectionSubTab>("All");
  const [weaponFilter, setWeaponFilter] = useState<WeaponSubFilter>("All");
  // Name search - applies across every sub-tab (the filter bar's left/
  // "all collection tabs" side). The two Mods dropdowns below only make
  // sense on the Mods sub-tab (the filter bar's right/tab-specific side);
  // reset both whenever the user leaves Mods so they don't silently keep
  // filtering when the user returns to Mods later.
  const [nameFilter, setNameFilter] = useState("");
  // "Category" - this app's own coarse equipment-slot grouping (Warframe/
  // Primary/Secondary/Melee/...), from modItem.category.
  const [modCategory, setModCategory] = useState("All");
  // "Subcategories" - the REAL wiki.warframe.com/w/Category:Mods
  // subcategory list (Bow Mods, Amalgam Mods, Set Mods, ...), from
  // modItem.subcategories. A mod can be in several; this filter is a
  // single-select "show mods that include this one", not multi-select.
  const [modSubcategory, setModSubcategory] = useState("All");
  // "Category" for Arcanes - the equipment slot it sockets into
  // (Warframe/Primary/Secondary/Melee/Operator/Amp/Zaw/Kitgun/...), from
  // arcaneItem.category. Same reset-on-tab-leave treatment as the Mods
  // filters above.
  const [arcaneCategory, setArcaneCategory] = useState("All");
  // "Era" for Relics (Lith/Meso/Neo/Axi/Requiem/Vanguard), from
  // relicItem.era. Same reset-on-tab-leave treatment as the filters
  // above.
  const [relicEra, setRelicEra] = useState("All");

  const modCategoryOptions = useMemo(() => {
    if (!modsData) return [];
    const present = new Set(modsData.items.map((i) => i.category));
    const ordered = MOD_CATEGORY_ORDER.filter((c) => present.has(c));
    if (present.has("Other")) ordered.push("Other");
    return ordered;
  }, [modsData]);

  const modSubcategoryOptions = useMemo(() => {
    if (!modsData) return [];
    const present = new Set<string>();
    for (const item of modsData.items) for (const s of item.subcategories) present.add(s);
    return [...present].sort();
  }, [modsData]);

  const arcaneCategoryOptions = useMemo(() => {
    if (!arcanesData) return [];
    const present = new Set(arcanesData.items.map((i) => i.category).filter((c): c is string => c !== null));
    const ordered = ARCANE_CATEGORY_ORDER.filter((c) => present.has(c));
    if (present.has("Other")) ordered.push("Other");
    return ordered;
  }, [arcanesData]);

  const relicEraOptions = useMemo(() => {
    if (!relicsData) return [];
    const present = new Set(relicsData.items.map((i) => i.era));
    return RELIC_ERA_ORDER.filter((e) => present.has(e));
  }, [relicsData]);

  useEffect(() => {
    getCollectionData()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    getModsCollectionData()
      .then((d) => {
        setModsData(d);
        setModsError(null);
      })
      .catch((err) => setModsError(err instanceof Error ? err.message : String(err)));
    getArcanesCollectionData()
      .then((d) => {
        setArcanesData(d);
        setArcanesError(null);
      })
      .catch((err) => setArcanesError(err instanceof Error ? err.message : String(err)));
    getRelicsCollectionData()
      .then((d) => {
        setRelicsData(d);
        setRelicsError(null);
      })
      .catch((err) => setRelicsError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div className="panel panel-error">
        <p>Can't reach the OpenTools server.</p>
        <p className="hint">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="panel">Loading…</div>;
  }

  const ownedCount = data.items.filter((i) => i.owned).length;

  return (
    <div>
      <nav className="sub-tab-bar">
        {COLLECTION_SUB_TABS.map((t) => (
          <Fragment key={t}>
            {COLLECTION_SUB_TAB_DIVIDER_BEFORE.has(t) && (
              <span className="sub-tab-divider" aria-hidden="true">
                |
              </span>
            )}
            <button
              className={`sub-tab ${t === subTab ? "sub-tab-active" : ""}`}
              onClick={() => {
                setSubTab(t);
                if (t !== "Mods") {
                  setModCategory("All");
                  setModSubcategory("All");
                }
                if (t !== "Arcanes") {
                  setArcaneCategory("All");
                }
                if (t !== "Relics") {
                  setRelicEra("All");
                }
              }}
            >
              {t}
            </button>
          </Fragment>
        ))}
      </nav>

      {subTab === "Weapons" && (
        <nav className="sub-tab-bar sub-tab-bar-nested">
          {WEAPON_SUB_FILTERS.map((f) => (
            <button
              key={f}
              className={`sub-tab ${f === weaponFilter ? "sub-tab-active" : ""}`}
              onClick={() => setWeaponFilter(f)}
            >
              {f}
            </button>
          ))}
        </nav>
      )}

      <div className="collection-filter-bar">
        <div className="filter-bar-left">
          <input
            type="search"
            className="filter-search-input"
            placeholder="Search by name…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>
        <div className="filter-bar-right">
          {subTab === "Mods" && modCategoryOptions.length > 0 && (
            <label className="filter-select-label">
              Category
              <select
                className="filter-select"
                value={modCategory}
                onChange={(e) => setModCategory(e.target.value)}
              >
                <option value="All">All</option>
                {modCategoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {subTab === "Mods" && modSubcategoryOptions.length > 0 && (
            <label className="filter-select-label">
              Subcategories
              <select
                className="filter-select"
                value={modSubcategory}
                onChange={(e) => setModSubcategory(e.target.value)}
              >
                <option value="All">All</option>
                {modSubcategoryOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {subTab === "Arcanes" && arcaneCategoryOptions.length > 0 && (
            <label className="filter-select-label">
              Category
              <select
                className="filter-select"
                value={arcaneCategory}
                onChange={(e) => setArcaneCategory(e.target.value)}
              >
                <option value="All">All</option>
                {arcaneCategoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          {subTab === "Relics" && relicEraOptions.length > 0 && (
            <label className="filter-select-label">
              Era
              <select className="filter-select" value={relicEra} onChange={(e) => setRelicEra(e.target.value)}>
                <option value="All">All</option>
                {relicEraOptions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="collection-toolbar">
        <label className="toggle">
          <input type="checkbox" checked={showUnowned} onChange={(e) => setShowUnowned(e.target.checked)} />
          Show unowned items
        </label>
        {subTab !== "Mods" && subTab !== "Arcanes" && subTab !== "Relics" && (
          <span className="hint">
            {ownedCount} owned / {data.items.length} total
            {!data.iconStatus.loaded && " · loading icons…"}
            {data.iconStatus.loaded && data.iconStatus.error && " · some icons unavailable"}
          </span>
        )}
        {subTab === "Mods" && modsData && (
          <span className="hint">
            {modsData.items.filter((i) => i.owned).length} owned / {modsData.items.length} total
            {!modsData.iconStatus.loaded && " · loading icons…"}
            {modsData.iconStatus.loaded && modsData.iconStatus.error && " · some icons unavailable"}
          </span>
        )}
        {subTab === "Arcanes" && arcanesData && (
          <span className="hint">
            {arcanesData.items.filter((i) => i.owned).length} owned / {arcanesData.items.length} total
            {!arcanesData.iconStatus.loaded && " · loading icons…"}
            {arcanesData.iconStatus.loaded && arcanesData.iconStatus.error && " · some icons unavailable"}
          </span>
        )}
        {subTab === "Relics" && relicsData && (
          <span className="hint">
            {relicsData.items.filter((i) => i.owned).length} owned / {relicsData.items.length} total
            {!relicsData.iconStatus.loaded && " · loading icons/rewards…"}
            {relicsData.iconStatus.loaded && relicsData.iconStatus.error && " · some icons unavailable"}
          </span>
        )}
      </div>

      {ownedCount === 0 && subTab !== "Mods" && subTab !== "Arcanes" && subTab !== "Relics" && (
        <p className="hint">
          Nothing synced yet — run <code>OpenTools Sync.pluto</code> in-game, or check the Dashboard tab for sync
          status.
        </p>
      )}

      {subTab === "Mods" ? (
        modsError ? (
          <p className="hint">Couldn't load mods: {modsError}</p>
        ) : modsData ? (
          <ModsGrid
            data={modsData}
            showUnowned={showUnowned}
            nameFilter={nameFilter}
            category={modCategory}
            subcategory={modSubcategory}
          />
        ) : (
          <p className="hint">Loading…</p>
        )
      ) : subTab === "Arcanes" ? (
        arcanesError ? (
          <p className="hint">Couldn't load arcanes: {arcanesError}</p>
        ) : arcanesData ? (
          <ArcanesGrid
            data={arcanesData}
            showUnowned={showUnowned}
            nameFilter={nameFilter}
            category={arcaneCategory}
          />
        ) : (
          <p className="hint">Loading…</p>
        )
      ) : subTab === "Relics" ? (
        relicsError ? (
          <p className="hint">Couldn't load relics: {relicsError}</p>
        ) : relicsData ? (
          <RelicsGrid
            data={relicsData}
            showUnowned={showUnowned}
            nameFilter={nameFilter}
            era={relicEra}
            hideVaultedLabels={hideVaultedLabels}
          />
        ) : (
          <p className="hint">Loading…</p>
        )
      ) : (
        <EquipmentGrid
          data={data}
          subTab={subTab}
          weaponFilter={weaponFilter}
          showUnowned={showUnowned}
          nameFilter={nameFilter}
          uniformItemStyle={uniformItemStyle}
        />
      )}
    </div>
  );
}

// Search mode labels shown to the user - server/src/dropData.ts's
// DropSearchMode values ("item"/"place"/"enemy") aren't display-ready on
// their own.
const DROP_SEARCH_MODES: { mode: DropSearchMode; label: string; placeholder: string }[] = [
  { mode: "item", label: "Item", placeholder: "Search for an item (e.g. \"Neurodes\", \"Serration\")…" },
  { mode: "place", label: "Place", placeholder: "Search for a mission, relic, or bounty (e.g. \"Draco\")…" },
  { mode: "enemy", label: "Enemy", placeholder: "Search for an enemy (e.g. \"Nox\")…" },
];

const DROP_KIND_LABELS: Record<DropRow["kind"], string> = {
  enemy: "Enemy",
  mission: "Mission",
  bounty: "Bounty",
  relic: "Relic",
  sortie: "Sortie",
  quest: "Quest",
  syndicate: "Syndicate",
  other: "Other",
};

// Drop chances arrive with up to 4 decimal places upstream; trim trailing
// zeroes rather than rounding to a fixed precision (some real rows, like
// a relic's 2% Rare slot, need that precision to read as non-zero).
function formatDropChance(chance: number | null): string {
  if (chance === null || !Number.isFinite(chance)) return "—";
  return `${Math.round(chance * 10000) / 10000}%`;
}

// Same approximation caveat as App.tsx's other rarity color maps (Mods
// tab's RARITY_COLORS) - a widely-recognized in-game color scheme, not a
// sourced hex table. "Legendary" folded into "Rare"'s color since the
// drop tables' rarity strings only ever go up to Rare/Legendary
// interchangeably depending on table family.
const DROP_RARITY_COLORS: Record<string, string> = {
  Common: "#c9c9c9",
  Uncommon: "#5fbf5f",
  Rare: "#e0c040",
  Legendary: "#e0c040",
};

function dropRarityColor(rarity: string): string {
  return DROP_RARITY_COLORS[rarity] ?? "var(--muted)";
}

// Standalone Drop Rates tab UI - everything item/place/enemy-specific to
// THIS tab lives here (the search-mode toggle, the results table). The
// actual data pipeline (fetch/cache/flatten/search) is entirely in
// server/src/dropData.ts + api.ts's searchDrops()/getDropsForItem(),
// with no knowledge of this component - any future tab that wants "what
// drops this" or "where does this drop" calls those same functions
// directly instead of going through this view.
function DropRatesView() {
  const [mode, setMode] = useState<DropSearchMode>("item");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [result, setResult] = useState<{ rows: DropRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Debounced so typing doesn't fire a request per keystroke - the search
  // itself is cheap (in-memory over server/src/dropData.ts's already-
  // flattened rows), but there's no reason to round-trip on every
  // keypress either.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchDrops(debouncedQuery, mode)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshDrops();
      if (debouncedQuery.trim()) {
        const r = await searchDrops(debouncedQuery, mode);
        setResult(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  const activeMode = DROP_SEARCH_MODES.find((m) => m.mode === mode) ?? DROP_SEARCH_MODES[0];

  return (
    <div>
      <div className="collection-filter-bar">
        <div className="filter-bar-left drop-filter-bar-left">
          {DROP_SEARCH_MODES.map((m) => (
            <button
              key={m.mode}
              className={`sub-tab ${m.mode === mode ? "sub-tab-active" : ""}`}
              onClick={() => setMode(m.mode)}
            >
              {m.label}
            </button>
          ))}
          <input
            type="search"
            className="filter-search-input filter-search-input-grow"
            placeholder={activeMode.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-bar-right">
          <button className="sub-tab" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh drop data"}
          </button>
        </div>
      </div>

      {error && <p className="hint">Couldn't search drop data: {error}</p>}

      {!query.trim() && !error && (
        <p className="hint">
          Real drop-table data from{" "}
          <a href="https://github.com/WFCD/warframe-drop-data" target="_blank" rel="noreferrer">
            WFCD's warframe-drop-data
          </a>{" "}
          - mission/relic/bounty/sortie/syndicate rewards and enemy drop tables. Search by item, place, or enemy
          above.
        </p>
      )}

      {loading && <p className="hint">Searching…</p>}

      {!loading && result && (
        <>
          <p className="hint">
            {result.total} result{result.total === 1 ? "" : "s"}
            {result.total > result.rows.length && ` (showing first ${result.rows.length})`}
          </p>
          <table className="drop-results-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Place</th>
                <th>Rarity</th>
                <th>Chance</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={`${row.item}|${row.place}|${i}`}>
                  <td>{row.item}</td>
                  <td>{row.place}</td>
                  <td style={{ color: dropRarityColor(row.rarity) }}>{row.rarity || "—"}</td>
                  <td>{formatDropChance(row.chance)}</td>
                  <td>{DROP_KIND_LABELS[row.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function PlaceholderView({ tab }: { tab: Tab }) {
  return (
    <div className="panel">
      <h2>{tab}</h2>
      <p className="hint">Not built yet - see ../../TODO.md.</p>
    </div>
  );
}

function SettingsView({
  uiScale,
  onChangeUiScale,
  uniformItemStyle,
  onChangeUniformItemStyle,
  hideVaultedLabels,
  onChangeHideVaultedLabels,
}: {
  uiScale: UiScalePercent;
  onChangeUiScale: (percent: UiScalePercent) => void;
  uniformItemStyle: boolean;
  onChangeUniformItemStyle: (enabled: boolean) => void;
  hideVaultedLabels: boolean;
  onChangeHideVaultedLabels: (enabled: boolean) => void;
}) {
  return (
    <div className="panel">
      <h2>Settings</h2>
      <div className="settings-row">
        <span>UI Size</span>
        <nav className="sub-tab-bar">
          {UI_SCALE_OPTIONS.map((p) => (
            <button
              key={p}
              className={`sub-tab ${p === uiScale ? "sub-tab-active" : ""}`}
              onClick={() => onChangeUiScale(p)}
            >
              {p}%
            </button>
          ))}
        </nav>
      </div>
      <p className="hint">Applies immediately and is remembered on this machine.</p>
      <div className="settings-row">
        <span>Item styling</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={uniformItemStyle}
            onChange={(e) => onChangeUniformItemStyle(e.target.checked)}
          />
          Use the same font/look for every item
        </label>
      </div>
      <p className="hint">
        Turns off the Prime/Coda/Prisma/Wraith/Vandal/Kuva Lich/Sisters of Parvos/Archwing/Helminth/Incarnon
        theming in Collection - every card uses the plain style instead. Applies immediately and is remembered
        on this machine.
      </p>
      <div className="settings-row">
        <span>Relics</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={hideVaultedLabels}
            onChange={(e) => onChangeHideVaultedLabels(e.target.checked)}
          />
          Hide "Vaulted" labels
        </label>
      </div>
      <p className="hint">
        Removes the "Vaulted" badge from relic cards on the Relics tab. Applies immediately and is remembered on
        this machine.
      </p>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [uiScale, setUiScale] = useState<UiScalePercent>(() => getStoredUiScale());
  const [uniformItemStyle, setUniformItemStyle] = useState<boolean>(() => getStoredUniformItemStyle());
  const [hideVaultedLabels, setHideVaultedLabels] = useState<boolean>(() => getStoredHideVaultedLabels());

  // `zoom` (not standard CSS, but universally supported in the Chromium/
  // WebView2 engine Tauri uses on Windows) scales layout, fonts AND
  // fixed-px sizes uniformly - simpler and more reliable here than
  // reworking every px value in App.css to a scale-aware unit.
  useEffect(() => {
    document.body.style.zoom = String(zoomFor(uiScale));
  }, [uiScale]);

  function handleChangeUiScale(percent: UiScalePercent) {
    setStoredUiScale(percent);
    setUiScale(percent);
  }

  function handleChangeUniformItemStyle(enabled: boolean) {
    setStoredUniformItemStyle(enabled);
    setUniformItemStyle(enabled);
  }

  function handleChangeHideVaultedLabels(enabled: boolean) {
    setStoredHideVaultedLabels(enabled);
    setHideVaultedLabels(enabled);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>StarChart</h1>
        <nav className="tab-bar">
          {TABS.map((t) => (
            <button key={t} className={`tab ${t === tab ? "tab-active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === "Dashboard" && <DashboardView />}
        {tab === "Collection" && (
          <CollectionView uniformItemStyle={uniformItemStyle} hideVaultedLabels={hideVaultedLabels} />
        )}
        {tab === "Drop Rates" && <DropRatesView />}
        {tab === "Settings" && (
          <SettingsView
            uiScale={uiScale}
            onChangeUiScale={handleChangeUiScale}
            uniformItemStyle={uniformItemStyle}
            onChangeUniformItemStyle={handleChangeUniformItemStyle}
            hideVaultedLabels={hideVaultedLabels}
            onChangeHideVaultedLabels={handleChangeHideVaultedLabels}
          />
        )}
        {tab !== "Dashboard" && tab !== "Collection" && tab !== "Drop Rates" && tab !== "Settings" && (
          <PlaceholderView tab={tab} />
        )}
      </main>
    </div>
  );
}
