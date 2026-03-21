/**
 * Live H2H standings projection: season table + live GW squad totals from draft API.
 * @param {Array<object>} tableRows from useLeagueData (gf, ga, total, rank, …)
 * @param {Array<object>} squads from useLiveScores (gwPoints, leagueEntryId)
 * @param {Array<object>} gwMatches matches for the selected GW (event === gameweek)
 */
export function formatGwLeaguePtsBonus(h2hBonus) {
  if (h2hBonus === 3) return '+3';
  if (h2hBonus === 1) return '+1';
  return '0';
}

function opponentLeagueEntryId(leagueEntryId, gwMatches) {
  const id = Number(leagueEntryId);
  for (const m of gwMatches || []) {
    const a = Number(m.league_entry_1);
    const b = Number(m.league_entry_2);
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

export function buildLiveStandingsRows(tableRows, squads, gwMatches) {
  const squadByEntry = new Map((squads || []).map((s) => [s.leagueEntryId, s]));

  const enriched = (tableRows || []).map((tr) => {
    const id = tr.league_entry;
    const squad = squadByEntry.get(id);
    const liveGw = squad?.gwPoints != null ? Number(squad.gwPoints) : null;
    const oppId = opponentLeagueEntryId(id, gwMatches);
    const oppSquad = oppId != null ? squadByEntry.get(oppId) : null;
    const oppLiveGw = oppSquad?.gwPoints != null ? Number(oppSquad.gwPoints) : null;

    const projectedFor = liveGw != null ? tr.gf + liveGw : tr.gf;
    const projectedGa =
      oppId != null && oppLiveGw != null ? tr.ga + oppLiveGw : tr.ga;
    const projectedGd = projectedFor - projectedGa;

    let h2hBonus = 0;
    if (liveGw != null && oppLiveGw != null) {
      if (liveGw > oppLiveGw) h2hBonus = 3;
      else if (liveGw === oppLiveGw) h2hBonus = 1;
      else h2hBonus = 0;
    }

    const projectedPts = Number(tr.total) + h2hBonus;

    return {
      ...tr,
      liveGw,
      oppLiveGw,
      oppId,
      projectedFor,
      projectedGa,
      projectedGd,
      h2hBonus,
      projectedPts,
    };
  });

  const sorted = [...enriched].sort((a, b) => {
    if (b.projectedPts !== a.projectedPts) return b.projectedPts - a.projectedPts;
    if (b.projectedFor !== a.projectedFor) return b.projectedFor - a.projectedFor;
    if (b.projectedGd !== a.projectedGd) return b.projectedGd - a.projectedGd;
    return (a.rank ?? 999) - (b.rank ?? 999);
  });

  let prevCompKey = null;
  let currentLiveRank = 0;

  return sorted.map((row, i) => {
    const compKey = `${row.projectedPts}|${row.projectedFor}|${row.projectedGd}`;
    if (i === 0 || compKey !== prevCompKey) {
      currentLiveRank = i + 1;
    }
    prevCompKey = compKey;
    const ordinalLive = i + 1;
    const rankMove = (row.rank ?? 999) - ordinalLive;

    return {
      ...row,
      liveRank: currentLiveRank,
      ordinalLive,
      rankMove,
    };
  });
}
