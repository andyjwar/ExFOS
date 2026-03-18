#!/usr/bin/env node
/**
 * Copy ingested league files into web/public/league-data/ for GitHub Pages.
 * Run from repo root after: python3 ingest.py YOUR_LEAGUE_ID
 *
 *   cd web && npm run publish-real-league
 *
 * Then: git add web/public/league-data && git commit && git push
 */
import { existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, '..')
const repoRoot = join(webRoot, '..')
const dataDetails = join(repoRoot, 'data', 'details.json')

if (!existsSync(dataDetails)) {
  console.error(`
  No data/details.json found.

  From the repo root run (use YOUR league ID from the draft URL):
    python3 ingest.py YOUR_LEAGUE_ID

  Example URL: draft.premierleague.com/league/123456
`)
  process.exit(1)
}

let parsed
try {
  parsed = JSON.parse(readFileSync(dataDetails, 'utf8'))
} catch (e) {
  console.error('data/details.json is not valid JSON:', e.message)
  process.exit(1)
}

if (parsed._tcMeta?.isSample === true) {
  console.error(`
  data/details.json is still DEMO sample data, not your league.

  Overwrite it with a real ingest:
    python3 ingest.py YOUR_LEAGUE_ID
`)
  process.exit(1)
}

const entries = parsed.league_entries?.length ?? 0
const matches = parsed.matches?.length ?? 0
if (entries < 2 || matches < 1) {
  console.error(
    `data/details.json looks incomplete (${entries} teams, ${matches} matches). Re-run ingest.`
  )
  process.exit(1)
}

console.log(`OK — league "${parsed.league?.name ?? '?'}" (${entries} teams, ${matches} matches)`)
execFileSync('node', ['scripts/copy-data.js'], { cwd: webRoot, stdio: 'inherit' })
execFileSync('node', ['scripts/build-waiver-gw-analytics.mjs'], {
  cwd: webRoot,
  stdio: 'inherit',
})

const out = join(webRoot, 'public', 'league-data', 'details.json')
const check = JSON.parse(readFileSync(out, 'utf8'))
if (check._tcMeta?.isSample) {
  console.error('Copy produced demo data — check data/details.json')
  process.exit(1)
}

console.log(`
Done. Your real league is in web/public/league-data/

Next (required for the live site):
  cd ${repoRoot}
  git add web/public/league-data/
  git status
  git commit -m "Real league data for site"
  git push

Wait for GitHub Actions, then refresh the site. The yellow demo banner should disappear.
`)
