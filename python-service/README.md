# SofaScore Bridge (Python microservice)

FastAPI bridge that replaces FlashScore as the football data source for the
Next.js app. Wraps SofaScore's public API and `LanusStats` for advanced
analytics.

> Only used for `sportId === 'football'`. Other sports keep their existing
> providers (FlashScore, ESPN, etc.).

## What it exposes

| Endpoint | Purpose | Cache TTL |
|---|---|---|
| `GET /health` | Liveness probe (no auth) | — |
| `GET /v1/matches?date=YYYY-MM-DD&tz=...` | Football fixtures for a given date | 60s |
| `GET /v1/matches/live` | Live football matches | 5s |
| `GET /v1/matches/{id}` | Single match details (id may be raw or `ss-match-<n>`) | 30s |
| `GET /v1/matches/{id}/lineups` | Lineups | 30s |
| `GET /v1/matches/{id}/statistics` | Team statistics | 30s |
| `GET /v1/matches/{id}/shotmap` | Shotmap (works for finished matches) | 30s |
| `GET /v1/matches/{id}/h2h` | Head to head | 30s |
| `GET /v1/teams/{id}` | Team details + squad + last/next events | 1h |
| `GET /v1/teams/{id}/results?page=N` | Past matches grouped by tournament | 5m |
| `GET /v1/teams/{id}/fixtures?page=N` | Upcoming matches grouped by tournament | 5m |
| `GET /v1/players/{id}` | Player profile + career seasons | 1h |
| `GET /v1/tournaments/{id}` | Tournament details (name, logo, country, sport) | 1h |
| `GET /v1/tournaments/{id}/seasons` | Available seasons | 1h |
| `GET /v1/tournaments/{id}/standings?season=` | Standings (defaults to current season) | 2m |
| `GET /v1/tournaments/{id}/matches?season=&page=N` | Tournament fixtures + results | 1m |
| `GET /v1/tournaments/{id}/top-scorers?season=` | Top scorers / assists / etc. | 1h |
| `GET /v1/search?q=` | Universal search (teams, players, tournaments) | 1m |

Responses already mimic the FlashScore shape the existing Next.js code
consumes — match objects are grouped per tournament under `DATA[]` so the
existing `flattenFsMatches` helper in `src/app/api/matches/route.ts` works
unchanged. SofaScore identifiers are prefixed:

- matches: `ss-match-<id>`
- teams: `ss-team-<id>`
- players: `ss-player-<id>`
- tournaments: `ss-tour-<id>`

This is what lets the TS side disambiguate SofaScore IDs from FlashScore IDs
when fetching a team / player / match by id.

## Tennis

Tennis lives under its own `/v1/tennis` prefix because upstream answers it
differently, not because the shapes differ: a match comes back in the same
flattened form the football day view uses, so `flattenFsMatches` works on it
unchanged.

| Endpoint | Purpose | Cache TTL |
|---|---|---|
| `GET /v1/tennis/matches?date=&tz=&categories=` | A day, grouped per tournament | 60s |
| `GET /v1/tennis/matches/live` | Live matches, ATP and WTA | 5s |
| `GET /v1/tennis/rankings/{atp\|wta}` | Singles ranking, 500 places | 1h |
| `GET /v1/tennis/players/{id}/rankings` | One player's ranking history | 1h |
| `GET /v1/tennis/tournaments/{id}/draw` | The bracket (`cuptrees`) | 2m |

A player's profile, results and form need no tennis-specific route: SofaScore
models a tennis player as a `team`, so `/v1/teams/{id}` and
`/v1/teams/{id}/results` already serve them.

Three things about tennis are not like football, and each one shaped the code:

**The day is a fan-out.** `/sport/tennis/scheduled-events/{date}` does not
exist — a day is resolved by listing the tournaments playing (paginated, 100
per page) and then asking each one for its matches. A plain Sunday is 139
tournaments and 574 matches once ITF and UTR futures are counted, so
`categories` defaults to `ATP,WTA,Challenger,WTA 125` (33 tournaments) and
`categories=all` opts into the whole tail deliberately.

**A date is not a date.** The per-tournament endpoint answers a window around
the date, not the date: 2026-09-07 came back with 533 matches of which 239
were that day and the rest belonged to the 6th and the 8th. They are filtered
by `tz`, and the response reports how many were dropped under
`discarded_off_day` — a match silently missing looks exactly like a match that
was not played.

**The score is sets.** `scores.home/away` holds sets won, which is the result
of a tennis match, so nothing downstream has to change to display it. The
per-set games, tie-breaks, current point, seeds, round, surface and whether it
is doubles ride in an extra `tennis` key that only tennis matches carry.

## Local run

```bash
cd python-service
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env       # then fill in SERVICE_TOKEN
uvicorn app.main:app --reload --port 8000
```

Then in the Next.js repo root, set in `.env.local`:

```
SOFASCORE_SERVICE_URL=http://localhost:8000
SOFASCORE_SERVICE_TOKEN=<same value as SERVICE_TOKEN in python-service/.env>
```

When `SOFASCORE_SERVICE_URL` is unset football endpoints in the Next.js side
return empty payloads — FlashScore is **never** invoked for football, so the
bridge must be running for the football paths (matches list, live, match
details, lineups, stats, teams, players, tournaments, search) to return data.

## Auth

The service requires the header `x-service-token: <SERVICE_TOKEN>` on every
request except `/health` (compared with `hmac.compare_digest`).

Fail-closed: without `SERVICE_TOKEN` the service refuses to start, unless
`ENV=dev` (or `development` / `local`) is set explicitly. `/docs`, `/redoc` and
`/openapi.json` only exist with `ENV=dev`. CORS allows no browser origin by
default; set `CORS_ALLOW_ORIGINS` (comma-separated, `*` is ignored) if a browser
ever needs to call it directly.

## Deploy

### Render

The repo ships a `render.yaml`. After pushing the repo to GitHub:

1. Render -> New -> Blueprint, pick this repo.
2. Render detects the `render.yaml` and creates a Docker web service from
   `python-service/`.
3. In the service settings, set `SERVICE_TOKEN` (sync=false in YAML, so it
   must be set manually).
4. Once deployed, copy the public URL.
5. In Vercel (Next.js project) add env vars:
   - `SOFASCORE_SERVICE_URL=https://<render-service>.onrender.com`
   - `SOFASCORE_SERVICE_TOKEN=<same value>`

> On Render's free starter plan the container sleeps after 15 min of
> inactivity. Live-match polling keeps it warm during peak hours but cold
> starts add ~1s. Bump to a paid tier for production traffic.

### Railway

```bash
railway init
railway up
railway variables set SERVICE_TOKEN=...
```

Set the Vercel env vars the same way.

## Notes / limitations

- SofaScore rate-limits aggressively. Cache TTLs above are tight defaults;
  raise them if you see 429s.
- SofaScore fingerprints clients at the TLS layer (ja3), so plain `requests`
  / `httpx` / `cloudscraper` get a 403. The bridge uses `curl_cffi` which
  impersonates a real Chrome TLS handshake; `cloudscraper` remains as a
  fallback for the rare 429/503.
- The bridge currently does **not** persist data — it's a stateless cache in
  front of SofaScore. If you later want history beyond what SofaScore keeps,
  add a sink to Supabase from the route handlers.
- `LanusStats` is imported only for analytics enrichment (shotmaps as
  DataFrames). The core endpoints don't depend on it, so if the install
  fails the bridge still boots.

## Project layout

```
python-service/
  app/
    main.py            FastAPI factory + auth middleware + health
    settings.py        env-driven config
    cache.py           thread-safe TTL cache
    sofascore_http.py  curl_cffi (chrome impersonation) + cloudscraper fallback
    sofascore_service.py  service layer: raw API + LanusStats
    transformers.py    SofaScore -> FlashScore-compatible shapes
    routes/
      matches.py
      teams.py
      players.py
      tournaments.py
      search.py
  Dockerfile
  render.yaml
  requirements.txt
  .env.example
```
