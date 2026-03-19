#!/usr/bin/env python3
"""
FPL Draft League Data Ingestion

Fetches all available data from draft.premierleague.com for your league and
saves it locally for analysis. No authentication required for public league data.
"""

import json
import os
import sys
from pathlib import Path

import requests

# API base URLs (player/element IDs: always use DRAFT_API — classic uses a different id→player map)
DRAFT_API = "https://draft.premierleague.com/api"
# Classic fixtures only (schedule / team pairing — not used for element lookups)
FPL_FIXTURES_API = "https://fantasy.premierleague.com/api"


def get_league_id() -> int:
    """Get league ID from environment or command-line argument."""
    league_id = os.environ.get("LEAGUE_ID")
    if league_id:
        return int(league_id)
    if len(sys.argv) > 1:
        return int(sys.argv[1])
    print(
        "Usage: python ingest.py <LEAGUE_ID>\n"
        "   or: LEAGUE_ID=12345 python ingest.py\n\n"
        "Find your league ID in the URL when viewing your league:\n"
        "  draft.premierleague.com/league/YOUR_LEAGUE_ID"
    )
    sys.exit(1)


def fetch_json(url: str) -> dict:
    """Fetch JSON from URL, raising on error."""
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def ingest_league(league_id: int, output_dir: Path) -> None:
    """Fetch all FPL Draft data for a league and save to output_dir."""
    output_dir.mkdir(parents=True, exist_ok=True)

    endpoints = [
        ("details", f"{DRAFT_API}/league/{league_id}/details"),
        ("element_status", f"{DRAFT_API}/league/{league_id}/element-status"),
        ("transactions", f"{DRAFT_API}/draft/league/{league_id}/transactions"),
        ("trades", f"{DRAFT_API}/draft/league/{league_id}/trades"),
        ("bootstrap_draft", f"{DRAFT_API}/bootstrap-static"),
    ]

    for name, url in endpoints:
        print(f"Fetching {name}...")
        try:
            data = fetch_json(url)
            out_file = output_dir / f"{name}.json"
            with open(out_file, "w") as f:
                json.dump(data, f, indent=2)
            print(f"  -> saved to {out_file}")
        except requests.HTTPError as e:
            print(f"  -> failed: {e}")
        except Exception as e:
            print(f"  -> error: {e}")

    # Fixtures: classic endpoint (schedule data; no draft element ids)
    print("Fetching fixtures...")
    try:
        fixtures = fetch_json(f"{FPL_FIXTURES_API}/fixtures")
        with open(output_dir / "fixtures.json", "w") as f:
            json.dump(fixtures, f, indent=2)
        print(f"  -> saved to {output_dir / 'fixtures.json'}")
    except Exception as e:
        print(f"  -> error: {e}")

    details_path = output_dir / "details.json"
    if not details_path.is_file() or details_path.stat().st_size < 100:
        print("\nERROR: details.json missing or empty — league ID wrong or API failed.", file=sys.stderr)
        sys.exit(1)
    try:
        d = json.loads(details_path.read_text())
        if not d.get("league_entries"):
            print("\nERROR: details.json has no league_entries.", file=sys.stderr)
            sys.exit(1)
    except (json.JSONDecodeError, OSError) as e:
        print(f"\nERROR: invalid details.json: {e}", file=sys.stderr)
        sys.exit(1)

    print("\nIngestion complete. Data saved to", output_dir)


def main():
    league_id = get_league_id()
    output_dir = Path(__file__).parent / "data"
    ingest_league(league_id, output_dir)


if __name__ == "__main__":
    main()
