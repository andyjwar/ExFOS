# FPL Draft League Data Ingestion

Fetch and store all data from your [Fantasy Premier League Draft](https://draft.premierleague.com) league for analysis, dashboards, or custom tools.

## Quick Start

### 1. Find your League ID

- Open your league in a browser: `https://draft.premierleague.com/league`
- Your league ID is in the URL: `draft.premierleague.com/league/**12345**`
- Or open DevTools → Network tab while loading the league page and look for requests to `.../league/XXXXX/details`

### 2. Install

```bash
cd TCLOT
pip install -r requirements.txt
```

### 3. Ingest data

```bash
python ingest.py 12345
```

Or use an environment variable:

```bash
export LEAGUE_ID=12345
python ingest.py
```

### 4. Export to CSV (optional)

```bash
python export_csv.py
```

Exports will be in the `exports/` folder.

## What gets fetched

| File | Description |
|------|-------------|
| `details.json` | League info, teams, standings, H2H matches |
| `element_status.json` | Which players are owned by which teams |
| `transactions.json` | Draft picks, waiver moves, trades |
| `bootstrap_draft.json` | Draft player pool and settings |
| `bootstrap_fpl.json` | Full FPL player/team data (names, stats) |
| `fixtures.json` | Premier League fixture list |

All data is saved under `data/`.

## Data structure

- **Standings**: Rank, total points, gameweek points
- **League entries**: Team names, manager names, waiver order
- **Element status**: Player ID → owner (entry_id)
- **Transactions**: Transfers, draft picks, trades with timestamps

Merge `element_status` with `bootstrap_fpl.elements` to get player names and stats. Use `league_entries` to map `entry_id` to team names.

## Example: Load in Python

```python
from pathlib import Path
import json

with open("data/details.json") as f:
    details = json.load(f)

standings = details["standings"]
teams = {e["id"]: e["entry_name"] for e in details["league_entries"]}

for s in standings:
    print(f"#{s['rank']} {teams[s['league_entry']]}: {s['total']} pts")
```

## Website

**Deploying to GitHub Pages (data + logos):** see **[DEPLOY.md](./DEPLOY.md)** and open **`/deploy-check.json`** on your live site to verify the build.

A simple web dashboard to view standings and form:

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:5173/TCLOT/** (or the path Vite prints).

### Local league data (recommended)

`data/` is gitignored, so without it the app may use **old committed** `web/public/league-data/` (wrong league).

1. Copy **`.fpl-league-id.example`** → **`.fpl-league-id`** in the repo root.
2. Put **only your league ID** (the number in `draft.premierleague.com/league/THIS`) on the first line.
3. Run **`cd web && npm run dev`** (or **`npm run build`**) — it will **download your league** into `data/` every time, then copy into `web/public/league-data/`.

Optional: **`SKIP_LEAGUE_FETCH=1`** skips the download (uses existing `data/` or committed files).

### Wrong teams / not your league?

**Fix:** add **`.fpl-league-id`** as above, or from the repo root:

```bash
python3 ingest.py YOUR_LEAGUE_ID
cd web && npm run dev
```

### Dashboard data (waivers, player names)

`copy-data` also builds **`fpl-mini.json`** from `bootstrap_fpl.json` (player + team names for **Most waivered**). Ensure **`transactions.json`** and **`bootstrap_fpl.json`** exist (full `ingest.py`). Then `cd web && npm run dev`.

**Waiver analytics:** **`build-waiver-gw-analytics.mjs`** runs on each dev/build, calls FPL **`/api/event/{GW}/live/`** for every finished GW, then writes **`waiver-out-gw-scores.json`** (drop-week pts) and **`waiver-in-tenure-top.json`** (top 10 waiver-ins by total pts for that team until dropped). Skip with **`SKIP_WAIVER_GW_SCORES=1`**.

### GitHub Pages — link the live site to your league

1. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: **`FPL_LEAGUE_ID`** — Value: your league ID (the number in `draft.premierleague.com/league/**THIS**`)
3. Push any change (or **Actions → Deploy site to Pages → Run workflow**)

Each deploy runs `ingest.py` with that ID, then builds the site with **real** standings, fixtures, and waivers — no need to commit JSON files. Re-push or **Run workflow** anytime you want a refresh.

If **`FPL_LEAGUE_ID`** is not set, the build uses committed `web/public/league-data/` or demo data.

### Team logos (replace letter bubbles)

Copy images into **`web/public/team-logos/`**. Name each file **`{id}.png`** where `id` is the FPL `league_entries[].id` (see `web/public/team-logos/README.md`), or add a **`manifest.json`** mapping ids to filenames. No upload step — files on disk are served by the dev server and included in `npm run build`.

Build for production: `npm run build` (output in `web/dist/`).

## Notes

- No login required: league data is publicly accessible if you have the league ID.
- The FPL Draft API is unofficial; structure may change between seasons.
