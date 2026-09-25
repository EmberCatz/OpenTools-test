# OpenTools (private test build)

A local companion app for OpenWF-based Warframe private servers — a
Dashboard, Collection tracker, Drop Rate database, and more, all reading
from your own account's data via a local backend. No cloud account, no
telemetry; everything runs on your machine.

**Status: early alpha.** Backend, frontend, and the live data-sync
pipeline are confirmed working end-to-end against a real account. See
[`patch-notes/unreleased.md`](patch-notes/unreleased.md) for the running
list of what's shipped and what's still flagged as unconfirmed — that's
the best place to know what to focus testing on.

This repo is shared for **testing purposes only**, not a release.

## What you need

- **[Node.js](https://nodejs.org/) 18+** (for the backend and frontend dev servers).
- **[Rust](https://www.rust-lang.org/tools/install)** + the
  [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for
  your OS (on Windows: the MSVC C++ build tools; WebView2 is usually
  already installed).
- An OpenWF-based Warframe private server setup (Bootstrapper + a
  SpaceNinjaServer-family backend) if you want to test against **live
  account data**. Without it, the app will run but the Dashboard will
  show "no recent push" and Collection/etc. will have nothing synced yet
  — still useful for checking the UI itself, layout, and that both
  processes start cleanly.

## Setup

### 1. Backend

```sh
cd server
npm install
npm start        # listens on http://127.0.0.1:7891
```

### 2. Frontend (desktop app)

In a second terminal:

```sh
cd app
npm install
npm run tauri dev
```

This opens the Tauri desktop window. First run will take a while (Rust
compiles the native shell).

Alternatively, on Windows, **`Launch OpenTools.bat`** in the repo root
starts both for you in one step.

### 3. (Optional) Live data sync

To see real account data instead of an empty state:

1. Copy [`pluto-script/OpenTools Sync.pluto`](pluto-script/OpenTools%20Sync.pluto)
   into your OpenWF install's `OpenWF/Scripts/` folder.
2. Start it from in-game (or add it to your Bootstrapper's
   `auto_start_scripts`, if you want it running every session).
3. It pushes an inventory snapshot to the local backend (port 7891)
   every 30 seconds while a character is logged in. The Dashboard should
   pick up the first push within half a minute.

The script only *reads* your account's inventory via SpaceNinjaServer's
own save-sync endpoint and posts it to your own local backend — nothing
leaves your machine.

## Tech stack

- `server/` — Node/Express/TypeScript, `better-sqlite3` (local SQLite,
  gitignored — your synced data never leaves your machine or gets
  committed).
- `app/` — Tauri v2 + React + TypeScript + Vite.

## Reporting issues

Note what you were doing, what you expected, and what happened instead
— screenshots help a lot for UI issues. Check
[`patch-notes/unreleased.md`](patch-notes/unreleased.md)'s "Known gaps"
section first; some things are already flagged as unconfirmed/in-progress.
