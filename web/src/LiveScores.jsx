import { useMemo, useState, useCallback, useSyncExternalStore } from 'react';
import { TeamAvatar } from './TeamAvatar';
import { useLiveScores } from './useLiveScores';
import { buildLiveStandingsRows, formatGwLeaguePtsBonus } from './liveStandings';

/** Same as main standings table — only this team keeps an avatar in the team column. */
const STANDINGS_TABLE_AVATAR_TEAM = 'Martinelli is scum';

function KitThumb({ shirtUrl, badgeUrl, teamShort }) {
  const src = shirtUrl || badgeUrl;
  if (!src) {
    return (
      <span className="live-kit-fallback" title={teamShort}>
        {teamShort?.slice(0, 3) ?? '?'}
      </span>
    );
  }
  return (
    <img
      className="live-kit-img"
      src={src}
      alt=""
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        if (shirtUrl && badgeUrl && img.src.includes(String(shirtUrl))) {
          img.src = badgeUrl;
        }
      }}
    />
  );
}

const BONUS_HDR_TITLE =
  'Bonus: FPL stats.bonus when non-zero; otherwise BPS-based projection — including after full-time until FPL posts the final bonus.';
const PTS_HDR_TITLE = 'Points include the Bonus column (API total minus API bonus plus displayed bonus).';

/** Narrow viewport: live fixture chevron uses ▼/▲ instead of ▼/▶ */
function useNarrowLiveFixtureLayout() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia('(max-width: 719px)');
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 719px)').matches,
    () => false,
  );
}

function usePortraitLineupLayout() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia('(max-width: 719px) and (orientation: portrait)');
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 719px) and (orientation: portrait)').matches,
    () => false,
  );
}

/** If more than two name parts, show first + last only (mobile lineup). */
function shortLineupName(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function livePickMinsCellClass(mins, clubGwFixturesFinished) {
  const m = Number(mins) || 0;
  if (m >= 60) return 'live-pick-cell--green';
  if (m === 0 && clubGwFixturesFinished) return 'live-pick-cell--red';
  if (m >= 2 && m <= 59) return 'live-pick-cell--yellow';
  return '';
}

/** GK/DEF: ≥10 DC pts; MID/FWD: ≥12 (FPL element types 1–4). */
function livePickDcGreenClass(elementTypeId, dcPoints) {
  const d = Number(dcPoints) || 0;
  const t = Number(elementTypeId);
  const thr = t === 3 || t === 4 ? 12 : 10;
  return d >= thr ? 'live-pick-cell--green' : '';
}

function livePickPositiveClass(n) {
  return Number(n) > 0 ? 'live-pick-cell--green' : '';
}

function PicksTable({ rows, portraitLineup }) {
  if (!rows.length) return <p className="muted muted--tight">No picks</p>;
  return (
    <div
      className={`table-scroll${portraitLineup ? ' live-picks-table-wrap--lineup-portrait' : ''}`}
    >
      <table className="live-picks-table">
        <colgroup>
          <col className="live-picks-col-player" />
          <col className="live-picks-col-pos" />
          <col className="live-picks-col-num live-picks-col-mins" />
          <col className="live-picks-col-dc" />
          <col className="live-picks-col-num live-picks-col-goals" />
          <col className="live-picks-col-num live-picks-col-assists" />
          <col className="live-picks-col-num live-picks-col-bonus" />
          <col className="live-picks-col-alarm" />
          <col className="live-picks-col-num live-picks-col-pts" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="live-picks-col-player">
              Player
            </th>
            <th scope="col" className="live-picks-col-pos">
              Pos
            </th>
            <th scope="col" className="live-picks-col-num live-picks-col-mins" title="Minutes">
              Mins
            </th>
            <th
              scope="col"
              className="live-picks-col-dc"
              title="Defensive contribution points (sum from live explain)"
            >
              DC
            </th>
            <th scope="col" className="live-picks-col-num live-picks-col-goals" title="Goals">
              ⚽
            </th>
            <th scope="col" className="live-picks-col-num live-picks-col-assists" title="Assists">
              🍑
            </th>
            <th scope="col" className="live-picks-col-num live-picks-col-bonus" title={BONUS_HDR_TITLE}>
              Bonus
            </th>
            <th scope="col" className="live-picks-col-alarm" aria-label="Alerts" />
            <th
              scope="col"
              className="live-picks-col-num live-picks-col-pts live-picks-col-pts--section"
              title={PTS_HDR_TITLE}
            >
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const nameDisplay =
              portraitLineup && r.displayName
                ? shortLineupName(r.displayName)
                : (r.displayName ?? r.web_name);
            const fullTitle = `${r.web_name} · #${r.element}${r.teamName ? ` · ${r.teamName}` : ''}`;
            return (
              <tr key={`${r.pickPosition}-${r.element}`}>
                <td className="live-picks-col-player">
                  <div className="live-player-cell">
                    <KitThumb
                      shirtUrl={r.shirtUrl}
                      badgeUrl={r.badgeUrl}
                      teamShort={r.teamShort}
                    />
                    <div className="live-player-text">
                      <div className="live-player-name" title={fullTitle}>
                        <span className="live-player-name__text">{nameDisplay}</span>
                        {r.injuryFlagged ? (
                          <span
                            className="live-player-injury"
                            title={r.injuryTooltip || 'Injury / availability'}
                            aria-label={r.injuryTooltip || 'Player flagged injured or doubtful'}
                            role="img"
                          >
                            🚑
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="live-picks-col-pos tabular">{r.posSingular}</td>
                <td
                  className={`live-picks-col-num live-picks-col-mins tabular ${livePickMinsCellClass(r.minutes, r.clubGwFixturesFinished)}`}
                >
                  {r.minutes}
                </td>
                <td
                  className={`live-picks-col-dc tabular ${livePickDcGreenClass(r.elementTypeId, r.defensiveContributionPoints)}`}
                  title={
                    r.defensiveContribAlarm ? '2 defensive contribution pts (alarm threshold)' : ''
                  }
                >
                  {r.defensiveContributionPoints}
                </td>
                <td
                  className={`live-picks-col-num live-picks-col-goals tabular ${livePickPositiveClass(r.goals_scored)}`}
                >
                  {r.goals_scored}
                </td>
                <td
                  className={`live-picks-col-num live-picks-col-assists tabular ${livePickPositiveClass(r.assists)}`}
                >
                  {r.assists}
                </td>
                <td
                  className={`live-picks-col-num live-picks-col-bonus tabular ${livePickPositiveClass(r.bonus)}`}
                  title={BONUS_HDR_TITLE}
                >
                  {r.bonus}
                </td>
                <td className="live-picks-col-alarm tabular">
                  {r.defensiveContribAlarm ? (
                    <span className="live-dc-alarm" aria-label="Defensive contribution alarm">
                      !
                    </span>
                  ) : null}
                </td>
                <td
                  className="live-picks-col-num live-picks-col-pts live-picks-col-pts--section tabular"
                  title={PTS_HDR_TITLE}
                >
                  <strong>{r.total_points}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sumStarterPoints(starters) {
  return starters.reduce((acc, r) => acc + (Number(r.total_points) || 0), 0);
}

/** Draft picks often omit `entry_history.points`; fall back to effective XI sum from live stats. */
function liveGwDisplayTotal(squad) {
  if (!squad || squad.error) return null;
  if (squad.gwPoints != null) return squad.gwPoints;
  const xi = squad.displayStarters ?? squad.starters;
  if (!xi?.length) return null;
  return sumStarterPoints(xi);
}

function teamNameForEntry(teams, leagueEntryId) {
  return teams?.find((t) => t.id === leagueEntryId)?.teamName ?? `Team ${leagueEntryId}`;
}

/** @param {{ squad: object, portraitLineup: boolean }} */
function SquadLineupPanel({ squad, portraitLineup }) {
  if (!squad) {
    return <p className="muted muted--tight">No squad data for this team.</p>;
  }
  if (squad.error) {
    return <p className="muted">{squad.error}</p>;
  }
  const lineupStarters = squad.displayStarters ?? squad.starters;
  const lineupBench = squad.displayBench ?? squad.bench;
  const allRows = [...squad.starters, ...squad.bench];

  const showOfficialAutoSubs = squad.usedOfficialAutoSubs === true;
  const autoSubList = showOfficialAutoSubs
    ? (squad.autoSubs ?? [])
    : (squad.projectedAutoSubs ?? []);

  return (
    <>
      {autoSubList.length ? (
        <div className="live-auto-subs muted" role="status">
          <strong>{showOfficialAutoSubs ? 'Auto subs' : 'Projected auto subs'}:</strong>{' '}
          {autoSubList.map((a) => {
            const rowIn = allRows.find((r) => r.element === Number(a.element_in));
            const rowOut = allRows.find((r) => r.element === Number(a.element_out));
            const nameIn = rowIn?.displayName ?? rowIn?.web_name ?? `#${a.element_in}`;
            const nameOut = rowOut?.displayName ?? rowOut?.web_name ?? `#${a.element_out}`;
            return (
              <span key={`${a.element_in}-${a.element_out}`} className="live-auto-sub-pair">
                {nameIn} ↔ {nameOut}
              </span>
            );
          })}
        </div>
      ) : null}
      <h4 className="live-lineup-heading">Starting XI</h4>
      <PicksTable rows={lineupStarters} portraitLineup={portraitLineup} />
      <h4 className="live-lineup-heading live-lineup-heading--bench">Bench</h4>
      <PicksTable rows={lineupBench} portraitLineup={portraitLineup} />
    </>
  );
}

/**
 * @param {{ teams: Array<{ id: number, teamName: string, fplEntryId: number | null }>, matches?: Array<{ event: number, league_entry_1: number, league_entry_2: number, finished?: boolean, league_entry_1_points?: number, league_entry_2_points?: number }>, gameweek: number, onGameweekChange: (n: number) => void, onBootstrapLiveMeta?: (m: { currentGw: number | null }) => void, teamLogoMap: object }}
 */
function proxyHostLabel() {
  const raw = import.meta.env.VITE_FPL_PROXY_URL;
  if (raw == null || String(raw).trim() === '') return null;
  try {
    return new URL(String(raw).trim()).host;
  } catch {
    return null;
  }
}

function isLikelyLocalDev() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export function LiveScores({
  teams,
  matches = [],
  gameweek,
  onGameweekChange,
  onBootstrapLiveMeta,
  teamLogoMap,
  tableRows = [],
}) {
  const portraitLineup = usePortraitLineupLayout();
  const narrowLiveFixture = useNarrowLiveFixtureLayout();

  const { loading, error, refresh, lastUpdated, events, eventSnapshot, squads } =
    useLiveScores({
      teams,
      gameweek,
      enabled: true,
      onBootstrapLiveMeta,
    });

  /** Fixture keys in the set are expanded; default empty = all collapsed. */
  const [expandedFixtures, setExpandedFixtures] = useState(() => new Set());
  const toggleFixtureExpanded = useCallback((key) => {
    setExpandedFixtures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const proxyHost = proxyHostLabel();

  const allMissingFplId =
    teams?.length > 0 && teams.every((t) => t.fplEntryId == null);

  const gwOptions = useMemo(() => {
    return (events || [])
      .filter((e) => e && e.id >= 1 && e.id <= 38)
      .map((e) => ({
        id: e.id,
        label: e.name || `GW ${e.id}`,
        finished: e.finished,
        is_current: e.is_current,
        is_next: e.is_next,
      }));
  }, [events]);

  const gwMatches = useMemo(() => {
    if (!Array.isArray(matches) || matches.length === 0) return [];
    return matches.filter((m) => Number(m.event) === Number(gameweek));
  }, [matches, gameweek]);

  const squadByLeagueEntry = useMemo(() => {
    const m = new Map();
    for (const s of squads) {
      m.set(s.leagueEntryId, s);
    }
    return m;
  }, [squads]);

  const pairedLeagueEntryIds = useMemo(() => {
    const s = new Set();
    for (const m of gwMatches) {
      s.add(Number(m.league_entry_1));
      s.add(Number(m.league_entry_2));
    }
    return s;
  }, [gwMatches]);

  const orphanSquads = useMemo(
    () => squads.filter((q) => !pairedLeagueEntryIds.has(q.leagueEntryId)),
    [squads, pairedLeagueEntryIds],
  );

  const useFixtureLayout = gwMatches.length > 0;

  const metaLine = eventSnapshot
    ? [
        eventSnapshot.finished ? 'Finished' : 'In progress / upcoming',
        eventSnapshot.is_current ? '· FPL current GW' : '',
        eventSnapshot.is_next ? '· FPL next GW' : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  const liveStandingsRows = useMemo(
    () => buildLiveStandingsRows(tableRows, squads, gwMatches),
    [tableRows, squads, gwMatches],
  );

  return (
    <div className="dashboard-stack live-scores-root">
      <section className="tile tile--compact" aria-labelledby="live-heading">
        <h2 id="live-heading" className="tile-title tile-title--sm">
          Live scores
        </h2>

        {!proxyHost ? (
          <div className="data-banner data-banner--error" role="alert">
            <strong>No proxy in this JavaScript build.</strong>{' '}
            {isLikelyLocalDev() ? (
              <>
                For <strong>local dev</strong>, create <code>web/.env.local</code> with{' '}
                <code>
                  VITE_FPL_PROXY_URL=https://…workers.dev
                </code>{' '}
                (same URL as your Cloudflare Worker / GitHub secret). Copy{' '}
                <code>web/.env.local.example</code> → <code>.env.local</code>, edit the URL, then{' '}
                <strong>restart</strong> Vite (<code>Ctrl+C</code> and <code>npx vite</code> again).
              </>
            ) : (
              <>
                <code>VITE_FPL_PROXY_URL</code> was empty at build time, so the browser calls FPL
                directly and usually gets <em>Failed to fetch</em> on GitHub Pages. Add the secret,
                then <strong>re-run the deploy workflow</strong>. Check <code>deploy-check.json</code>{' '}
                — <code>liveProxyConfigured</code> should be <code>true</code>.
              </>
            )}
          </div>
        ) : null}

        {allMissingFplId ? (
          <div className="data-banner" role="status">
            <strong>No FPL entry ids</strong> — sample/demo <code>details.json</code> omits{' '}
            <code>entry_id</code> on each team. Ingest your real draft league so each manager has an{' '}
            <code>entry_id</code> (the number from the FPL game URL).
          </div>
        ) : null}

        <div className="live-toolbar">
          <label className="live-gw-label">
            <span className="muted">Gameweek</span>
            <select
              className="live-gw-select"
              value={gameweek}
              onChange={(e) => onGameweekChange(Number(e.target.value))}
            >
              {gwOptions.length ? (
                gwOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                    {o.finished ? ' ✓' : ''}
                    {o.is_current ? ' (current)' : ''}
                  </option>
                ))
              ) : (
                <option value={gameweek}>GW {gameweek}</option>
              )}
            </select>
          </label>
          <button
            type="button"
            className="live-refresh-btn"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh from FPL'}
          </button>
        </div>

        {metaLine ? <p className="muted live-meta">{metaLine}</p> : null}
        {lastUpdated ? (
          <p className="muted muted--tight live-updated">
            Last fetch: {new Date(lastUpdated).toLocaleString()}
          </p>
        ) : null}

        {error ? (
          <div className="data-banner data-banner--error" role="alert">
            <strong>Could not load live data.</strong> {error}{' '}
            <span className="muted">
              On GitHub Pages, set <code>VITE_FPL_PROXY_URL</code> to your Worker (see{' '}
              <code>web/workers/fpl-proxy/README.md</code>) and redeploy.
            </span>
          </div>
        ) : null}
      </section>

      {useFixtureLayout
        ? gwMatches.map((m) => {
            const homeId = Number(m.league_entry_1);
            const awayId = Number(m.league_entry_2);
            const homeName = teamNameForEntry(teams, homeId);
            const awayName = teamNameForEntry(teams, awayId);
            const homeSquad = squadByLeagueEntry.get(homeId);
            const awaySquad = squadByLeagueEntry.get(awayId);
            const homeLive = liveGwDisplayTotal(homeSquad);
            const awayLive = liveGwDisplayTotal(awaySquad);
            const homeLead =
              homeLive != null && awayLive != null && homeLive > awayLive;
            const awayLead =
              homeLive != null && awayLive != null && awayLive > homeLive;
            const homeLeft = Math.max(0, Number(homeSquad?.leftToPlayCount) || 0);
            const awayLeft = Math.max(0, Number(awaySquad?.leftToPlayCount) || 0);

            const fixtureKey = `${homeId}-${awayId}-${gameweek}`;
            const lineupOpen = expandedFixtures.has(fixtureKey);
            const fixtureBodyId = `live-fixture-lineups-${fixtureKey}`;

            const fixtureAria = [
              `${homeName} versus ${awayName}`,
              homeLeft || awayLeft
                ? `${homeLeft} home players left to play, ${awayLeft} away players left to play`
                : '',
            ]
              .filter(Boolean)
              .join('. ');

            return (
              <section
                key={fixtureKey}
                className="tile tile--compact live-fixture-tile"
                aria-label={fixtureAria}
              >
                <button
                  type="button"
                  className="live-fixture-banner live-fixture-banner--toggle"
                  onClick={() => toggleFixtureExpanded(fixtureKey)}
                  aria-expanded={lineupOpen}
                  aria-controls={fixtureBodyId}
                >
                  <span className="live-fixture-chevron" aria-hidden>
                    {narrowLiveFixture
                      ? lineupOpen
                        ? '▲'
                        : '▼'
                      : lineupOpen
                        ? '▼'
                        : '▶'}
                  </span>
                  <div className="live-fixture-banner__body">
                    <div className="live-fixture-banner__grid">
                      <div className="live-fixture-banner__team live-fixture-banner__team--home">
                        <TeamAvatar
                          entryId={homeId}
                          name={homeName}
                          size="sm"
                          logoMap={teamLogoMap}
                        />
                        <span className="live-fixture-banner__name-wrap">
                          <span
                            className={`live-fixture-banner__name ${homeLead ? 'live-fixture-banner__name--lead' : ''}`}
                          >
                            {homeName}
                          </span>
                          {homeLeft > 0 ? (
                            <span className="live-fixture-banner__ltp muted"> ({homeLeft})</span>
                          ) : null}
                        </span>
                      </div>

                      <span className="live-fixture-banner__scorebox" aria-label="Gameweek points comparison">
                        {homeLive != null && awayLive != null ? (
                          <span className="live-fixture-banner__live-score tabular">
                            <span className={homeLead ? 'live-fixture-pts--lead' : ''}>{homeLive}</span>
                            <span className="live-fixture-banner__dash">–</span>
                            <span className={awayLead ? 'live-fixture-pts--lead' : ''}>{awayLive}</span>
                          </span>
                        ) : (
                          <span className="live-fixture-vs">v</span>
                        )}
                        <span className="live-fixture-banner__caption-row muted">GW pts (live)</span>
                      </span>

                      <div className="live-fixture-banner__team live-fixture-banner__team--away">
                        <span className="live-fixture-banner__name-wrap live-fixture-banner__name-wrap--end">
                          <span
                            className={`live-fixture-banner__name ${awayLead ? 'live-fixture-banner__name--lead' : ''}`}
                          >
                            {awayName}
                          </span>
                          {awayLeft > 0 ? (
                            <span className="live-fixture-banner__ltp muted"> ({awayLeft})</span>
                          ) : null}
                        </span>
                        <TeamAvatar
                          entryId={awayId}
                          name={awayName}
                          size="sm"
                          logoMap={teamLogoMap}
                        />
                      </div>
                    </div>
                  </div>
                </button>

                {lineupOpen ? (
                <div className="live-fixture-split" id={fixtureBodyId}>
                  <div className="live-fixture-column">
                    <div className="live-fixture-column-head">
                      <h3 className="live-fixture-column-title">
                        {homeName}
                        {homeLeft > 0 ? (
                          <span className="live-fixture-banner__ltp muted"> ({homeLeft})</span>
                        ) : null}
                      </h3>
                      <div className="live-squad-meta tabular">
                        {homeSquad?.gwPoints != null ? (
                          <span className="live-squad-pts">
                            <strong>{homeSquad.gwPoints}</strong> GW pts
                          </span>
                        ) : null}
                        {homeSquad?.pointsOnBench != null ? (
                          <span className="muted">Bench: {homeSquad.pointsOnBench} pts</span>
                        ) : null}
                      </div>
                    </div>
                    <SquadLineupPanel squad={homeSquad} portraitLineup={portraitLineup} />
                  </div>
                  <div className="live-fixture-divider" aria-hidden="true" />
                  <div className="live-fixture-column">
                    <div className="live-fixture-column-head">
                      <h3 className="live-fixture-column-title">
                        {awayName}
                        {awayLeft > 0 ? (
                          <span className="live-fixture-banner__ltp muted"> ({awayLeft})</span>
                        ) : null}
                      </h3>
                      <div className="live-squad-meta tabular">
                        {awaySquad?.gwPoints != null ? (
                          <span className="live-squad-pts">
                            <strong>{awaySquad.gwPoints}</strong> GW pts
                          </span>
                        ) : null}
                        {awaySquad?.pointsOnBench != null ? (
                          <span className="muted">Bench: {awaySquad.pointsOnBench} pts</span>
                        ) : null}
                      </div>
                    </div>
                    <SquadLineupPanel squad={awaySquad} portraitLineup={portraitLineup} />
                  </div>
                </div>
                ) : null}
              </section>
            );
          })
        : squads.map((squad) => (
            <section
              key={squad.leagueEntryId}
              className="tile tile--compact live-squad-tile"
              aria-labelledby={`live-squad-${squad.leagueEntryId}`}
              aria-label={
                squad.leftToPlayCount > 0
                  ? `${squad.teamName}, ${squad.leftToPlayCount} players left to play`
                  : squad.teamName
              }
            >
              <div className="live-squad-head">
                <h3
                  id={`live-squad-${squad.leagueEntryId}`}
                  className="live-squad-title"
                  title={
                    squad.fplEntryId != null
                      ? `Squad from draft FPL API · entry_id ${squad.fplEntryId} (league_entries.entry_id)`
                      : undefined
                  }
                >
                  <TeamAvatar
                    entryId={squad.leagueEntryId}
                    name={squad.teamName}
                    size="sm"
                    logoMap={teamLogoMap}
                  />
                  <span>
                    {squad.teamName}
                    {squad.leftToPlayCount > 0 ? (
                      <span className="live-fixture-banner__ltp muted"> ({squad.leftToPlayCount})</span>
                    ) : null}
                  </span>
                </h3>
                <div className="live-squad-meta tabular">
                  {squad.gwPoints != null ? (
                    <span className="live-squad-pts">
                      <strong>{squad.gwPoints}</strong> GW pts
                    </span>
                  ) : null}
                  {squad.pointsOnBench != null ? (
                    <span className="muted">Bench: {squad.pointsOnBench} pts</span>
                  ) : null}
                </div>
              </div>
              <SquadLineupPanel squad={squad} portraitLineup={portraitLineup} />
            </section>
          ))}

      {tableRows?.length ? (
        <section
          className="tile tile--compact tile--live-standings"
          aria-labelledby="live-standings-heading"
        >
          <div className="tile-head-row tile-head-row--tight">
            <h2 id="live-standings-heading" className="tile-title tile-title--sm">
              Live standings
            </h2>
            <span className="league-pill league-pill--sm">GW {gameweek}</span>
          </div>
          <div className="table-scroll table-scroll--standings-open">
            <table className="standings-table standings-table--sidebar standings-table--live">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th className="col-team">Team</th>
                  <th className="col-num col-pl">PL</th>
                  <th className="col-num col-wdl">W</th>
                  <th className="col-num col-wdl">D</th>
                  <th className="col-num col-wdl">L</th>
                  <th
                    className="col-num col-for"
                    title="Season points for + this GW live points (when loaded)"
                  >
                    For
                  </th>
                  <th
                    className="col-num col-faced"
                    title="Season points against + opponent live GW points when paired"
                  >
                    Faced
                  </th>
                  <th className="col-num col-gd">GD</th>
                  <th className="col-num col-live-gw" title="Live H2H league points this GW">
                    GW
                  </th>
                  <th className="col-num col-pts">PTS</th>
                </tr>
              </thead>
              <tbody>
                {liveStandingsRows.map((row) => {
                  const trClass = [
                    row.liveRank === 1 ? 'row-highlight' : '',
                    row.liveRank === 1 ? 'standings-row--divider-below' : '',
                    row.liveRank === 8 ? 'standings-row--8th standings-row--divider-above' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  const moveUp = row.rankMove > 0;
                  const moveDown = row.rankMove < 0;
                  const gwClass =
                    row.h2hBonus === 3
                      ? 'live-standings-gw-val--win'
                      : row.h2hBonus === 1
                        ? 'live-standings-gw-val--draw'
                        : 'live-standings-gw-val--loss';
                  return (
                    <tr key={row.league_entry} className={trClass || undefined}>
                      <td className="col-rank">{row.liveRank}</td>
                      <td className="col-team">
                        <span className="live-standings-team-name">
                          {row.teamName === STANDINGS_TABLE_AVATAR_TEAM ? (
                            <TeamAvatar
                              entryId={row.league_entry}
                              name={row.teamName}
                              size="sm"
                              logoMap={teamLogoMap}
                            />
                          ) : null}
                          <span className="team-name team-name--sidebar">{row.teamName}</span>
                          {moveUp ? (
                            <span
                              className="live-standings-move live-standings-move--up"
                              title={`Up ${row.rankMove} vs league #${row.rank}`}
                              aria-label={`Up ${row.rankMove} places vs league position ${row.rank}`}
                            >
                              ↑
                            </span>
                          ) : null}
                          {moveDown ? (
                            <span
                              className="live-standings-move live-standings-move--down"
                              title={`Down ${-row.rankMove} vs league #${row.rank}`}
                              aria-label={`Down ${-row.rankMove} places vs league position ${row.rank}`}
                            >
                              ↓
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="col-num col-pl">{row.pl}</td>
                      <td className="col-num col-wdl">{row.matches_won}</td>
                      <td className="col-num col-wdl">{row.matches_drawn}</td>
                      <td className="col-num col-wdl">{row.matches_lost}</td>
                      <td className="col-num col-for tabular" title="Season For + live GW">
                        {row.projectedFor}
                      </td>
                      <td className="col-num col-faced tabular" title="Season Faced + opp live GW">
                        {row.projectedGa}
                      </td>
                      <td className="col-num col-gd tabular">
                        {row.projectedGd > 0 ? `+${row.projectedGd}` : row.projectedGd}
                      </td>
                      <td className="col-num col-live-gw tabular">
                        <strong className={gwClass}>{formatGwLeaguePtsBonus(row.h2hBonus)}</strong>
                      </td>
                      <td className="col-num col-pts">
                        <strong>{row.projectedPts}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="table-foot muted standings-landscape-hint" role="note">
            On mobile, turn your device to landscape for the full table.
          </p>
        </section>
      ) : null}

      {useFixtureLayout && orphanSquads.length > 0
        ? orphanSquads.map((squad) => (
            <section
              key={`orphan-${squad.leagueEntryId}`}
              className="tile tile--compact live-squad-tile live-squad-tile--orphan"
              aria-labelledby={`live-squad-o-${squad.leagueEntryId}`}
              aria-label={
                squad.leftToPlayCount > 0
                  ? `${squad.teamName}, ${squad.leftToPlayCount} players left to play, no H2H pairing this GW`
                  : `${squad.teamName}, no H2H pairing this GW`
              }
            >
              <p className="muted muted--tight live-orphan-note">
                No H2H pairing in schedule for this GW — showing squad only.
              </p>
              <div className="live-squad-head">
                <h3
                  id={`live-squad-o-${squad.leagueEntryId}`}
                  className="live-squad-title"
                  title={
                    squad.fplEntryId != null
                      ? `Squad from draft FPL API · entry_id ${squad.fplEntryId}`
                      : undefined
                  }
                >
                  <TeamAvatar
                    entryId={squad.leagueEntryId}
                    name={squad.teamName}
                    size="sm"
                    logoMap={teamLogoMap}
                  />
                  <span>
                    {squad.teamName}
                    {squad.leftToPlayCount > 0 ? (
                      <span className="live-fixture-banner__ltp muted"> ({squad.leftToPlayCount})</span>
                    ) : null}
                  </span>
                </h3>
                <div className="live-squad-meta tabular">
                  {squad.gwPoints != null ? (
                    <span className="live-squad-pts">
                      <strong>{squad.gwPoints}</strong> GW pts
                    </span>
                  ) : null}
                </div>
              </div>
              <SquadLineupPanel squad={squad} portraitLineup={portraitLineup} />
            </section>
          ))
        : null}
    </div>
  );
}
