# Unreleased

User-facing changelog for work not yet shipped/confirmed in-game. Updated
in the same pass as any feature implementation — see `../CLAUDE.md`.

## Added

- **Project scaffolding**: backend (`server/`, Express + SQLite, port
  7891) and frontend shell (`app/`, Tauri v2 + React) are up and talking
  to each other.
- **`OpenTools Sync.pluto`** (dev copy in `../My Scripts/`, deployed to
  the live game install): pushes currencies, mod/arcane/relic/prime-part
  counts, ranked mod/arcane instances, unlock flags, owned warframes/
  weapons/sentinels, and quest state to the local backend every 30s.
- **Dashboard tab**: currencies, sync status, tracked-item totals.
- **Collection tab**: full grid of every catalog item (881 total),
  grouped by category (Warframes/Primary/Secondary/Melee/Sentinels).
  Owned items show a real icon, real name, and rank (e.g. "22/30", not
  raw XP); unowned items show grayed out with a toggle to hide them
  entirely.
- **Collection sub-tabs**: All / Warframes / Weapons / Companions / Mods,
  with Weapons splitting further into Primary / Sidearms / Melee.
  **Mods** is a brand-new view (1601 catalog entries from Public Export)
  showing real name/icon/rank per mod, combining rank-0 stacks and
  individually-ranked copies into one owned count + highest rank per
  mod. **Companions** now also tracks companion weapons — **NOT yet
  confirmed against a real in-game sync** (see Known gaps below).
- **Owned items show Forma count, Orokin Catalyst/Reactor, and Exilus
  adapter status**: a badge row under the rank — Catalyst/Reactor and
  Exilus icons on the left (grayed out when not installed), rank in the
  center, real Forma count + icon on the right. Real Warframe icons
  throughout (`cdn.warframestat.us`). **All three CONFIRMED WORKING
  against a real in-game sync (2026-09-21)**.
- **Settings → UI Size**: 75/100/125/150/175/200%, applies immediately
  and is remembered on this machine. Default is 100% — noticeably
  bigger than the app's previous fixed size, which is now the 75% option.
- **Settings → Item styling toggle**: "Use the same font/look for every
  item" turns off all ten item themes below (the eight weapon/Warframe
  ones plus Helminth/Incarnon) at once, for anyone who'd rather every
  Collection card looked and read the same. Applies immediately and is
  remembered on this machine.
- **Helminth-subsumed and Incarnon Genesis duplicate tiles**: every
  non-Prime Warframe gets a second tile, its name in a Creepster
  horror-style font, with a small Helminth badge overlaid on the icon
  (50% opacity until subsumed, fully opaque once it has) and a
  Bruised Purple/Deep Maroon → Fleshy Pink/Calcified Tan gradient border
  — dim until subsumed, bright once it has, with a subtle red glow on
  hover. Every Incarnon-eligible weapon (~45) gets a second tile, its
  name in a Cinzel font, with a Void Cyan/Eerie Teal → Liquid Silver/
  White Ceramic gradient border and a subtle light-blue/white glow on
  hover, using its real Incarnon Genesis art and a small "INCARNON" tag
  under the name — dim until adapted. Neither tile affects any
  owned/total count shown elsewhere in Collection.
  **NOT yet confirmed against a real in-game subsume/adapt** (see Known
  gaps below).
- **Kuva Lich and Sisters of Parvos weapon theming**: all 21 real Kuva
  Lich weapons and all 16 real Sisters of Parvos ("Tenet") weapons get a
  themed gradient border on their own card (not a duplicate, since these
  are already distinct real items) — Kuva Lich: charcoal/slate/army
  green/crimson/copper gradient, Staatliches font, red-orange hover glow;
  Sisters of Parvos: black/navy/white/rose gold/champagne gold gradient,
  Michroma font (sized down to match the other names), cyan/blue hover
  glow. Dim (low-alpha border) until owned, full color once owned, same
  convention as the Helminth/Incarnon tiles above; the duplicate tiles
  themselves now also correctly disappear when "show unowned items" is
  off, unless already subsumed/adapted. Real weapons already tracked
  normally otherwise - this is purely cosmetic, no new data fields.
- **Prime, Coda, Prisma, Wraith, and Vandal item theming**: every real
  Prime item (Warframes AND weapons AND Archwing gear) gets a porcelain
  white/obsidian black/Orokin gold gradient border in a Cinzel Decorative
  font; every real Coda weapon (13) gets a neon pink/magenta/moldy purple
  gradient in a Rubik Glitch font; every real Prisma item (14) gets an
  indigo/violet/aquamarine/silver gradient in an Exo 2 font; every real
  Wraith (11) and Vandal (12) weapon gets a themed 2-color gradient in a
  Russo One / Share Tech font respectively. All dim (low-alpha border)
  until owned, full color once owned — recolors each item's own real
  card, same as the Kuva/Sisters theming below, not a duplicate tile.
- **Archwing and K-Drive tracking (new)**: Archwing frames, Arch-Guns,
  and Arch-Melee (bundled into one new "Archwing" sub-tab) get their own
  deep-space navy/steel/silver-blue theme in an Orbitron font — unless
  they're ALSO Prime/Vandal/Prisma/Kuva (e.g. Odonata Prime, Imperator
  Vandal, Prisma Dual Decurions, Kuva Grattler/Ayanga), in which case that
  theme wins instead. K-Drive parts get their own new "K-Drive" sub-tab,
  styled with the plain Normal theme. **NOT yet confirmed against a real
  in-game sync** (see Known gaps below).
- **Normal (untitled) items now have a themed look too**: a solid blue
  border (no gradient) plus a light-blue glow on hover, replacing the
  previous plain gray border, for anything not covered by one of the
  named themes above.
- **Helminth tile repositioned**: now sits immediately after its Prime
  counterpart's card (e.g. Excalibur, Excalibur Prime, Excalibur-
  Helminth) instead of immediately after the base Warframe. Frames with
  no Prime counterpart (e.g. Excalibur Umbra) are unaffected.
- **`Launch OpenTools.bat`** + a Desktop shortcut — starts the backend
  and app together with one double-click.
- **Optional local icon extraction** (`OPENTOOLS_WARFRAME_CACHE_DIR` env
  var) — fully offline, exact-client-version icons via
  `other_software/warframe_exporter/`, extracted on-demand in the
  background the first time each category is needed. Covers more items
  than the network source alone (711/881 vs. 749/881 in testing).
- **Mods tab: rank shown as a small dot row above the name** instead of
  plain "3/5" text — filled dots up to the mod's current rank, empty for
  the rest, shown only for owned, rankable mods. Everything else about
  the card (icon, name, owned-count badge) is unchanged.
- **Mods tab: hover a mod to see its full-quality card art** — a real,
  much higher-resolution wiki image (not the small grid icon, not an
  upscale of it), appearing next to the cursor with a quick fade-in, same
  size every time regardless of that mod's own image dimensions. No
  dimming of the rest of the app while it's open. Covers 1597 of 1601
  mods; the handful without a dedicated high-res source just show the
  regular icon instead.
- **New Arcanes tab** (Collection, after Mods, set apart by a "|"
  divider since it's a different data source/grid shape from the
  equipment tabs to its left): every real Arcane (177, from Public
  Export's `ExportArcanes.json`) with its real name/icon, rarity, rank
  dots, and owned count — same visual language as the Mods tab (they
  share the same underlying SNS mechanism). Max rank is read per-arcane
  (5 for the standard tier, 3 for a handful of older Warframe-slot
  arcanes) rather than assumed a blanket 5. **CONFIRMED WORKING** against
  real synced account data (Arcane Energize ×2, Arcane Grace ×3, both
  rank 0) in the running desktop app.
- **Arcanes tab: Category filter**, same dropdown UX as the Mods tab —
  Warframe/Primary/Secondary/Melee/Shotgun/Bow/Operator/Amp/Zaw/Kitgun,
  from WFCD's real per-arcane equipment-slot data (no local Public
  Export equivalent exists for this). Also shown as a plain label under
  each card's name. **CONFIRMED WORKING** — filtering to "Warframe"
  shows exactly 68 cards, the real WFCD count for that slot.
- **New Relics tab** (Collection, after Arcanes): every real relic (772,
  from Public Export's `ExportRelics.json`) with its real icon, vaulted
  badge, and owned count per refinement tier (Intact/Exceptional/
  Flawless/Radiant — a relic tracks 4 independent counts, matching how
  the real Foundry screen shows it). Click a relic to open a popup
  showing its real reward contents — item names, rarities, and drop
  chances — for whichever refinement tab you select, with real per-tier
  odds (a Radiant relic's rare-item chance is meaningfully higher than
  Intact's, not the same table repeated). Filterable by Era.
  **CONFIRMED WORKING** against real synced account data (86 owned
  relics out of 772, matching the account's real data exactly) in the
  running desktop app.
- **New reusable popup-window component**: a proper floating window
  (title bar, close button, dimmed backdrop) for any feature that needs
  a click-triggered overlay — closes on the × button, clicking outside
  the window, or pressing Escape. The Relics tab's reward-contents view
  (above) is its first user, replacing an earlier inline-expand-in-grid
  version from the same day.
- **Settings → Relics → "Hide Vaulted labels"**: removes the "Vaulted"
  badge from relic cards for anyone who'd rather not see it. Applies
  immediately, remembered on this machine.
- **Collection tab: new filter bar** above the "Show unowned items" row —
  a name search box on the left that works on every sub-tab, plus a
  right-hand side for filters specific to whichever sub-tab is active.
  **Mods** is the first to get one, with two dropdowns: **Category**
  (Warframe, Primary, Secondary, Melee, Stance, Aura, Archwing, Archwing
  Gun, Archwing Melee, Sentinel, Kavat, Kubrow, Helminth Charger,
  Parazon, Other — this app's own coarse grouping) and **Subcategories**
  (the real wiki.warframe.com/w/Category:Mods subcategory list — Bow
  Mods, Amalgam Mods, Set Mods, and 79 others — each backed by its real
  member list pulled from the wiki itself). The two filter independently
  and combine with the name search.

**CONFIRMED WORKING end-to-end (2026-09-21)**: real account data (139
equipment entries, 5 currencies, 69 unlocks) synced from the live game
through the backend and rendered correctly in the actual desktop app —
not just curl/Playwright verification.

- **Collection grid now lazy-loads** as you scroll (icon element +
  pulsing skeleton until a card is within ~600px of the viewport, either
  scroll direction) instead of rendering everything at once - matters at
  this app's real scale (2000+ cards on "All", 1601 on Mods).
- **Mastered/unmastered badge** in the top-right corner of every
  Warframe and weapon card - the real in-game "Mastered" icon
  (`IconMastered(xWhite).png`, sourced from wiki.warframe.com), shown
  in white with no circle backdrop, once that item has EVER hit max rank
  (persists across a later Forma reset, unlike its current rank), from a
  new real data source (SNS's `XPInfo` field). "Not yet mastered" shows
  the same icon at 50% opacity instead of a separate dash/circle. Needs a
  fresh in-game sync to populate — see Known gaps below.

- **Collection cards are now a uniform size, with rank centered under
  the name.** Every card's name and rank/badge-row area is fixed to the
  same size regardless of name length (1 vs. 2 lines) or owned/unowned
  state (rank row reserves its space even when empty) — no more per-card
  height drift. The rank text ("30/30") is also now always horizontally
  centered directly under the name, regardless of whether a Forma badge
  is showing on the row's right side (it used to drift left/right
  depending on that). There's now real visible space between the rank
  text and the Catalyst/Reactor/Exilus icons next to it (they were
  nearly touching) - the status icons (Catalyst/Reactor/Exilus/Forma)
  are also very slightly smaller (16px → 14px) to make room for that gap
  within the card's existing width. Scoped to the plain Collection cards
  (Warframes/Weapons/Companions/Archwing/K-Drive); the Mods tab's
  dot-row cards are unaffected.
- **New Drop Rates tab**: search real drop-table data by item, place, or
  enemy - e.g. search "Serration" to see every mission/enemy/quest source
  it drops from, or "Draco" to see everything that node's rotations pay
  out. Real data from [WFCD's warframe-drop-data](https://github.com/WFCD/warframe-drop-data)
  feed (the same community project family the icon sources come from),
  with a "Refresh drop data" button to re-pull it on demand. Relic reward
  rarity is corrected to the real value where DE's own table mislabels it,
  and blueprint drop chances (e.g. Boar Blueprint from Drekar Trooper)
  are corrected to the real per-kill percentage rather than upstream's
  raw "share of that enemy's blueprint pool" value, which read as a wildly
  inflated chance (caught same-day via the user's own known-good value -
  see DEVLOG.md's "blueprint drop chances way too high" entry). Built as
  a standalone data module so other tabs (a future Relics tab,
  a "where do I get this" link on a Collection card) can reuse the same
  lookup without any UI dependency - **CONFIRMED WORKING end-to-end
  (2026-09-24)** against the real upstream feed and in the running app
  (see DEVLOG.md). **User-confirmed status: early alpha, stable.**
  Layout tweak (2026-09-24): the Item/Place/Enemy mode buttons moved onto
  the same row as the search bar, to its left, and the search bar now
  stretches to meet the "Refresh drop data" button - UI-verified in the
  running app.
- **Forma icon swapped to a clearer real asset** (wiki.warframe.com's
  Forma.png instead of WFCD's GenericComponent.png — both real, this one
  just reads better at small icon size), shown as-is with no filter or
  recolor applied.
- **Manufacturing Requirements row**: every Collection item with a real
  Foundry blueprint now shows a small row of icons under its rank — one
  per requirement, e.g. Excalibur shows Blueprint, Chassis, Neuroptics,
  Systems. Each icon's outline color shows its state: red = not owned,
  white = blueprint owned but not yet built, green = actually built (or,
  for the item's own Blueprint slot, the whole item is owned). Real
  requirement graph from Public Export, real labels/icons from WFCD —
  see `../DEVLOG.md`'s 2026-09-24 entries. Items with no real Recipe at
  all (a handful of relic-only Prime variants missing from this dump,
  quest rewards, market-only cosmetics) correctly show no row rather
  than a guessed one. **CONFIRMED WORKING** against real synced account
  data in the running desktop app (see DEVLOG.md).
- **Mastery Rank requirement badge**: every Collection item that needs a
  Mastery Rank to USE (weapons, companion weapons) now shows the real
  in-game per-rank icon + number in its top-left corner, e.g. Acceltra
  shows "8". Warframes and Sentinels/companion pets correctly show no
  badge — neither has a real Mastery Rank requirement to use once owned.
  MR0 weapons (starter gear like Boar/Boltor) also correctly show
  nothing, matching the real Arsenal. Real data from Public Export's
  `masteryReq` field; icon is DE's own real per-rank glyph from the
  wiki's Text Icons page (normally used for a player's OWN rank inline in
  text, reused here for an item's rank requirement instead) — see
  `../DEVLOG.md`'s 2026-09-25 entry for why no dedicated "requirement"
  icon exists and what was checked before landing on this one.
  **CONFIRMED WORKING** against the real running app (see DEVLOG.md).
- **Relic reward popup: real icons.** The relic's own icon now shows next
  to its title (e.g. "Lith A5"), and every reward row in the table now
  shows a real icon next to the item name (Prime parts, blueprints,
  Forma, mods — 99.7% of all reward rows resolve a real icon). See
  `../DEVLOG.md`'s 2026-09-25 entry for the two-step Components.json/
  recipe-resultType lookup this needed. **CONFIRMED WORKING** against the
  real running app (see DEVLOG.md).
- **Blueprint reward rows now show the full item's picture.** A
  Chassis/Systems/Neuroptics/main Blueprint reward (e.g. "Trinity Prime
  Systems Blueprint", "Nikana Prime Blueprint") now shows the complete
  Warframe/weapon's own real art instead of a generic gear/blueprint
  icon — e.g. "Atlas Prime Neuroptics Blueprint" shows Atlas Prime's own
  portrait. "Forma Blueprint" shows the real Forma icon. Prime parts
  (Barrel, Stock, Head, Handle, ...) are unaffected — they already had
  their own distinct real icon. See `../DEVLOG.md`'s 2026-09-25 "part 2"
  entry for how the Blueprint → full-item mapping is derived (from the
  same requirement graph the Manufacturing Requirements row already
  computes, not a name guess). **CONFIRMED WORKING** against the real
  running app (see DEVLOG.md).
- **"Where do I get this" panel on relic rewards.** Hover any reward row
  in the relic popup (e.g. "Atlas Prime Neuroptics Blueprint") to see
  every real place that item drops from — every relic that carries it,
  with rarity/chance/source, not just the one relic already open. The
  panel floats to the left of the relic popup with no extra dimming, and
  never grows taller than the relic popup itself — a real item with a
  lot of sources (e.g. "Forma Blueprint", which drops from missions, not
  just relics) scrolls internally instead, and the cursor can now move
  onto the panel to scroll it — without also scrolling the Collection
  grid behind it once the panel's own content runs out. Reused an
  existing-but-unwired backend endpoint (`getDropsForItem`). See
  `../DEVLOG.md`'s 2026-09-25 entries. **CONFIRMED WORKING** against the
  real running app — verified the exact 5 real sources for Atlas Prime
  Neuroptics Blueprint, that Forma Blueprint's panel caps to the popup's
  height with a working internal scroll, and that scrolling the panel
  all the way to its own bottom never moves the background page (see
  DEVLOG.md).
- **"Where do I get this" popup on plain Collection cards.** Click a
  Warframe/weapon/companion/Archwing/K-Drive card's own icon (not just a
  relic reward) to see every real source for its Blueprint/component/
  part rewards, e.g. clicking Acceltra Prime shows every relic that
  drops its Barrel, Blueprint, Receiver, and Stock. Built on a new,
  precise, exact-match lookup (not a fuzzy text search, which would pull
  in wrong Warframes/unrelated mods) — see `../DEVLOG.md`'s 2026-09-25
  entry for how it derives the real reward names from this item's own
  Manufacturing Requirements. **CONFIRMED WORKING** against the real
  running app, including the correct "No known drop sources" message for
  a quest-only item (Excalibur Umbra) (see DEVLOG.md).
- **Background no longer scrolls behind any open popup.** Opening the
  relic popup, the reward hover panel, or the new Collection-card "where
  do I get this" popup now blocks the page/Collection-grid underneath
  from scrolling at all (previously only the hover panel's own
  scroll-chaining was blocked). See `../DEVLOG.md`'s 2026-09-25 entry.
  **CONFIRMED WORKING** — verified against both a single popup and the
  nested relic-popup-plus-hover-panel case (see DEVLOG.md).
- **Zaw parts and Kitgun parts now each have their own Weapons sub-tab.**
  Collection → Weapons gets two new filters, "Zaw Parts" and "Kitgun
  Parts" (alongside Primary/Sidearms/Melee), each its own section,
  instead of silently lumping all 81 raw Zaw/Kitgun components into
  Sidearms — including the Zaw pieces, which are melee components and
  had no business being there at all. Root cause was a Digital Extremes
  data quirk: these items all carry `productCategory: "Pistols"` in the
  game's own export data, same family of quirk as the K-Drive-parts
  split done 2026-09-21. See `../DEVLOG.md`'s 2026-09-25 entries.
  **CONFIRMED WORKING** against the running app — 45 Zaw parts and 36
  Kitgun parts appear with real resolved icons in their own sections,
  and the Sidearms tab no longer contains any of them.

## Fixed

- **A "where do I get this" popup with many results could render with
  its title bar off the top of the screen.** `.popup-window`'s height
  cap didn't account for the app's own UI Size zoom setting for very
  tall content (e.g. Acceltra Prime's popup, ~24 rows). Fixed for this
  popup by giving its table its own fixed-height scroll area instead —
  see `../DEVLOG.md`'s 2026-09-25 entry.
- **Weapons/Warframes showing under rank 30 despite being maxed
  in-game.** The rank formula was using the wrong XP threshold for
  weapons (900,000, same as Warframes) — the real threshold, read
  directly from SpaceNinjaServer's own inventory display logic, is
  450,000 for weapons (half of the Warframe/Sentinel value). Verified
  against all 139 real owned items: 112 previously-wrong items now
  correctly show max rank, zero regressions.
- **K-Drive parts were showing up under Weapons → Sidearms.** All 20
  K-Drive part components carry a `"Pistols"` category tag in the
  underlying game data (a real quirk, not a bug in this app's reading of
  it) — now correctly excluded from Sidearms and shown in their own new
  K-Drive sub-tab instead.
- **Manufacturing Requirements row showed owned weapon parts
  (Barrel/Receiver/Stock/...) as missing.** The backend only checked the
  synced `Recipes` bucket for ownership, but real SpaceNinjaServer data
  reports weapon-part relic drops under `MiscItems` instead — confirmed
  against real synced data (e.g. Epitaph Prime's Barrel/Receiver both
  came back tagged `MiscItems`), consistent across every weapon-part
  entry in the DB, Prime and non-Prime alike. Only the standalone
  `...Blueprint` items are actually in `Recipes`. Now checks both
  buckets — see `../DEVLOG.md`'s 2026-09-24 entry.
- **Manufacturing row outline colors were washed out on unowned "Normal"
  theme cards** (any item not covered by one of the named Prime/Coda/
  Kuva/etc. themes). Those cards dimmed the WHOLE card element via
  `opacity`+`filter: grayscale` (unlike every other theme, which already
  scoped that dimming to just the icon/name) — which dragged the
  red/white/green manufacturing outlines down into gray along with it.
  Now scoped the same way the other themes already are.
- **Unowned "Normal" theme cards kept a full-brightness blue border.**
  A side effect of the fix directly above: scoping the dim treatment to
  just the icon/name meant the border-color rule needed for the
  "Normal" theme's own dim state was never added, so its solid blue
  border no longer dimmed at all once the whole-card grayscale was
  removed. Now dims to 35% alpha, matching every other theme's border
  treatment — see `../DEVLOG.md`'s 2026-09-25 entry.
- **Page scroll could get permanently stuck disabled.** The "block
  background scroll behind any popup" lock (see Added, above) assumed at
  most one lock would ever be active at a time per popup, but gliding the
  mouse between two reward rows in a relic popup within their 150ms
  hover grace period activates two locks at once — releasing them could
  leave `document.body`'s scroll wrongly stuck disabled even after
  everything closed. Replaced with a proper reference-counted lock. See
  `../DEVLOG.md`'s 2026-09-25 entry for the full race-condition writeup.
  **CONFIRMED WORKING** via a live reproduction of the exact race.
- **`OpenTools Sync.pluto` no longer syncs during active missions.** The
  ~300KB inventory fetch/decode/POST (every 30s) was firing
  unconditionally, including mid-mission — a real stutter risk since
  `http.request()` is blocking and the fetch has a confirmed ~27% flake
  rate (multi-second retries on failure), for data that has no reason to
  be fresh while you're still inside the mission anyway. Now pauses while
  `gGameRules instanceof LotusGameRules` (an actual mission, not just any
  non-null value) and resumes once you're back in a non-mission region.
  **First version of this fix (same day) was wrong** — checked
  `IsNull(gGameRules)`, which read "in mission" even while standing in
  the orbiter and consequently never detected a mission ending either
  (sync stopped entirely, not just in edge cases); fixed same-day after
  the user caught it live. **CONFIRMED WORKING** via a deliberate
  in-game coverage pass (real `script_log` output): mission entry/exit,
  re-entering a second mission, dojo, relay, and the Cetus hub all
  correctly read as "not a mission" (sync continues), and accepting a
  bounty in Cetus correctly flips to "active mission detected." See
  `../DEVLOG.md`'s 2026-09-25 entries for the full story.
- **`OpenTools Sync.pluto` no longer logs every single failed sync
  attempt.** With a confirmed ~27% flake rate on the underlying fetch, a
  normal blip could already print several "failed, retrying" lines in a
  row — pure noise. Now stays silent through ordinary retries and only
  logs once a failure streak has lasted an unreasonably long time (60s),
  plus a "recovered" line once it actually succeeds again. See
  `../DEVLOG.md`'s 2026-09-25 entry.

## Known gaps

- **Mastered/unmastered badges are UNCONFIRMED against a real sync.**
  The underlying field (`XPInfo`) was just added to the sync script this
  pass - no live account has ever pushed it yet, so every badge will
  read "not yet mastered data" (i.e. not render at all) until the next
  real in-game sync. If badges still look wrong after that sync, checking
  whether `XPInfo` actually appears in a real `inventory.php` response
  is the first thing to do.
- **Helminth duplicate tile still shows the generic Helminth badge, not
  the actual subsumed ability's icon.** Needs this app's sync script to
  start pulling each Warframe's `Configs[]`/ability-override data first
  (not currently synced at all) - left out rather than guessed at.
- **Companion weapon ownership is UNCONFIRMED.** Added based on a strong
  lead from a third-party live-Warframe app's source, not a live read of
  this project's own account data — if Companion Weapons stays empty
  despite owning some, that's expected until the next real in-game sync
  confirms or disproves the field name (see `../DEVLOG.md`'s 2026-09-21
  "built on the WFHelper leads" entry).
- "Ever hit max rank" (mastery) status is NOT shown yet — see
  `../DEVLOG.md`'s 2026-09-21 entries for a promising but unbuilt lead.
- **Helminth/Incarnon tiles are UNCONFIRMED against a real sync.** The
  Helminth field name is source-confirmed the same way Forma/Catalyst/
  Reactor/Exilus were before those got checked in-game — if a
  known-subsumed Warframe or known-adapted weapon doesn't show correctly
  after syncing, that's the first thing to report.
- Skins/cosmetics and mod loadouts (`Configs[]`) aren't parsed yet.
- Some catalog items may show no icon (WFCD's data doesn't cover
  everything Public Export does) — shows a placeholder letter instead of
  a broken image. K-Drive parts specifically have NO icon source at all
  right now (not in WFCD's dataset, and no single local-extraction folder
  covers them) — always show a placeholder until that's resolved.
- **Archwing/K-Drive ownership is UNCONFIRMED**, same situation
  Companion Weapons started in — the category names are confirmed real
  SpaceNinjaServer inventory keys (source-read, not guessed), but no live
  sync has ever requested them before. If any of the four stays empty
  despite the player owning that gear, that's the first thing to check.
- Wiki integration (acquisition routes, metadata) — explicitly "way
  later" per the user, not started.
- **The mission-pause gate in `OpenTools Sync.pluto`** — confirmed
  working across orbiter/dojo/relay/Cetus-hub ↔ mission transitions (see
  Fixed, above). Not tested against Railjack, Duviri, or actually being
  out in an open-world zone itself (Plains/Vallis/Cambion, as opposed to
  its hub town) — plausible extensions of the same confirmed mechanism,
  but not independently observed.
