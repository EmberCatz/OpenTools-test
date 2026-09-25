import express from "express";
import { router } from "./routes.js";
import { getCacheRoot } from "./localIcons.js";

const PORT = Number(process.env.OPENTOOLS_PORT ?? 7891);

const app = express();
// Express's default 100kb limit is too small for a full inventory
// snapshot - QuestKeys entries alone carry their whole raw object
// (Progress[], CompletionDate, etc.), and a real account's
// equipment/item-count lists add up fast (a 413 was hit in testing
// 2026-09-21 with 139 equipment entries). inventory.php itself is
// ~300KB raw (reference_spaceninjaserver_inventoryphp memory); this is
// a filtered subset of that, but generous headroom costs nothing for a
// local, single-caller endpoint.
app.use(express.json({ limit: "5mb" }));

// Permissive local CORS - the Tauri frontend's webview origin isn't
// http://127.0.0.1:PORT, and this also needs to be curl/browser-testable
// directly during development (same reasoning as market-emulator's
// public /api/status).
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Serves whatever localIcons.ts has extracted so far - the directory
// may not exist yet if local extraction has never run/isn't configured,
// which express.static handles fine (just 404s until something's there).
app.use("/icon-cache", express.static(getCacheRoot()));

app.use(router);

app.listen(PORT, () => {
  console.log(`OpenTools server listening on http://127.0.0.1:${PORT}`);
});
