import { useState } from 'react'
import { useLeagueData, FORM_LAST_N } from './useLeagueData'
import { TeamAvatar } from './TeamAvatar'
import './App.css'

const LEAGUE_TITLE = 'The Tri-Continental League of Titans'
const LEAGUE_SEASON_SUB = 'The 25/26 Season'

function FormCircles({ form }) {
  return (
    <div className="form-circles" aria-label="Last matches form">
      {form.map((r, i) =>
        r == null ? (
          <span key={i} className="form-dot form-dot--empty" title="—" />
        ) : (
          <span
            key={i}
            className={`form-dot form-dot--${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'draw'}`}
            title={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}
          >
            {r}
          </span>
        )
      )}
    </div>
  )
}

function PlayerKit({ shirtUrl, badgeUrl, teamShort }) {
  const urls = [shirtUrl, badgeUrl].filter(Boolean)
  const [u, setU] = useState(0)
  if (u >= urls.length) {
    return (
      <span className="pl-kit-fallback" title={teamShort}>
        {teamShort?.slice(0, 3) ?? '?'}
      </span>
    )
  }
  return (
    <img
      className={u === 0 ? 'pl-kit-shirt' : 'pl-kit-badge'}
      src={urls[u]}
      alt=""
      loading="lazy"
      onError={() => setU((x) => x + 1)}
    />
  )
}

function App() {
  const { data, error, loading } = useLeagueData()
  const [formTeamId, setFormTeamId] = useState(null)

  if (loading) {
    return (
      <div className="app fotmob">
        <div className="load-screen">Loading league…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app fotmob">
        <header className="page-header page-header--centered">
          <section className="tile tile--title-banner" aria-label="League">
            <h1 className="page-title-main">{LEAGUE_TITLE}</h1>
            <h2 className="page-title-season">{LEAGUE_SEASON_SUB}</h2>
            <p className="brand-sub brand-sub--in-title-tile">FPL Draft · Head-to-head</p>
          </section>
        </header>
        <main className="main-tiles">
          <section className="tile error-tile">
            <p className="error-msg">{error ?? 'No data'}</p>
            <p className="muted">
              Run <code>python3 ingest.py &lt;LEAGUE_ID&gt;</code> then{' '}
              <code>npm run dev</code> to copy data into the site.
            </p>
          </section>
        </main>
      </div>
    )
  }

  const {
    tableRows,
    teamFormStripByEntry,
    teamsForFormSelect,
    nextEvent,
    nextGameweekFixtures,
    previousGameweek,
    previousGameweekFixtures,
    isSampleData,
    fetchFailedDemo,
    teamLogoMap,
    mostWaiveredPlayers,
    pointsAgainstList,
    waiverOutGwRows,
    waiverOutPointsByTeam,
    waiverInTenureTopRows,
  } = data

  const defaultFormEntry = teamsForFormSelect[0]?.id
  const activeFormEntry = formTeamId ?? defaultFormEntry
  const formStripRows =
    activeFormEntry != null ? teamFormStripByEntry[activeFormEntry] ?? [] : []
  const selectedFormTeamName =
    teamsForFormSelect.find((t) => t.id === activeFormEntry)?.teamName ?? ''

  const renderGwFixture = (fx, i) => (
    <li key={`${fx.event}-${fx.homeId}-${fx.awayId}-${i}`} className="gw-fixture-row">
      <div className="gw-fixture-teams">
        <span className="gw-fixture-side">
          <TeamAvatar entryId={fx.homeId} name={fx.homeName} size="sm" logoMap={teamLogoMap} />
          <span className={fx.homePts > fx.awayPts ? 'fw-600' : ''}>{fx.homeName}</span>
        </span>
        {fx.homePts != null ? (
          <span className="gw-fixture-score">
            {fx.homePts} – {fx.awayPts}
          </span>
        ) : (
          <span className="gw-fixture-vs">v</span>
        )}
        <span className="gw-fixture-side gw-fixture-side--end">
          <span className={fx.awayPts != null && fx.awayPts > fx.homePts ? 'fw-600' : ''}>{fx.awayName}</span>
          <TeamAvatar entryId={fx.awayId} name={fx.awayName} size="sm" logoMap={teamLogoMap} />
        </span>
      </div>
    </li>
  )

  return (
    <div className="app fotmob">
      <header className="page-header page-header--centered">
        <section className="tile tile--title-banner" aria-label="League">
          <h1 className="page-title-main">{LEAGUE_TITLE}</h1>
          <h2 className="page-title-season">{LEAGUE_SEASON_SUB}</h2>
        </section>
        <div className="header-team-strip" aria-label="League teams">
          {teamsForFormSelect.map((t) => (
            <div key={t.id} className="header-team-strip__item" title={t.teamName}>
              <TeamAvatar entryId={t.id} name={t.teamName} size="header" logoMap={teamLogoMap} />
            </div>
          ))}
        </div>
        {fetchFailedDemo && (
          <div className="data-banner data-banner--error" role="alert">
            <strong>League file didn’t load</strong> (wrong URL or deploy). Showing demo only.{' '}
            Use <code>https://YOUR_USER.github.io/repo-name/</code> with your real repo name (often
            lowercase). If the repo is <code>you.github.io</code>, use <code>https://you.github.io/</code>{' '}
            — no <code>/repo/</code> path.
          </div>
        )}
        {isSampleData && !fetchFailedDemo && (
          <div className="data-banner" role="status">
            <strong>Demo data</strong> — site owner: add GitHub secret{' '}
            <code>FPL_LEAGUE_ID</code> (your draft league number) under Settings → Secrets, then redeploy.
            Or publish files: <code>python3 ingest.py ID</code>,{' '}
            <code>cd web && npm run publish-real-league</code>, commit{' '}
            <code>web/public/league-data/</code>. ID: <code>draft.premierleague.com/league/YOUR_ID</code>
          </div>
        )}
      </header>

      <main className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <section className="tile tile--standings">
            <div className="table-head-bar">
              <span className="league-pill league-pill--lg">
                <span className="league-pill__icon" aria-hidden>
                  ⚽
                </span>
                <span>Standings</span>
              </span>
            </div>
            <div className="table-scroll table-scroll--standings-open">
              <table className="standings-table standings-table--sidebar">
                <thead>
                  <tr>
                    <th className="col-rank">#</th>
                    <th className="col-team">Team</th>
                    <th className="col-num">PL</th>
                    <th className="col-num">W</th>
                    <th className="col-num">D</th>
                    <th className="col-num">L</th>
                    <th className="col-num col-pfpa">+/-</th>
                    <th
                      className="col-num col-faced"
                      title="Total opponent FPL points in every H2H gameweek (combined)"
                    >
                      Faced
                    </th>
                    <th className="col-num">GD</th>
                    <th className="col-num col-pts">PTS</th>
                    <th className="col-form">Form</th>
                    <th className="col-next">Nxt</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    const isLeader = row.rank === 1
                    const plusMinus = `${row.gf}-${row.ga}`
                    return (
                      <tr key={row.league_entry} className={isLeader ? 'row-highlight' : undefined}>
                        <td className="col-rank">{row.rank}</td>
                        <td className="col-team">
                          <span className="team-cell">
                            <TeamAvatar entryId={row.league_entry} name={row.teamName} size="sm" logoMap={teamLogoMap} />
                            <span className="team-name team-name--sidebar">{row.teamName}</span>
                          </span>
                        </td>
                        <td className="col-num">{row.pl}</td>
                        <td className="col-num">{row.matches_won}</td>
                        <td className="col-num">{row.matches_drawn}</td>
                        <td className="col-num">{row.matches_lost}</td>
                        <td className="col-num col-pfpa tabular">{plusMinus}</td>
                        <td className="col-num col-faced tabular" title="Combined opponent points across all GWs">
                          {row.ga}
                        </td>
                        <td className="col-num tabular">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                        <td className="col-num col-pts">
                          <strong>{row.total}</strong>
                        </td>
                        <td className="col-form">
                          <FormCircles form={row.form} />
                        </td>
                        <td className="col-next">
                          {row.next ? (
                            <TeamAvatar entryId={row.next.id} name={row.next.name} size="sm" logoMap={teamLogoMap} />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="table-foot muted">
              Form = last {FORM_LAST_N} H2H. <strong>Faced</strong> = sum of opponent FPL points in every gameweek
              combined.
            </p>
          </section>
        </aside>

        <div className="dashboard-main dashboard-main--compact">
          <section className="tile tile--compact">
            <div className="tile-head-row tile-head-row--tight">
              <h2 className="tile-title tile-title--sm">Previous game week</h2>
              <span className="league-pill league-pill--sm">GW {previousGameweek ?? '—'}</span>
            </div>
            {previousGameweekFixtures?.length ? (
              <ul className="gw-fixture-list gw-fixture-list--tight">{previousGameweekFixtures.map(renderGwFixture)}</ul>
            ) : (
              <p className="muted muted--tight">No finished matches yet.</p>
            )}
          </section>

          <section className="tile tile--compact">
            <div className="tile-head-row tile-head-row--tight">
              <h2 className="tile-title tile-title--sm">Next game week</h2>
              <span className="league-pill league-pill--sm">GW {nextEvent ?? '—'}</span>
            </div>
            {nextGameweekFixtures?.length ? (
              <ul className="gw-fixture-list gw-fixture-list--tight">{nextGameweekFixtures.map((fx, i) => renderGwFixture(fx, i))}</ul>
            ) : (
              <p className="muted muted--tight">No upcoming fixtures in data.</p>
            )}
          </section>

          <section className="tile tile--compact tile--team-form">
            <h2 className="tile-title tile-title--sm">Team form</h2>
            <div className="form-team-toolbar">
              <label htmlFor="form-team-select" className="form-team-sublabel">
                Team
              </label>
              <div className="form-team-picker">
                <span className="form-team-picker__glyph" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <select
                  id="form-team-select"
                  className="form-team-select"
                  value={activeFormEntry ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setFormTeamId(v === '' ? null : Number(v))
                  }}
                >
                  {teamsForFormSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="tile-hint muted tile-hint--tight">
              {selectedFormTeamName
                ? `${selectedFormTeamName} · last ${formStripRows.length} matches (FPL pts)`
                : '—'}
            </p>
            <div className="form-strip form-strip--tight">
              {formStripRows.length ? (
                formStripRows.map((row, i) => (
                  <div key={`${row.event}-${i}`} className="form-strip__item">
                    <div
                      className={`form-score form-score--${row.result === 'W' ? 'win' : row.result === 'L' ? 'loss' : 'draw'}`}
                    >
                      {row.scoreStr}
                    </div>
                    <span className="form-strip__opp" title={row.opponentName}>
                      <TeamAvatar entryId={row.opponentEntryId} name={row.opponentName} size="sm" logoMap={teamLogoMap} />
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">No finished matches yet.</p>
              )}
            </div>
          </section>

          <section className="tile tile--compact" aria-labelledby="waiver-out-totals-heading">
            <div className="tile-head-row tile-head-row--tight">
              <h2 id="waiver-out-totals-heading" className="tile-title tile-title--sm">
                Waived out — team totals
              </h2>
            </div>
            <p className="tile-hint muted tile-hint--tight">
              Sum of dropped players’ FPL points in the gameweek each waiver hit (same basis as the
              table below). <strong>Avg</strong> = total ÷ waivers. Ordered by avg (highest first).
            </p>
            {waiverOutPointsByTeam?.some((t) => t.waiverOutCount > 0) ? (
              <>
                <div className="waiver-totals-grid-head" aria-hidden>
                  <span className="waiver-totals-grid-head__rank">#</span>
                  <span className="waiver-totals-grid-head__avatar" />
                  <span className="waiver-totals-grid-head__team">Team</span>
                  <span
                    className="waiver-totals-grid-head__num tabular"
                    title="Total dropped-player GW points"
                  >
                    Total
                  </span>
                  <span
                    className="waiver-totals-grid-head__num tabular"
                    title="Average GW points per waived-out player (total ÷ number of waivers)"
                  >
                    Avg
                  </span>
                </div>
                <ol className="pa-list waiver-totals-list waiver-totals-list--grid">
                  {waiverOutPointsByTeam.map((t, i) => (
                    <li key={t.league_entry} className="waiver-total-row">
                      <span className="waiver-total-row__rank">{i + 1}</span>
                      <TeamAvatar
                        entryId={t.league_entry}
                        name={t.teamName}
                        size="sm"
                        logoMap={teamLogoMap}
                      />
                      <div className="waiver-total-main">
                        <span className="pa-team">{t.teamName}</span>
                        <span className="waiver-totals-meta muted">
                          {t.waiverOutCount} waiver{t.waiverOutCount === 1 ? '' : 's'}
                          {t.knownPtsCount < t.waiverOutCount
                            ? ` · ${t.knownPtsCount}/${t.waiverOutCount} GW pts known`
                            : ''}
                        </span>
                      </div>
                      <span className="waiver-total-row__total tabular">{t.totalDroppedGwPoints}</span>
                      <span
                        className="waiver-total-row__avg tabular"
                        title={
                          t.waiverOutCount > 0
                            ? `${t.totalDroppedGwPoints} ÷ ${t.waiverOutCount} waivers`
                            : ''
                        }
                      >
                        {t.waiverOutCount > 0 && t.averageDroppedGwPoints != null
                          ? t.averageDroppedGwPoints.toFixed(1)
                          : '—'}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="muted muted--tight">No waiver-out data yet — run a full ingest + build.</p>
            )}
          </section>

          <section className="tile tile--compact" aria-labelledby="waiver-out-gw-heading">
            <div className="tile-head-row tile-head-row--tight">
              <h2 id="waiver-out-gw-heading" className="tile-title tile-title--sm">
                Waived out — GW points
              </h2>
            </div>
            <p className="tile-hint muted tile-hint--tight">
              When a successful waiver adds a player, the dropped player’s FPL points that same
              gameweek (from the official live data for that GW).
            </p>
            {waiverOutGwRows?.length ? (
              <div className="waiver-gw-table-wrap">
                <table className="waiver-gw-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>GW</th>
                      <th>Dropped</th>
                      <th className="tabular">Pts</th>
                      <th>Picked up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiverOutGwRows.map((r) => (
                      <tr key={r.transactionId}>
                        <td className="waiver-gw-team">{r.teamName}</td>
                        <td className="tabular">{r.gameweek}</td>
                        <td>{r.droppedName}</td>
                        <td className="tabular fw-600">
                          {r.droppedPlayerGwPoints == null ? '—' : r.droppedPlayerGwPoints}
                        </td>
                        <td className="muted">{r.pickedName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted muted--tight">
                Run a full build after <code>ingest</code> — this table is built from{' '}
                <code>transactions.json</code> + FPL event/live per GW.
              </p>
            )}
          </section>

          <section className="tile tile--compact" aria-labelledby="points-against-heading">
            <div className="tile-head-row tile-head-row--tight">
              <h2 id="points-against-heading" className="tile-title tile-title--sm">
                Points against
              </h2>
            </div>
            <p className="tile-hint muted tile-hint--tight">
              Total FPL points scored by opponents in every head-to-head gameweek (season to date).
            </p>
            {pointsAgainstList?.length ? (
              <ol className="pa-list">
                {pointsAgainstList.map((row, i) => (
                  <li key={row.league_entry} className="pa-row">
                    <span className="pa-rank">{i + 1}</span>
                    <TeamAvatar
                      entryId={row.league_entry}
                      name={row.teamName}
                      size="sm"
                      logoMap={teamLogoMap}
                    />
                    <span className="pa-team">{row.teamName}</span>
                    <span className="pa-value tabular">{row.pointsAgainst}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted muted--tight">No finished matches yet.</p>
            )}
          </section>

          <section className="tile tile--compact" aria-labelledby="waiver-in-tenure-heading">
            <h2 id="waiver-in-tenure-heading" className="tile-title tile-title--sm">
              Best waiver pickups
            </h2>
            <p className="tile-hint muted tile-hint--tight">
              Top 10 player–team pairs by total FPL points from each <strong>waiver in</strong> until
              that player left the squad (drop / swap). Same player re-waived later: stints added
              together. Uses official GW live scores through the last finished gameweek.
            </p>
            {waiverInTenureTopRows?.length ? (
              <ol className="waiver-list waiver-list--tight waiver-pickup-list">
                {waiverInTenureTopRows.map((r) => (
                  <li
                    key={`${r.entry}-${r.elementId}`}
                    className="waiver-row waiver-pickup-row"
                  >
                    <span className="waiver-rank">{r.rank}</span>
                    <PlayerKit
                      shirtUrl={r.shirtUrl}
                      badgeUrl={r.badgeUrl}
                      teamShort={r.teamShort}
                    />
                    <div className="waiver-info waiver-pickup-info">
                      <span className="waiver-name">{r.playerName}</span>
                      <span className="waiver-pickup-team">{r.teamName}</span>
                      <span className="waiver-club muted">
                        GW {r.firstGw}–{r.lastGw}
                        {r.waiverStints > 1 ? ` · ${r.waiverStints} pickups` : ''}
                      </span>
                    </div>
                    <span className="waiver-count tabular" title="Total pts for this team over those weeks">
                      {r.totalPointsForTeam}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted muted--tight">
                Run <code>npm run dev</code> / build so <code>waiver-in-tenure-top.json</code> is
                generated (needs <code>transactions.json</code> + finished GWs).
              </p>
            )}
          </section>

          <section className="tile tile--compact">
            <h2 className="tile-title tile-title--sm">Most waivered players</h2>
            {mostWaiveredPlayers?.length ? (
              <ol className="waiver-list waiver-list--tight">
                {mostWaiveredPlayers.map((p, i) => (
                  <li key={p.elementId} className="waiver-row">
                    <span className="waiver-rank">{i + 1}</span>
                    <PlayerKit shirtUrl={p.shirtUrl} badgeUrl={p.badgeUrl} teamShort={p.teamShort} />
                    <div className="waiver-info">
                      <span className="waiver-name">{p.web_name}</span>
                      <span className="waiver-club muted">{p.teamShort}</span>
                    </div>
                    <span className="waiver-count">{p.claims}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Run full <code>ingest.py</code> (includes <code>transactions.json</code> and{' '}
                <code>bootstrap_fpl.json</code>) then <code>npm run dev</code> to build waiver stats.
              </p>
            )}
          </section>

          <footer className="page-footer muted">
            Data from{' '}
            <a href="https://draft.premierleague.com" target="_blank" rel="noopener noreferrer">
              draft.premierleague.com
            </a>
            . Refresh with <code>ingest.py</code>.
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
