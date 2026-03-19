#!/usr/bin/env node
/**
 * Local dev/build: pulls your league into data/ so copy-data uses the right JSON.
 * CI (GITHUB_ACTIONS/CI): skipped — GitHub runs ingest.py instead.
 *
 * Create repo-root `.fpl-league-id` with one line: your draft league number
 * (same as draft.premierleague.com/league/THIS_NUMBER)
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '../..')
const dataDir = join(repoRoot, 'data')
const idFile = join(repoRoot, '.fpl-league-id')

if (process.env.SKIP_LEAGUE_FETCH === '1') {
  process.exit(0)
}
if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  process.exit(0)
}

function readId() {
  if (existsSync(idFile)) {
    const t = readFileSync(idFile, 'utf8').trim().split(/\r?\n/)[0]?.trim()
    if (t && /^\d+$/.test(t)) return t
  }
  const e = process.env.FPL_LEAGUE_ID?.trim() || process.env.LEAGUE_ID?.trim()
  if (e && /^\d+$/.test(e)) return e
  return null
}

const id = readId()
if (!id) {
  process.exit(0)
}

const DRAFT = 'https://draft.premierleague.com/api'
/** Classic API — fixtures only (no draft player id space). */
const FPL_CLASSIC = 'https://fantasy.premierleague.com/api'

async function save(name, url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  writeFileSync(
    join(dataDir, `${name}.json`),
    JSON.stringify(await r.json(), null, 2)
  )
}

try {
  mkdirSync(dataDir, { recursive: true })
  console.log(`fetch-league-if-needed: downloading league ${id}…`)
  await save('details', `${DRAFT}/league/${id}/details`)
  await save('element_status', `${DRAFT}/league/${id}/element-status`)
  await save('transactions', `${DRAFT}/draft/league/${id}/transactions`)
  await save('trades', `${DRAFT}/draft/league/${id}/trades`)
  await save('bootstrap_draft', `${DRAFT}/bootstrap-static`)
  const fx = await fetch(`${FPL_CLASSIC}/fixtures`)
  if (fx.ok) {
    writeFileSync(
      join(dataDir, 'fixtures.json'),
      JSON.stringify(await fx.json(), null, 2)
    )
  }
  const d = JSON.parse(readFileSync(join(dataDir, 'details.json'), 'utf8'))
  console.log(
    `fetch-league-if-needed: OK — "${d.league?.name ?? '?'}" (${d.league_entries?.length ?? 0} teams)`
  )
} catch (e) {
  console.error('fetch-league-if-needed FAILED:', e.message)
  console.error(
    '  Fix: check league ID, network, or run: python3 ingest.py',
    id,
    'from repo root'
  )
  process.exit(1)
}
