#!/usr/bin/env node
/**
 * Fetches FPL event/live per GW, then:
 * 1) drops-gw-live.json — dropped player’s pts in waiver GW (neutral name: ad blockers often block "waiver" in URLs)
 * 2) pickups-tenure.json — top 10 pickup pairs + team tenure totals
 *    from each waiver-in until that player left the squad (same entry).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const leagueDataDir = join(__dirname, '../public/league-data')
const txPath = join(leagueDataDir, 'transactions.json')
const tradesPath = join(leagueDataDir, 'trades.json')
const detailsPath = join(leagueDataDir, 'details.json')
const outWaiverOut = join(leagueDataDir, 'drops-gw-live.json')
const outWaiverInTop = join(leagueDataDir, 'pickups-tenure.json')
const outTradesPanel = join(leagueDataDir, 'trades-panel.json')

function leagueEntryMaps(details) {
  const leagueEntries = details.league_entries || []
  const entryName = new Map()
  const fplToLeague = new Map()
  for (const e of leagueEntries) {
    if (e.entry_id != null) {
      entryName.set(Number(e.entry_id), e.entry_name ?? `Entry ${e.entry_id}`)
      if (e.id != null) fplToLeague.set(Number(e.entry_id), Number(e.id))
    }
  }
  return { entryName, fplToLeague }
}

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

function isTxStrictlyAfterTrade(tx, trade) {
  const ta = tx.added ? Date.parse(tx.added) : 0
  const tr = trade.response_time ? Date.parse(trade.response_time) : 0
  if (ta > tr) return true
  if (ta < tr) return false
  return (tx.id ?? 0) > (trade.id ?? 0)
}

function findDropAfterTrade(sortedTx, fplEntry, elementId, trade) {
  for (const t of sortedTx) {
    if (!isTxStrictlyAfterTrade(t, trade)) continue
    if (Number(t.entry) !== fplEntry) continue
    if (t.result !== 'a') continue
    if (t.element_out == null || Number(t.element_out) !== elementId) continue
    return t
  }
  return null
}

function computeTradeStint(
  fplEntry,
  gainedElementId,
  trade,
  sortedTx,
  cache,
  lastGw,
  startGw
) {
  const drop = findDropAfterTrade(sortedTx, fplEntry, gainedElementId, trade)
  let endGw = lastGw
  let stillOnTeam = true
  if (drop) {
    endGw = Math.min(Number(drop.event) - 1, lastGw)
    stillOnTeam = false
  }
  if (endGw < startGw) {
    return {
      startGw,
      endGw,
      totalPoints: 0,
      stillOnTeam: false,
      gwRangeLabel:
        startGw === endGw ? `${startGw}` : `${startGw}–${endGw}`,
    }
  }
  const totalPoints = sumPlayerRange(
    cache,
    Number(gainedElementId),
    startGw,
    endGw
  )
  return {
    startGw,
    endGw,
    totalPoints,
    stillOnTeam,
    gwRangeLabel: startGw === endGw ? `${startGw}` : `${startGw}–${endGw}`,
  }
}

function buildTradesPanelJson(tradesList, sortedTx, details, cache, lastGw) {
  const { entryName, fplToLeague } = leagueEntryMaps(details)

  const executed = [...tradesList]
    .filter((t) => t.state === 'p')
    .sort((a, b) => a.event - b.event || a.id - b.id)

  const tradesOut = []
  for (const trade of executed) {
    const offeredFpl = Number(trade.offered_entry)
    const receivedFpl = Number(trade.received_entry)
    const startGw = Number(trade.event)
    const legs = []
    for (const item of trade.tradeitem_set || []) {
      const inId = Number(item.element_in)
      const outId = Number(item.element_out)
      legs.push({
        side: 'offered',
        fplEntryId: offeredFpl,
        leagueEntryId: fplToLeague.get(offeredFpl),
        teamName: entryName.get(offeredFpl) ?? `Team ${offeredFpl}`,
        gainedElementId: inId,
        gaveElementId: outId,
        ...computeTradeStint(
          offeredFpl,
          inId,
          trade,
          sortedTx,
          cache,
          lastGw,
          startGw
        ),
      })
      legs.push({
        side: 'received',
        fplEntryId: receivedFpl,
        leagueEntryId: fplToLeague.get(receivedFpl),
        teamName: entryName.get(receivedFpl) ?? `Team ${receivedFpl}`,
        gainedElementId: outId,
        gaveElementId: inId,
        ...computeTradeStint(
          receivedFpl,
          outId,
          trade,
          sortedTx,
          cache,
          lastGw,
          startGw
        ),
      })
    }
    const pairs = []
    for (let i = 0; i < legs.length; i += 2) {
      pairs.push({ offeredLeg: legs[i], receivedLeg: legs[i + 1] })
    }
    tradesOut.push({
      id: trade.id,
      event: trade.event,
      offerTime: trade.offer_time ?? null,
      responseTime: trade.response_time ?? null,
      offeredFplEntry: offeredFpl,
      receivedFplEntry: receivedFpl,
      offeredLeagueEntry: fplToLeague.get(offeredFpl),
      receivedLeagueEntry: fplToLeague.get(receivedFpl),
      offeredTeamName: entryName.get(offeredFpl) ?? `Team ${offeredFpl}`,
      receivedTeamName: entryName.get(receivedFpl) ?? `Team ${receivedFpl}`,
      legs,
      pairs,
      completed: true,
    })
  }
  return tradesOut
}

const DRAFT_API = 'https://draft.premierleague.com/api'

/**
 * Draft event/live — same element id space as transactions & trades.
 * (Classic live uses different id→player mapping; do not use here.)
 */
function livePointsMapFromDraftJson(j) {
  const m = {}
  const raw = j?.elements
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k)
      if (!Number.isFinite(id)) continue
      const pts = v?.stats?.total_points
      m[id] = typeof pts === 'number' ? pts : 0
    }
    return m
  }
  if (Array.isArray(raw)) {
    for (const el of raw) {
      const pts = el.stats?.total_points
      m[el.id] = typeof pts === 'number' ? pts : 0
    }
  }
  return m
}

async function fetchGwMaps(lastGw) {
  /** @type {Record<number, Record<number, number>>} */
  const cache = {}
  for (let gw = 1; gw <= lastGw; gw++) {
    try {
      const r = await fetch(`${DRAFT_API}/event/${gw}/live`)
      if (!r.ok) {
        console.warn(`waiver-analytics: GW${gw} HTTP ${r.status}`)
        cache[gw] = {}
        continue
      }
      const j = await r.json()
      cache[gw] = livePointsMapFromDraftJson(j)
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
    console.log('build-waiver-gw-analytics: SKIP_WAIVER_GW_SCORES=1, skip waiver/trade GW scores')
    return
  }

  let transactions = []
  const hasTxFile = existsSync(txPath)
  if (hasTxFile) {
    try {
      const payload = JSON.parse(readFileSync(txPath, 'utf8'))
      transactions = payload.transactions || []
    } catch {
      console.warn('build-waiver-gw-analytics: invalid transactions.json')
    }
  }

  let tradesRaw = []
  if (existsSync(tradesPath)) {
    try {
      const tp = JSON.parse(readFileSync(tradesPath, 'utf8'))
      tradesRaw = tp.trades || []
    } catch {
      console.warn('build-waiver-gw-analytics: invalid trades.json')
    }
  }
  const executedTrades = tradesRaw.filter((t) => t.state === 'p')

  if (transactions.length === 0 && executedTrades.length === 0) {
    console.log(
      'build-waiver-gw-analytics: no transactions and no executed trades, skip'
    )
    return
  }

  let details = {}
  try {
    details = JSON.parse(readFileSync(detailsPath, 'utf8'))
  } catch {
    /* ok */
  }

  let lastGw = lastFinishedGwFromDetails(details)
  const eventCandidates = [
    ...transactions.map((t) => Number(t.event) || 0),
    ...executedTrades.map((t) => Number(t.event) || 0),
  ]
  if (lastGw < 1) {
    lastGw = Math.max(1, ...eventCandidates)
  }
  lastGw = Math.min(lastGw, 38)

  console.log(
    `build-waiver-gw-analytics: fetching event/live for GWs 1–${lastGw}…`
  )
  const cache = await fetchGwMaps(lastGw)

  const sorted = [...transactions].sort(compareTx)

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
  if (transactions.length > 0) {
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
  } else {
    console.log(
      'build-waiver-gw-analytics: no transactions; skipping drops-gw-live write'
    )
  }

  /* —— waiver in: tenure pts until dropped —— */
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
  const fplEntryToLeagueId = new Map(
    (details.league_entries || [])
      .filter((e) => e.entry_id != null && e.id != null)
      .map((e) => [Number(e.entry_id), Number(e.id)])
  )
  const teamWaiverInTotals = [...byEntryTeam.values()]
    .map((t) => ({
      ...t,
      leagueEntry: fplEntryToLeagueId.get(t.entry) ?? undefined,
    }))
    .sort(
      (a, b) =>
        b.totalWaiverInPoints - a.totalWaiverInPoints ||
        a.entry - b.entry
    )

  if (transactions.length > 0) {
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
  }

  /* —— executed trades: points after trade until dropped (or last GW) —— */
  if (executedTrades.length > 0) {
    const tradesPanel = buildTradesPanelJson(
      tradesRaw,
      sorted,
      details,
      cache,
      lastGw
    )
    writeFileSync(
      outTradesPanel,
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          lastGwUsed: lastGw,
          note: 'Per player acquired in a processed trade (state p): FPL pts from trade.event through first drop by that manager, or last finished GW. GW range like 9–28 = inclusive gameweeks on that squad.',
          trades: tradesPanel,
        },
        null,
        2
      )
    )
  }

  console.log(
    `build-waiver-gw-analytics: drops-gw-live ${rowsOut.length} rows; pickups-tenure ${transactions.length ? `${top10.length} top + ${teamWaiverInTotals.length} team` : 'skipped'}; trades-panel ${executedTrades.length} trade(s)`
  )
}

main().catch((e) => {
  console.error('build-waiver-gw-analytics FAILED:', e)
  process.exit(1)
})
