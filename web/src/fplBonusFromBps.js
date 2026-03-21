/**
 * FPL bonus from BPS pools (classic fixtures) + explain parsing for draft/classic live rows.
 * Matches official tie-break patterns used in TCLOT: 3+ top → all 3 & stop; 2 top → both 3 + next player 1;
 * unique top → 3; 3+ on 2nd → all 2 & stop; 2 on 2nd → 1 each; unique 2nd → 2; 3rd tier → 1 each in group.
 */

/** @param {{ elementId: number, bps: number }[]} players */
export function groupByBpsDesc(players) {
  const m = new Map();
  for (const p of players) {
    const b = Math.round(Number(p.bps) || 0);
    if (!m.has(b)) m.set(b, []);
    m.get(b).push(Number(p.elementId));
  }
  return [...m.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([bps, elementIds]) => ({ bps, elementIds }));
}

/**
 * @param {{ bps: number, elementIds: number[] }[]} groups BPS-descending, one entry per tied band
 * @returns {Record<number, number>} elementId → bonus pts for this fixture
 */
export function bonusFromBpsGroups(groups) {
  const out = Object.create(null);
  const add = (id, v) => {
    const k = Number(id);
    if (!Number.isFinite(k)) return;
    out[k] = (out[k] || 0) + v;
  };

  if (!groups.length) return out;

  const g0 = groups[0];
  const n0 = g0.elementIds.length;

  if (n0 >= 3) {
    for (const id of g0.elementIds) add(id, 3);
    return out;
  }

  if (n0 === 2) {
    for (const id of g0.elementIds) add(id, 3);
    if (groups.length > 1) {
      const g1 = groups[1];
      if (g1.elementIds.length) add(g1.elementIds[0], 1);
    }
    return out;
  }

  add(g0.elementIds[0], 3);

  if (groups.length === 1) return out;

  const g1 = groups[1];
  const n1 = g1.elementIds.length;

  if (n1 >= 3) {
    for (const id of g1.elementIds) add(id, 2);
    return out;
  }

  if (n1 === 2) {
    for (const id of g1.elementIds) add(id, 1);
    return out;
  }

  add(g1.elementIds[0], 2);

  if (groups.length > 2) {
    const g2 = groups[2];
    for (const id of g2.elementIds) add(id, 1);
  }

  return out;
}

function statMinutes(statsArr) {
  if (!Array.isArray(statsArr)) return 0;
  const m = statsArr.find((s) => s?.identifier === 'minutes');
  return Number(m?.value) || 0;
}

function statBps(statsArr) {
  if (!Array.isArray(statsArr)) return null;
  const b = statsArr.find((s) => s?.identifier === 'bps');
  const v = b?.value;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Draft: [[[stats], fixtureId], …]. Classic element: { fixture, stats: [{ identifier, value, points }] }.
 * @returns {{ fixtureId: number, stats: Record<string, unknown>, statsRaw: unknown }[]}
 */
export function explainBlocksFromLiveElement(fullRow) {
  const ex = fullRow?.explain;
  if (ex == null) return [];

  if (Array.isArray(ex)) {
    const blocks = [];
    for (const block of ex) {
      if (!Array.isArray(block) || block.length < 2) continue;
      const statsArr = block[0];
      const fixtureId = Number(block[1]);
      if (!Number.isFinite(fixtureId)) continue;
      const statsRaw = statsArr;
      const stats = {};
      if (Array.isArray(statsArr)) {
        for (const s of statsArr) {
          if (s?.identifier != null) stats[s.identifier] = s.value;
        }
      } else if (statsArr && typeof statsArr === 'object') {
        Object.assign(stats, statsArr);
      }
      blocks.push({ fixtureId, stats, statsRaw });
    }
    return blocks;
  }

  if (typeof ex === 'object' && ex.stats) {
    const fixtureId = Number(ex.fixture);
    if (!Number.isFinite(fixtureId)) return [];
    const statsRaw = ex.stats;
    const stats = {};
    if (Array.isArray(statsRaw)) {
      for (const s of statsRaw) {
        if (s?.identifier != null) stats[s.identifier] = s.value;
      }
    }
    return [{ fixtureId, stats, statsRaw }];
  }

  return [];
}

/** Blocks with minutes > 0 (played in that fixture). */
export function activeExplainBlocks(fullRow) {
  return explainBlocksFromLiveElement(fullRow).filter((b) => {
    const raw = b.statsRaw;
    if (Array.isArray(raw)) return statMinutes(raw) > 0;
    return Number(b.stats?.minutes) > 0;
  });
}

/**
 * Players on team_h/team_a with valid BPS for this fixture (excludes DGW-ambiguous rows).
 * @returns {{ elementId: number, bps: number }[]}
 */
export function bpsForFixturePool(fixtureId, liveFullByElementId, elementById, teamH, teamA) {
  const fid = Number(fixtureId);
  const th = Number(teamH);
  const ta = Number(teamA);
  const pool = [];
  for (const [eidStr, row] of Object.entries(liveFullByElementId || {})) {
    const eid = Number(eidStr);
    const meta = elementById[eid];
    if (!meta) continue;
    const tid = Number(meta.team);
    if (tid !== th && tid !== ta) continue;
    if (hasMultipleActiveFixturesAmbiguous(row)) continue;
    const bps = bpsForElementInFixture(row, fid);
    if (bps == null || !Number.isFinite(bps)) continue;
    pool.push({ elementId: eid, bps });
  }
  return pool;
}

export function fallbackSingleFixtureId(fullRow) {
  const act = activeExplainBlocks(fullRow);
  if (act.length === 1) return act[0].fixtureId;
  return null;
}

export function participatingFixtureIdsForElement(fullRow) {
  const ids = new Set();
  for (const b of activeExplainBlocks(fullRow)) {
    ids.add(Number(b.fixtureId));
  }
  return ids;
}

export function bpsForElementInFixture(fullRow, fixtureId) {
  const fid = Number(fixtureId);
  for (const b of explainBlocksFromLiveElement(fullRow)) {
    if (Number(b.fixtureId) !== fid) continue;
    const raw = b.statsRaw;
    if (Array.isArray(raw)) {
      const v = statBps(raw);
      if (v != null) return v;
    }
    const v = Number(b.stats?.bps);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

function hasMultipleActiveFixturesAmbiguous(fullRow) {
  return activeExplainBlocks(fullRow).length > 1;
}

/**
 * Provisional bonus per element for the GW: each classic fixture defines a BPS pool (teams in that match).
 * Skips elements with DGW ambiguity (multiple active explain blocks with minutes).
 * @param {object[]} classicFixtures
 * @param {Record<number, object>} liveFullByElementId
 * @param {Record<number, object>} elementById draft bootstrap elements by id
 */
export function computeProvisionalGwBonusByElementId(
  classicFixtures,
  liveFullByElementId,
  elementById,
) {
  const out = Object.create(null);
  const add = (id, v) => {
    const k = Number(id);
    if (!Number.isFinite(k)) return;
    out[k] = (out[k] || 0) + v;
  };

  for (const fx of classicFixtures || []) {
    const fid = Number(fx.id);
    const th = Number(fx.team_h);
    const ta = Number(fx.team_a);
    if (!Number.isFinite(fid) || !Number.isFinite(th) || !Number.isFinite(ta)) continue;

    const pool = [];
    for (const [eidStr, row] of Object.entries(liveFullByElementId || {})) {
      const eid = Number(eidStr);
      const meta = elementById[eid];
      if (!meta) continue;
      const tid = Number(meta.team);
      if (tid !== th && tid !== ta) continue;
      if (hasMultipleActiveFixturesAmbiguous(row)) continue;
      const bps = bpsForElementInFixture(row, fid);
      if (bps == null || !Number.isFinite(bps)) continue;
      pool.push({ elementId: eid, bps });
    }

    const groups = groupByBpsDesc(pool);
    const bonusMap = bonusFromBpsGroups(groups);
    for (const [id, pts] of Object.entries(bonusMap)) {
      add(id, pts);
    }
  }

  return out;
}

/**
 * Use FPL `stats.bonus` once it is non-zero; otherwise keep BPS-based provisional (including
 * after full-time while FPL still shows bonus 0).
 */
export function selectDisplayBonus(apiBonus, provisionalSum) {
  const api = Number(apiBonus) || 0;
  const prov = Number(provisionalSum) || 0;
  if (api > 0) return api;
  return prov;
}

export function defensiveContributionPointsFromLiveRow(fullRow) {
  let sum = 0;
  for (const b of explainBlocksFromLiveElement(fullRow)) {
    const raw = b.statsRaw;
    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (s?.identifier === 'defensive_contribution') {
          sum += Number(s.points) || 0;
        }
      }
    }
  }
  return sum;
}

export function hasTwoDefensiveContributionPoints(fullRow) {
  return defensiveContributionPointsFromLiveRow(fullRow) === 2;
}
