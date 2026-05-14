# Sofascore stats integration

Scheduled Python scraper that pulls aggregated **team** and **player** stats from
Sofascore (via [ScraperFC](https://pypi.org/project/scraperfc/)) and writes them to
Supabase. The Next.js backend reads them from there — fast, cached, serverless-safe.

```
┌─────────────────┐    cron    ┌──────────────────┐  upsert  ┌──────────┐
│ GitHub Actions  │ ─────────► │ scrape_stats.py  │ ───────► │ Supabase │
└─────────────────┘            └──────────────────┘          └────┬─────┘
                                                                  │ read
                                                  ┌───────────────▼────────────────┐
                                                  │ Next.js /api/sofascore/stats   │
                                                  └────────────────────────────────┘
```

## Tables

Created by [`supabase/migrations/20260513120000_sofascore_stats.sql`](../../supabase/migrations/20260513120000_sofascore_stats.sql):

| Table                     | What it stores                                                  |
| ------------------------- | --------------------------------------------------------------- |
| `sofascore_seasons`       | One row per `(league_key, season_year)` with refresh metadata.  |
| `sofascore_team_stats`    | Aggregated team stats (~115 columns) as JSONB per team.         |
| `sofascore_player_stats`  | Aggregated player stats (~110 columns) as JSONB per player.     |

All tables have public-read RLS; writes happen via `service_role` (bypasses RLS).

Apply the migration with `supabase db push` (handled automatically by the existing
`supabase-deploy.yml` workflow when merged to `main`).

## Run locally

```powershell
# 1. Install deps (one-time)
pip install -r scripts/sofascore/requirements.txt

# 2. Set credentials
$env:SUPABASE_URL = "https://vxsolicapdcpemfsahbk.supabase.co"
$env:SUPABASE_SERVICE_ROLE = "eyJ...service_role_key..."

# 3. Scrape (default: Argentina Liga Profesional, current year)
python scripts/sofascore/scrape_stats.py

# Other leagues / seasons
python scripts/sofascore/scrape_stats.py --league "Spain La Liga" --season 2025
python scripts/sofascore/scrape_stats.py --skip-players          # team stats only (faster)
```

The script takes ~1–3 minutes per league (rate-limited by Sofascore: ~1 req/sec
per team).

## Run in CI

[`.github/workflows/sofascore-scrape.yml`](../../.github/workflows/sofascore-scrape.yml)
runs daily at 09:00 UTC (06:00 ART). Required secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`  *(the secret service-role key — do **not** commit)*

To add another league, append to `matrix.league` in the workflow.

To trigger a one-off run from the Actions tab: **Run workflow** → optionally
override league/season.

## Read from Next.js

```ts
// Team-level (default league)
const r = await fetch('/api/sofascore/stats?kind=team&season=2026');
const { meta, teams } = await r.json();
// teams[0] = { team_id, team_name, stats: {goalsScored, accuratePassesPercentage, ...}, fetched_at }

// Player-level, filtered to one team
const r = await fetch('/api/sofascore/stats?kind=player&team_id=36842&season=2026');
const { meta, players } = await r.json();
```

Query params:

| Param     | Default                       | Notes                                     |
| --------- | ----------------------------- | ----------------------------------------- |
| `league`  | `Argentina Liga Profesional`  | Must match a Sofascore league name.       |
| `season`  | current UTC year              | e.g. `2025`, `2026`.                      |
| `kind`    | `team`                        | `team` or `player`.                       |
| `team_id` | —                             | Player only — filters by Sofascore team.  |

`meta.last_refreshed_at` tells you how stale the snapshot is; `meta.last_status`
is `ok` / `error` / `partial`.

## Available stat keys

110+ stats per row (JSONB). A few highlights:

- **Attack:** `goalsScored`, `assists`, `bigChancesCreated`, `expectedGoals`,
  `shots`, `shotsOnTarget`, `goalsFromInsideTheBox`.
- **Defense:** `goalsConceded`, `cleanSheet`, `interceptions`, `tackles`,
  `clearances`, `blockedShots`.
- **Possession & passing:** `accuratePassesPercentage`, `possessionPercentage`,
  `accurateLongBalls`, `accurateCrossesPercentage`.
- **Goalkeeping:** `saves`, `savesCaught`, `goalsPrevented`, `crossesNotClaimed`.

Run `python -c "import ScraperFC as sfc; print('\n'.join(sfc.Sofascore().stat_names))"`
to see the full list.

## Adding more leagues

Valid league names (from ScraperFC):

```
Argentina Liga Profesional, Argentina Copa de la Liga Profesional,
England Premier League, England EFL Championship, France Ligue 1,
Germany Bundesliga, Italy Serie A, Netherlands Eredivisie,
Portugal Primeira Liga, Spain La Liga, UEFA Champions League,
UEFA Europa League, UEFA Conference League, USA MLS, …
```

(Full list: `Sofascore().get_valid_seasons.__defaults__` or the error from an
invalid league name.)
