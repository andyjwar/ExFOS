/**
 * Automatic substitutions for draft / live projection.
 * Official API subs take precedence; otherwise we simulate using DNP + bench order (see
 * `findProjectedReplacement` for GK / DEF / MID / FWD rules).
 */

/** @param {object} p */
export function isDnpStarter(p) {
  return Number(p.minutes) === 0 && p.clubGwFixturesFinished === true;
}

/** @param {object} p */
function isGk(p) {
  return p.posSingular === 'GKP' || Number(p.elementTypeId) === 1;
}

/** @param {object} p */
function isDef(p) {
  return p.posSingular === 'DEF' || Number(p.elementTypeId) === 2;
}

/** @param {object} p */
function isMid(p) {
  return p.posSingular === 'MID' || Number(p.elementTypeId) === 3;
}

/** @param {object} p */
function isFwd(p) {
  return p.posSingular === 'FWD' || Number(p.elementTypeId) === 4;
}

/** @param {object} p */
function playedBench(p) {
  return Number(p.minutes) > 0;
}

/**
 * Bench “slots” 2–4 = 2nd–4th bench picks (FPL draft pick 13, 14, 15 — skip first bench 12).
 * @param {object} p
 */
function isBenchSlot2Through4(p) {
  const slot = Number(p.pickPosition);
  return slot >= 13 && slot <= 15;
}

/**
 * @param {object} out DNP starter being replaced
 * @param {object[]} XI current XI (11)
 * @param {object[]} benchPool bench sorted by pickPosition ascending
 * @returns {object | null}
 */
function findProjectedReplacement(out, XI, benchPool) {
  if (isGk(out)) {
    return benchPool.find((p) => isGk(p) && playedBench(p)) ?? null;
  }

  if (isDef(out)) {
    const defCountInXi = XI.filter(isDef).length;
    if (defCountInXi === 3) {
      return (
        benchPool.find(
          (p) => isDef(p) && playedBench(p) && isBenchSlot2Through4(p),
        ) ?? null
      );
    }
    return benchPool.find((p) => !isGk(p) && playedBench(p)) ?? null;
  }

  if (isMid(out) || isFwd(out)) {
    return benchPool.find((p) => !isGk(p) && playedBench(p)) ?? null;
  }

  return benchPool.find((p) => !isGk(p) && playedBench(p)) ?? null;
}

/**
 * FPL XI: 1 GK; outfield 10 with 3–5 DEF, 2–5 MID, 1–3 FWD.
 * @param {object[]} xi 11 players with posSingular / elementTypeId
 */
export function validFormation(xi) {
  if (!xi || xi.length !== 11) return false;
  let g = 0;
  let d = 0;
  let m = 0;
  let f = 0;
  for (const p of xi) {
    const pos = p.posSingular;
    if (pos === 'GKP' || Number(p.elementTypeId) === 1) g++;
    else if (pos === 'DEF' || Number(p.elementTypeId) === 2) d++;
    else if (pos === 'MID' || Number(p.elementTypeId) === 3) m++;
    else if (pos === 'FWD' || Number(p.elementTypeId) === 4) f++;
    else return false;
  }
  if (g !== 1) return false;
  const outfield = d + m + f;
  if (outfield !== 10) return false;
  return d >= 3 && d <= 5 && m >= 2 && m <= 5 && f >= 1 && f <= 3;
}

/**
 * @param {unknown} raw
 * @returns {{ element_in: number, element_out: number }[]}
 */
export function normalizeAutoSubs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const element_in = Number(s.element_in);
    const element_out = Number(s.element_out);
    if (!Number.isFinite(element_in) || !Number.isFinite(element_out)) continue;
    out.push({ element_in, element_out });
  }
  return out;
}

/**
 * Official path: apply subs in order to XI slots (by element id).
 * @param {object[]} starters 11 rows, pickPosition 1–11
 * @param {object[]} bench 4 rows, pickPosition 12–15
 * @param {{ element_in: number, element_out: number }[]} autoSubs
 */
export function applyOfficialAutoSubs(starters, bench, autoSubs) {
  const startersSorted = [...starters].sort((a, b) => a.pickPosition - b.pickPosition);
  let xiIds = startersSorted.map((r) => Number(r.element));
  const byId = new Map();
  for (const r of [...starters, ...bench]) {
    byId.set(Number(r.element), r);
  }
  for (const sub of autoSubs) {
    const outId = Number(sub.element_out);
    const inId = Number(sub.element_in);
    const idx = xiIds.indexOf(outId);
    if (idx >= 0) xiIds[idx] = inId;
  }
  const xiSet = new Set(xiIds);
  const displayStarters = xiIds.map((id) => byId.get(id)).filter(Boolean);
  const displayBench = [...starters, ...bench]
    .filter((r) => !xiSet.has(Number(r.element)))
    .sort((a, b) => a.pickPosition - b.pickPosition);
  return { displayStarters, displayBench };
}

const MAX_ITERS = 16;

/**
 * @param {object[]} XI mutable length 11
 * @param {object[]} benchPool mutable
 * @param {object} out
 * @param {object} candidate
 */
function swapXiAndBench(XI, benchPool, out, candidate) {
  const xiIdx = XI.findIndex((p) => p === out);
  const benchIdx = benchPool.findIndex((p) => p === candidate);
  if (xiIdx < 0 || benchIdx < 0) return false;
  XI[xiIdx] = candidate;
  benchPool[benchIdx] = out;
  benchPool.sort((a, b) => a.pickPosition - b.pickPosition);
  return true;
}

/**
 * @param {object[]} starters
 * @param {object[]} bench
 */
export function simulateProjectedAutoSubs(starters, bench) {
  const XI = [...starters].sort((a, b) => a.pickPosition - b.pickPosition);
  const benchPool = [...bench].sort((a, b) => a.pickPosition - b.pickPosition);
  /** @type {{ element_in: number, element_out: number }[]} */
  const projectedAutoSubs = [];

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const dnpList = XI.filter(isDnpStarter);
    if (dnpList.length === 0) break;

    const dnpGk = dnpList.filter(isGk);
    let out;
    if (dnpGk.length) {
      out = dnpGk.slice().sort((a, b) => a.pickPosition - b.pickPosition)[0];
    } else {
      out = dnpList.slice().sort((a, b) => a.pickPosition - b.pickPosition)[0];
    }

    const found = findProjectedReplacement(out, XI, benchPool);
    if (!found) break;

    if (!swapXiAndBench(XI, benchPool, out, found)) break;
    projectedAutoSubs.push({ element_in: found.element, element_out: out.element });
  }

  const displayStarters = XI;
  const displayBench = benchPool.sort((a, b) => a.pickPosition - b.pickPosition);
  return { displayStarters, displayBench, projectedAutoSubs };
}

/**
 * @param {object[]} starters
 * @param {object[]} bench
 * @param {unknown} autoSubsRaw from draft picks payload (automatic_subs / subs)
 */
export function computeEffectiveLineup(starters, bench, autoSubsRaw) {
  const s = [...(starters || [])].sort((a, b) => a.pickPosition - b.pickPosition);
  const b = [...(bench || [])].sort((a, b) => a.pickPosition - b.pickPosition);

  if (s.length === 0 && b.length === 0) {
    return {
      displayStarters: [],
      displayBench: [],
      projectedAutoSubs: [],
      effectiveAutoSubs: [],
      usedOfficialAutoSubs: false,
    };
  }

  const normalized = normalizeAutoSubs(autoSubsRaw);
  if (normalized.length > 0) {
    const { displayStarters, displayBench } = applyOfficialAutoSubs(s, b, normalized);
    return {
      displayStarters,
      displayBench,
      projectedAutoSubs: [],
      effectiveAutoSubs: normalized,
      usedOfficialAutoSubs: true,
    };
  }

  const { displayStarters, displayBench, projectedAutoSubs } = simulateProjectedAutoSubs(s, b);
  return {
    displayStarters,
    displayBench,
    projectedAutoSubs,
    effectiveAutoSubs: projectedAutoSubs,
    usedOfficialAutoSubs: false,
  };
}
