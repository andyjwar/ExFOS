#!/usr/bin/env node
/**
 * Fetches FPL event/live per GW, then:
 * 1) waiver-out-gw-scores.json — dropped player’s pts in waiver GW (existing)
 * 2) waiver-in-tenure-top.json — top 10 player–team pairs by FPL pts scored
 *    from each waiver-in until that player left the squad (same entry).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const leagueDataDir = join(__dirname, '../public/league-data')
const txPath = join(leagueDataDir, 'transactions.json')
const detailsPath = join(leagueDataDir, 'details.json')
const outWaiverOut = join(leagueDataDir, 'waiver-out-gw-scores.json')
const outWaiverInTop = join(leagueDataDir, 'waiver-in-tenure-top.json')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function lastFinishedGwFromDetails(details) {
  let max = 0
  for (const m of details.matches || []) {
    if (m.finished && Number(m.event) > max) max = Number(m.event)
  }
  return max
}

function compareTx(a, b) {
  const ta = a.added ? Date.parse(a.added) : 0
  const tb = b.added ? Date.parse(b.added) : 0
  if (ta !== tb) return ta - tb
  return (a.id ?? 0) - (b.id ?? 0)
}

function sumPlayerRange(cache, elementId, startGw, endGw) {
  let s = 0
  const pid = Number(elementId)
  for (let g = startGw; g <= endGw; g++) {
    const m = cache[g]
    if (m && typeof m[pid] === 'number') s += m[pid]
  }
  return s
}

async function fetchGwMaps(lastGw) {
  /** @type {Record<number, Record<number, number>>} */
  const cache = {}
  for (let gw = 1; gw <= lastGw; gw++) {
    try {
      const r = await fetch(
        `https://fantasy.premierleague.com/api/event/${gw}/live/`
      )
      if (!r.ok) {
        console.warn(`waiver-analytics: GW${gw} HTTP ${r.status}`)
        cache[gw] = {}
        continue
      }
      const j = await r.json()
      const m = {}
      for (const el of j.elements || []) {
        const pts = el.stats?.total_points
        m[el.id] = typeof pts === 'number' ? pts : 0
      }
      cache[gw] = m
    } catch (e) {
      console.warn(`waiver-analytics: GW${gw}`, e.message)
      cache[gw] = {}
    }
    await sleep(120)
  }
  return cache
}

async function main() {
  if (process.env.SKIP_WAIVER_GW_SCORES === '1') {
    console.log('build-waiver-gw-analytics: SKIP_WAIVER_GW_SCORES=1, skip')
    return
  }
  if (!existsSync(txPath)) {
    console.log('build-waiver-gw-analytics: no transactions.json, skip')
    return
  }
  let payload
  try {
    payload = JSON.parse(readFileSync(txPath, 'utf8'))
  } catch {
    console.warn('build-waiver-gw-analytics: invalid transactions.json')
    return
  }
  const transactions = payload.transactions || []

  let details = {}
  try {
    details = JSON.parse(readFileSync(detailsPath, 'utf8'))
  } catch {
    /* ok */
  }

  let lastGw = lastFinishedGwFromDetails(details)
  if (lastGw < 1) {
    lastGw = Math.max(
      1,
      ...transactions.map((t) => Number(t.event) || 0)
    )
  }
  lastGw = Math.min(lastGw, 38)

  console.log(
    `build-waiver-gw-analytics: fetching event/live for GWs 1–${lastGw}…`
  )
  const cache = await fetchGwMaps(lastGw)

  /* —— waiver out (drop GW only) —— */
  const waiversDrop = transactions.filter(
    (t) =>
      t.kind === 'w' &&
      t.result === 'a' &&
      t.element_out != null &&
      Number(t.event) > 0
  )
  const rowsOut = waiversDrop.map((t) => {
    const gw = Number(t.event)
    const outId = Number(t.element_out)
    const inId =
      t.element_in != null && t.element_in !== '' ? Number(t.element_in) : null
    const map = cache[gw]
    const ptsOut =
      map && Object.prototype.hasOwnProperty.call(map, outId)
        ? map[outId]
        : null
    const ptsIn =
      inId != null &&
      !Number.isNaN(inId) &&
      map &&
      Object.prototype.hasOwnProperty.call(map, inId)
        ? map[inId]
        : null
    return {
      transactionId: t.id,
      entry: t.entry,
      gameweek: gw,
      element_in: t.element_in,
      element_out: outId,
      added: t.added ?? null,
      droppedPlayerGwPoints: ptsOut,
      pickedUpPlayerGwPoints: ptsIn,
    }
  })
  rowsOut.sort((a, b) => {
    const ta = a.added ? Date.parse(a.added) : 0
    const tb = b.added ? Date.parse(b.added) : 0
    if (tb !== ta) return tb - ta
    return (b.transactionId ?? 0) - (a.transactionId ?? 0)
  })
  writeFileSync(
    outWaiverOut,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        note: 'droppedPlayerGwPoints / pickedUpPlayerGwPoints = FPL pts that GW for element_out / element_in (event/live)',
        rows: rowsOut,
      },
      null,
      2
    )
  )

  /* —— waiver in: tenure pts until dropped —— */
  const sorted = [...transactions].sort(compareTx)
  const waiverIns = transactions.filter(
    (t) =>
      t.kind === 'w' &&
      t.result === 'a' &&
      t.element_in != null &&
      Number(t.event) > 0
  )

  function findNextDrop(w) {
    const i = sorted.findIndex((t) => t.id === w.id)
    if (i < 0) return null
    const entry = Number(w.entry)
    const pid = Number(w.element_in)
    for (let j = i + 1; j < sorted.length; j++) {
      const t = sorted[j]
      if (Number(t.entry) !== entry) continue
      if (t.result !== 'a') continue
      if (t.element_out != null && Number(t.element_out) === pid) return t
    }
    return null
  }

  /** @type {Map<string, { entry: number, elementId: number, totalPointsForTeam: number, waiverStints: number, firstGw: number, lastGw: number }>} */
  const agg = new Map()

  for (const w of waiverIns) {
    const startGw = Number(w.event)
    const elementId = Number(w.element_in)
    const entry = Number(w.entry)
    const drop = findNextDrop(w)
    let endGw = lastGw
    if (drop) {
      endGw = Math.min(Number(drop.event) - 1, lastGw)
    }
    let stintPts = 0
    if (endGw >= startGw) {
      stintPts = sumPlayerRange(cache, elementId, startGw, endGw)
    }
    const key = `${entry}|${elementId}`
    const cur = agg.get(key) || {
      entry,
      elementId,
      totalPointsForTeam: 0,
      waiverStints: 0,
      firstGw: startGw,
      lastGw: endGw,
    }
    cur.totalPointsForTeam += stintPts
    cur.waiverStints += 1
    cur.firstGw = Math.min(cur.firstGw, startGw)
    cur.lastGw = Math.max(cur.lastGw, endGw)
    agg.set(key, cur)
  }

  const top10 = [...agg.values()]
    .filter((r) => r.totalPointsForTeam > 0 || r.waiverStints > 0)
    .sort((a, b) => {
      const d = b.totalPointsForTeam - a.totalPointsForTeam
      if (d !== 0) return d
      return b.waiverStints - a.waiverStints
    })
    .slice(0, 10)
    .map((r, idx) => ({ rank: idx + 1, ...r }))

  /** Sum tenure pts for every distinct player ever waivered in, grouped by team (entry_id). */
  const byEntryTeam = new Map()
  for (const v of agg.values()) {
    if (!byEntryTeam.has(v.entry)) {
      byEntryTeam.set(v.entry, {
        entry: v.entry,
        totalWaiverInPoints: 0,
        distinctPlayers: 0,
      })
    }
    const t = byEntryTeam.get(v.entry)
    t.totalWaiverInPoints += v.totalPointsForTeam
    t.distinctPlayers += 1
  }
  const teamWaiverInTotals = [...byEntryTeam.values()].sort(
    (a, b) =>
      b.totalWaiverInPoints - a.totalWaiverInPoints ||
      a.entry - b.entry
  )

  writeFileSync(
    outWaiverInTop,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        note: 'Total FPL pts while on squad after waiver-in, through GW before drop (or last finished GW). Same player re-waived: stints summed.',
        lastGwUsed: lastGw,
        rows: top10,
        teamWaiverInTotals,
      },
      null,
      2
    )
  )

  console.log(
    `build-waiver-gw-analytics: waiver-out ${rowsOut.length} rows; top-10 + ${teamWaiverInTotals.length} team waiver-in totals → waiver-in-tenure-top.json`
  )
}

main().catch((e) => {
  console.error('build-waiver-gw-analytics FAILED:', e)
  process.exit(1)
})
