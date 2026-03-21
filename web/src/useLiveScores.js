import { useState, useEffect, useCallback, useRef } from 'react';
import {
  computeProvisionalGwBonusByElementId,
  selectDisplayBonus,
  hasTwoDefensiveContributionPoints,
  defensiveContributionPointsFromLiveRow,
} from './fplBonusFromBps.js';

/** Classic host — only used when resolving `fplApiBase()` with no proxy / non-dev. */
const FPL_DIRECT = 'https://fantasy.premierleague.com/api';

/** Draft API base (picks, bootstrap, live). IDs here ≠ classic FPL for the same number. */
const DRAFT_DIRECT = 'https://draft.premierleague.com/api';

/**
 * - **Production / preview:** `VITE_FPL_PROXY_URL` = Cloudflare Worker (must support `/draft/*`).
 * - **`npm run dev`:** if that env is **unset or empty**, use same-origin `/__fpl/*` (Vite proxy in vite.config.js).
 */
export function fplApiBase() {
  const raw = import.meta.env.VITE_FPL_PROXY_URL;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (trimmed !== '') {
    return trimmed.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '/__fpl';
  }
  return FPL_DIRECT;
}

/**
 * Resource path under draft.premierleague.com/api — no leading slash.
 * Draft `event/{gw}/live` 404s with a trailing slash; classic does not.
 */
export function draftResourceUrl(path) {
  const p = String(path).replace(/^\/+/, '');
  const base = fplApiBase();
  if (base !== FPL_DIRECT) {
    return `${base}/draft/${p}`;
  }
  if (import.meta.env.DEV) {
    return `/__fpl/draft/${p}`;
  }
  return `${DRAFT_DIRECT}/${p}`;
}

/** Classic fantasy.premierleague.com/api paths (fixtures, bootstrap-static, …). */
export function classicResourceUrl(path) {
  const p = String(path).replace(/^\/+/, '');
  const base = fplApiBase();
  if (base !== FPL_DIRECT) {
    return `${base}/${p}`;
  }
  if (import.meta.env.DEV) {
    return `/__fpl/${p}`;
  }
  return `${FPL_DIRECT}/${p}`;
}

/**
 * @param {number} entryId FPL `entry_id` from draft `league_entries` (not `league_entry` id).
 * @param {number} gameweek
 */
function draftGameweekPicksUrl(entryId, gameweek) {
  const base = fplApiBase();
  if (base !== FPL_DIRECT) {
    return `${base}/draft/entry/${entryId}/event/${gameweek}`;
  }
  return `${DRAFT_DIRECT}/entry/${entryId}/event/${gameweek}`;
}

/** Draft bootstrap nests gameweeks in `events.data`; classic uses `events` array. */
function bootstrapEventList(boot) {
  const ev = boot?.events;
  if (ev && Array.isArray(ev.data)) return ev.data;
  if (Array.isArray(ev)) return ev;
  return [];
}

/** True when every classic fixture involving `teamId` this GW has `finished_provisional`. */
export function teamGwFixturesAllFinished(teamId, classicFixtures) {
  const tid = Number(teamId);
  if (!Number.isFinite(tid)) return false;
  const relevant = (classicFixtures || []).filter(
    (f) => Number(f.team_h) === tid || Number(f.team_a) === tid,
  );
  if (relevant.length === 0) return false;
  return relevant.every((f) => f.finished_provisional === true);
}

/** Draft `event/{gw}/live` returns `elements` as an id → { stats } map. */
export function liveStatsByElementId(draftLiveJson) {
  const raw = draftLiveJson?.elements;
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      out[id] = (v && v.stats) || {};
    }
    return out;
  }
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      out[id] = row.stats || {};
    }
  }
  return out;
}

/** Full live row per element (includes `explain`). */
export function liveFullByElementId(draftLiveJson) {
  const raw = draftLiveJson?.elements;
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      if (!Number.isFinite(id)) continue;
      out[id] = v && typeof v === 'object' ? v : {};
    }
    return out;
  }
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;
      out[id] = row;
    }
  }
  return out;
}

function shirtUrl(teamId) {
  if (teamId == null) return null;
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamId}-1.png`;
}

function badgeUrl(teamCode) {
  if (teamCode == null) return null;
  return `https://resources.premierleague.com/premierleague/badges/50/t${teamCode}.png`;
}

function displayPlayerName(el, elementId) {
  if (!el) return `Player #${elementId}`;
  const known = el.known_name?.trim();
  if (known) return known;
  const parts = [el.first_name, el.second_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return el.web_name ?? `Player #${elementId}`;
}

/** FPL `elements[].status`: i = injured, d = doubtful — both count as injury flags in the UI. */
function injuryFlagFromElement(el) {
  if (!el) return false;
  const s = el.status;
  return s === 'i' || s === 'd';
}

function injuryTooltipFromElement(el) {
  if (!el) return '';
  const n = typeof el.news === 'string' ? el.news.trim() : '';
  if (n) return n;
  if (el.status === 'i') return 'Injured';
  if (el.status === 'd') return 'Doubtful';
  return '';
}

/**
 * @param {object[]} picks
 * @param {Record<number, object>} liveByElementId stats only
 * @param {Record<number, object>} liveFullByElementId full rows (explain / defensive alarm)
 * @param {Record<number, number>} provisionalBonusByElement
 * @param {object[]} classicFixtures classic FPL fixtures for this GW (finished flags)
 */
export function mapPickRows(
  picks,
  liveByElementId,
  liveFullByElementId,
  elementById,
  teamById,
  typeById,
  provisionalBonusByElement,
  classicFixtures,
) {
  const rows = (picks || []).map((p) => {
    const pid = Number(p.element);
    const el = elementById[pid];
    const tm = el ? teamById[el.team] : null;
    const typ = el ? typeById[el.element_type] : null;
    const st = liveByElementId[pid] || {};
    const fullRow = liveFullByElementId[pid] || {};
    const mins = st.minutes ?? 0;
    const apiPts = st.total_points ?? 0;
    const bps = st.bps ?? 0;
    const bonusApi = st.bonus ?? 0;
    const webName = el?.web_name ?? `Player #${pid}`;
    const provisional = Number(provisionalBonusByElement?.[pid]) || 0;
    const displayBonus = selectDisplayBonus(bonusApi, provisional);
    const total_points = Number(apiPts) - Number(bonusApi) + Number(displayBonus);
    const goals_scored = Number(st.goals_scored) || 0;
    const assists = Number(st.assists) || 0;
    const defensiveContributionPoints = defensiveContributionPointsFromLiveRow(fullRow);
    const elementTypeId = el != null ? Number(el.element_type) : null;
    const clubId = el != null ? Number(el.team) : null;
    const clubGwFixturesFinished =
      clubId != null && Number.isFinite(clubId)
        ? teamGwFixturesAllFinished(clubId, classicFixtures)
        : false;

    return {
      element: pid,
      web_name: webName,
      displayName: displayPlayerName(el, pid),
      teamShort: tm?.short_name ?? '—',
      teamName: tm?.name ?? null,
      posSingular: typ?.singular_name_short ?? '—',
      elementTypeId,
      shirtUrl: shirtUrl(el?.team),
      badgeUrl: badgeUrl(tm?.code),
      minutes: mins,
      goals_scored,
      assists,
      defensiveContributionPoints,
      total_points,
      api_total_points: apiPts,
      bps,
      bonus: displayBonus,
      bonusApi,
      provisionalBonus: provisional,
      defensiveContribAlarm: hasTwoDefensiveContributionPoints(fullRow),
      clubGwFixturesFinished,
      injuryFlagged: injuryFlagFromElement(el),
      injuryTooltip: injuryTooltipFromElement(el),
      pickPosition: p.position,
    };
  });
  rows.sort((a, b) => a.pickPosition - b.pickPosition);
  return rows;
}

export function applyBonusColumn(row, provisionalBonusByElement) {
  const pid = Number(row.element);
  const bonusApi = Number(row.bonusApi) || 0;
  const apiPts = Number(row.api_total_points ?? row.total_points) || 0;
  const provisional = Number(provisionalBonusByElement?.[pid]) || 0;
  const displayBonus = selectDisplayBonus(bonusApi, provisional);
  return {
    ...row,
    bonus: displayBonus,
    provisionalBonus: provisional,
    total_points: apiPts - bonusApi + displayBonus,
  };
}

/** XI starters with 0 mins whose club still has a fixture not finished_provisional in this GW. */
export function countStartersLeftToPlay(starters, elementById, classicFixtures) {
  const unfinishedTeams = new Set();
  for (const fx of classicFixtures || []) {
    if (fx.finished_provisional === true) continue;
    unfinishedTeams.add(Number(fx.team_h));
    unfinishedTeams.add(Number(fx.team_a));
  }
  let n = 0;
  for (const r of starters) {
    if (Number(r.minutes) !== 0) continue;
    const el = elementById[r.element];
    if (!el) continue;
    const tid = Number(el.team);
    if (unfinishedTeams.has(tid)) n += 1;
  }
  return n;
}

/**
 * Live GW data from **draft** FPL APIs + classic fixtures for BPS pools / finished flags.
 * @param {{ teams: Array<{ id: number, teamName: string, fplEntryId: number | null }>, gameweek: number | null, enabled: boolean, onBootstrapLiveMeta?: (m: { currentGw: number | null }) => void }} opts
 */
export function useLiveScores({ teams, gameweek, enabled, onBootstrapLiveMeta }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventSnapshot, setEventSnapshot] = useState(null);
  const [squads, setSquads] = useState([]);
  const [classicFixtures, setClassicFixtures] = useState([]);

  /** Parent passes a new `teams` array each render; ref avoids infinite load loops. */
  const teamsRef = useRef(teams);
  teamsRef.current = teams;

  const bootstrapMetaRef = useRef(onBootstrapLiveMeta);
  bootstrapMetaRef.current = onBootstrapLiveMeta;

  /** When this goes 0 → N, we must re-fetch (load is not tied to `teams` by reference). */
  const teamCount = teams?.length ?? 0;

  const load = useCallback(async () => {
    const teamList = teamsRef.current;
    const gw = Number(gameweek);
    if (!enabled || !Number.isFinite(gw) || !teamList?.length) return;

    setLoading(true);
    setError(null);

    try {
      const bootUrl = draftResourceUrl('bootstrap-static');
      const bootRes = await fetch(bootUrl);
      if (!bootRes.ok) {
        throw new Error(`draft bootstrap-static HTTP ${bootRes.status}`);
      }
      const boot = await bootRes.json();
      const evRoot = boot.events;
      const evList = bootstrapEventList(boot);
      const currentGw = evRoot?.current ?? null;
      const nextGw = evRoot?.next;
      const evs = evList.map((e) => ({
        ...e,
        is_current: e.id === currentGw,
        is_next: e.id === nextGw,
      }));
      setEvents(evs);
      const ev = evs.find((e) => e.id === gw);
      setEventSnapshot(ev ?? { id: gw, name: `Gameweek ${gw}` });

      bootstrapMetaRef.current?.({ currentGw: currentGw != null ? Number(currentGw) : null });

      const elementById = Object.fromEntries(
        (boot.elements || []).map((e) => [Number(e.id), e]),
      );
      const teamById = Object.fromEntries((boot.teams || []).map((t) => [Number(t.id), t]));
      const typeById = Object.fromEntries(
        (boot.element_types || []).map((t) => [Number(t.id), t]),
      );

      const liveUrl = draftResourceUrl(`event/${gw}/live`);
      const liveRes = await fetch(liveUrl);
      if (!liveRes.ok) {
        throw new Error(`draft event/live HTTP ${liveRes.status}`);
      }
      const liveJson = await liveRes.json();
      const liveByElementId = liveStatsByElementId(liveJson);
      const liveFullMap = liveFullByElementId(liveJson);

      const fxUrl = classicResourceUrl(`fixtures/?event=${gw}`);
      const fxRes = await fetch(fxUrl);
      if (!fxRes.ok) {
        throw new Error(`classic fixtures HTTP ${fxRes.status}`);
      }
      const fxJson = await fxRes.json();
      const fxList = Array.isArray(fxJson) ? fxJson : fxJson?.fixtures ?? [];
      setClassicFixtures(fxList);

      const provisionalBonusByElement = computeProvisionalGwBonusByElementId(
        fxList,
        liveFullMap,
        elementById,
      );

      const squadList = await Promise.all(
        teamList.map(async (t) => {
          if (t.fplEntryId == null) {
            return {
              leagueEntryId: t.id,
              teamName: t.teamName,
              fplEntryId: null,
              error:
                'Missing FPL entry id in league data (need real details.json with entry_id).',
              starters: [],
              bench: [],
              gwPoints: null,
              pointsOnBench: null,
              autoSubs: [],
              leftToPlayCount: 0,
            };
          }

          const url = draftGameweekPicksUrl(t.fplEntryId, gw);
          const pr = await fetch(url);
          if (!pr.ok) {
            return {
              leagueEntryId: t.id,
              teamName: t.teamName,
              fplEntryId: t.fplEntryId,
              error: `Draft picks HTTP ${pr.status}`,
              starters: [],
              bench: [],
              gwPoints: null,
              pointsOnBench: null,
              autoSubs: [],
              leftToPlayCount: 0,
            };
          }
          const picksPayload = await pr.json();
          const picks = picksPayload.picks || [];
          const rows = mapPickRows(
            picks,
            liveByElementId,
            liveFullMap,
            elementById,
            teamById,
            typeById,
            provisionalBonusByElement,
            fxList,
          );
          const starters = rows.filter((r) => r.pickPosition <= 11);
          const bench = rows.filter((r) => r.pickPosition > 11);

          const eh = picksPayload.entry_history;
          const pointsOnBench =
            eh && typeof eh.points_on_bench === 'number' ? eh.points_on_bench : null;
          const autoSubs = picksPayload.automatic_subs ?? picksPayload.subs ?? [];

          const sumXi = starters.reduce((s, r) => s + (Number(r.total_points) || 0), 0);
          /** Align banner with Pts column (bonus-adjusted), not raw entry_history. */
          const gwPoints = sumXi;

          const leftToPlayCount = countStartersLeftToPlay(starters, elementById, fxList);

          return {
            leagueEntryId: t.id,
            teamName: t.teamName,
            fplEntryId: t.fplEntryId,
            error: null,
            starters,
            bench,
            gwPoints,
            pointsOnBench,
            autoSubs,
            leftToPlayCount,
          };
        }),
      );

      setSquads(squadList);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      setError(e?.message || String(e));
      setSquads([]);
      setClassicFixtures([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, gameweek]);

  useEffect(() => {
    if (
      enabled &&
      gameweek != null &&
      Number.isFinite(Number(gameweek)) &&
      teamCount > 0
    ) {
      void load();
    }
  }, [enabled, gameweek, load, teamCount]);

  return {
    loading,
    error,
    refresh: load,
    lastUpdated,
    events,
    eventSnapshot,
    squads,
    classicFixtures,
  };
}
