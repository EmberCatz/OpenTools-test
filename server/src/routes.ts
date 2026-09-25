import { Router } from "express";
import {
  applySnapshot,
  getCollection,
  getModsCollection,
  getArcanesCollection,
  getRelicsCollection,
  getDashboardSummary,
  logFailedSync,
  getDropSourcesForCollectionItem,
  type InventorySnapshot,
} from "./db.js";
import {
  getDropsForItem,
  getDropsStatus,
  refreshFromUpstream,
  searchDrops,
  type DropSearchMode,
} from "./dropData.js";

export const router = Router();

const startedAt = Date.now();
let lastPushAt: number | null = null;

// Public, frontend-facing.
router.get("/api/status", (_req, res) => {
  res.json({
    schemaVersion: 1,
    uptimeMs: Date.now() - startedAt,
    sync: {
      connected: lastPushAt !== null && Date.now() - lastPushAt < 90_000, // 3x the script's 30s poll interval
      lastPushAt,
    },
  });
});

router.get("/api/dashboard", (_req, res) => {
  res.json(getDashboardSummary());
});

router.get("/api/collection", (_req, res) => {
  res.json(getCollection());
});

router.get("/api/collection/mods", (_req, res) => {
  res.json(getModsCollection());
});

router.get("/api/collection/arcanes", (_req, res) => {
  res.json(getArcanesCollection());
});

router.get("/api/collection/relics", (_req, res) => {
  res.json(getRelicsCollection());
});

// "Where do I get this" for a plain Collection card (2026-09-25) - see
// db.ts's getDropSourcesForCollectionItem comment for why this is a
// separate, precise, manufacturing-requirements-driven lookup rather
// than reusing the fuzzy /api/drops/search above. Query param (not a
// :itemType path segment) since real itemType values contain "/"
// characters.
router.get("/api/collection/drop-sources", (req, res) => {
  const itemType = typeof req.query.itemType === "string" ? req.query.itemType : "";
  res.json({ rows: getDropSourcesForCollectionItem(itemType) });
});

// Drop-rate data (dropData.ts) - a standalone module, not owned by any
// one tab, so these routes are the generic surface other tabs reuse
// rather than each growing its own drop-table query.
const DROP_SEARCH_MODES: DropSearchMode[] = ["item", "place", "enemy"];

router.get("/api/drops/status", (_req, res) => {
  res.json(getDropsStatus());
});

router.get("/api/drops/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const modeParam = typeof req.query.mode === "string" ? req.query.mode : "item";
  const mode = DROP_SEARCH_MODES.includes(modeParam as DropSearchMode) ? (modeParam as DropSearchMode) : "item";
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 300;
  res.json(searchDrops(q, mode, limit));
});

// Exact-name lookup - the hook a future tab (Collection "where do I get
// this", a Relics tab's reward table) calls instead of the fuzzy search
// above. Express decodes the :name param itself.
router.get("/api/drops/item/:name", (req, res) => {
  res.json({ rows: getDropsForItem(req.params.name) });
});

router.post("/api/drops/refresh", async (_req, res) => {
  const result = await refreshFromUpstream();
  res.json({ ...result, status: getDropsStatus() });
});

// Script-facing only. Full-state replace per push - see db.ts's
// applySnapshot comment. Minimal shape validation: a malformed push
// should fail loudly (logged to sync_log) rather than silently write
// partial/garbage state.
//
// unlocks/subsumedSuits are deliberately NOT required to be a strict JS
// array here (found 2026-09-21): Pluto's json.encode has the same
// ambiguity every Lua JSON encoder has - an EMPTY Lua table has no way
// to know if it should serialize as `[]` or `{}`. OpenTools Sync.pluto
// sends `inv.NodeIntrosCompleted or {}` (and, since 2026-09-21,
// `extractSubsumedSuits()`'s empty-table result for an account with no
// Helminth-subsumed suits) - either can legitimately arrive as a JSON
// object instead of an array. A strict Array.isArray() check here
// rejected an otherwise-valid push with a blanket "malformed" error -
// not a data integrity problem worth failing loudly over, so both are
// normalized to [] instead.
router.post("/internal/inventory-snapshot", (req, res) => {
  const body = req.body as Partial<InventorySnapshot> | undefined;

  if (
    !body ||
    typeof body.currencies !== "object" ||
    typeof body.itemCounts !== "object" ||
    typeof body.rankedUpgrades !== "object" ||
    (body.unlocks !== undefined && typeof body.unlocks !== "object") ||
    typeof body.questKeys !== "object" ||
    typeof body.equipment !== "object" ||
    (body.subsumedSuits !== undefined && typeof body.subsumedSuits !== "object") ||
    (body.masteryXp !== undefined && typeof body.masteryXp !== "object")
  ) {
    logFailedSync("rejected: malformed snapshot payload");
    res.status(400).json({ error: "malformed snapshot payload" });
    return;
  }

  const normalized: InventorySnapshot = {
    ...(body as InventorySnapshot),
    unlocks: Array.isArray(body.unlocks) ? body.unlocks : [],
    subsumedSuits: Array.isArray(body.subsumedSuits) ? body.subsumedSuits : [],
    masteryXp: body.masteryXp ?? {},
  };

  try {
    applySnapshot(normalized);
    lastPushAt = Date.now();
    res.status(200).json({ ok: true });
  } catch (err) {
    const note = `write failed: ${err instanceof Error ? err.message : String(err)}`;
    logFailedSync(note);
    res.status(500).json({ error: note });
  }
});
