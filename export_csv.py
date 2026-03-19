#!/usr/bin/env python3
"""
Export ingested FPL Draft data to CSV for easy analysis in Excel/Sheets.
Run ingest.py first.
"""

import csv
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(__file__).parent / "exports"


def flatten_dict(d: dict, parent_key: str = "") -> dict:
    """Flatten nested dict for CSV export."""
    items = []
    for k, v in d.items():
        key = f"{parent_key}_{k}" if parent_key else k
        if isinstance(v, dict) and not any(isinstance(x, (dict, list)) for x in v.values()):
            items.extend(flatten_dict(v, key).items())
        elif isinstance(v, list) and v and not isinstance(v[0], (dict, list)):
            items.append((key, ";".join(str(x) for x in v)))
        else:
            items.append((key, v))
    return dict(items)


def export_standings():
    """Export standings to CSV."""
    with open(DATA_DIR / "details.json") as f:
        data = json.load(f)
    standings = data.get("standings", [])
    if not standings:
        return
    rows = []
    entries = {e["id"]: e for e in data.get("league_entries", [])}
    for s in standings:
        row = dict(s)
        entry = entries.get(s["league_entry"], {})
        row["team_name"] = entry.get("entry_name", "")
        row["manager"] = f"{entry.get('player_first_name', '')} {entry.get('player_last_name', '')}".strip()
        rows.append(row)
    path = OUTPUT_DIR / "standings.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["rank", "team_name", "manager", "total", "event_total", "rank_sort", "league_entry", "last_rank"]
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"Exported standings to {path}")


def export_league_entries():
    """Export league entries (teams) to CSV."""
    with open(DATA_DIR / "details.json") as f:
        data = json.load(f)
    entries = data.get("league_entries", [])
    if not entries:
        return
    path = OUTPUT_DIR / "teams.csv"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["id", "entry_id", "entry_name", "player_first_name", "player_last_name", "short_name", "waiver_pick"],
            extrasaction="ignore",
        )
        w.writeheader()
        w.writerows(entries)
    print(f"Exported teams to {path}")


def export_player_ownership():
    """Export player ownership (who owns which players)."""
    with open(DATA_DIR / "element_status.json") as f:
        data = json.load(f)
    status = data.get("element_status", [])

    # Load player names from draft bootstrap (same element ids as element_status)
    players = {}
    for name in ("bootstrap_draft.json", "bootstrap_fpl.json"):
        bootstrap_path = DATA_DIR / name
        if bootstrap_path.exists():
            with open(bootstrap_path) as f:
                boot = json.load(f)
            players = {str(p["id"]): p for p in boot.get("elements", [])}
            break

    # Load team names
    teams = {}
    with open(DATA_DIR / "details.json") as f:
        details = json.load(f)
    for e in details.get("league_entries", []):
        teams[str(e["entry_id"])] = e.get("entry_name", "")

    rows = []
    for s in status:
        if s.get("owner"):
            p = players.get(str(s["element"]), {})
            rows.append({
                "element_id": s["element"],
                "player_name": p.get("web_name", ""),
                "team": p.get("team", ""),
                "position": p.get("element_type", ""),
                "owner_entry_id": s["owner"],
                "owner_team": teams.get(str(s["owner"]), ""),
                "status": s.get("status", ""),
            })

    if not rows:
        return
    path = OUTPUT_DIR / "player_ownership.csv"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["element_id", "player_name", "team", "position", "owner_entry_id", "owner_team", "status"])
        w.writeheader()
        w.writerows(rows)
    print(f"Exported player ownership to {path}")


def main():
    if not (DATA_DIR / "details.json").exists():
        print("Run ingest.py first to fetch league data.")
        return

    export_standings()
    export_league_entries()
    export_player_ownership()
    print("\nExport complete. Check the exports/ folder.")


if __name__ == "__main__":
    main()
