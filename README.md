# Ensemble

One selfie, one full-body photo and an occasion become a complete, coordinated look (outfit, jewellery, lipstick) shown on the shopper's own photos. A deterministic planner picks items within the shopper's budget, the shopper refines the look in plain words, and a retailer can load their own catalog and see anonymous usage counts. Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

- `client/` React + Vite + Tailwind CSS v4 (JavaScript). Deploys to Vercel.
- `server/` Node 20 + Express, MongoDB (Mongoose), Cloudinary. Deploys to Render.
- `docs/CONTEXT.md` decisions, API contracts and conventions. Start here in a new chat.
- `docs/BUILD_PLAN.md` the 10-step plan with status.

## What you need

| Service | Used for | Cost |
|---|---|---|
| Node 20 or newer | server and client | free |
| MongoDB Atlas (free M0 cluster) | sessions, ledger, catalogs, counters. Metadata only, never images | free |
| YouCam API key | skin tone, outfit, jewellery and lipstick try-on | 1,000 free units per hackathon participant |
| Cloudinary account | temporary storage for photos and drawn results | free tier is enough |
| Language model key (optional) | reading typed refinements. Without it, chips and a keyword reader still work | optional |

## Run it from scratch

```bash
npm run install:all                      # installs server and client

cp server/.env.example server/.env       # then fill in the four values below
cp client/.env.example client/.env       # leave VITE_API_URL empty locally

npm run dev:server                       # http://localhost:8080   health: /healthz
npm run dev:client                       # http://localhost:5173   proxies /api to the server
```

Fill in `server/.env`:

- `MONGODB_URI` from Atlas (Database > Connect > Drivers). Allow your IP under Network Access.
- `YOUCAM_API_KEY` from your hackathon registration. Indian participants use the regional link on the hackathon page.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` from the Cloudinary dashboard.
- `SHARE_SECRET` any long random string (32+ characters). Without it share links stop working when the server restarts.

The server refuses to start with a readable message if a required value is missing or malformed.

### First checks (about 5 minutes, spends 1 to 3 units)

1. Open http://localhost:5173/system. Every service should read as connected.
2. Press **Fetch live prices** (free). This is the real YouCam price list; it pins the unit costs shown in the app.
3. Go to the landing page, choose **Use a sample model** (spends nothing), then walk through details, colours and looks.
4. Choose a look and press **See it on me**. This draws on the sample model and spends about 4 units. The ledger on `/system` and the **Under the hood** panel show every call, its time and its units.
5. Open **Catalog** to see the sample catalog and, under it, the live retailer counts. Your look from step 4 is already counted there.

Items that cannot be confirmed without a live key are listed in `docs/CONTEXT.md` under "Needs verifying". The first live run settles them.

### Tests

```bash
npm test                  # server: 134 tests against mocks. Spends no units, needs no network or database
npm --prefix client test  # client logic tests
npm run build             # production client build
```

The server tests use in-memory stand-ins for MongoDB, Cloudinary and a local mock of the YouCam API, so a reviewer can run them with nothing configured.

## How it works

**Planning** is deterministic and free (no YouCam call, no language model). `server/src/config/planner.js` holds the weights and rules, `server/src/services/planner/` the search. The same inputs always give the same three looks, and the budget is a hard limit.

**Drawing** happens in stages on the shopper's own photos: the outfit on the full-length photo, then earrings, necklace and lipstick on the selfie. Each result is cached by photo and item, so a repeat costs no units, and a failed step is retried without paying twice. Progress streams live to the look page.

**Refining** works by tapping a chip or typing a request such as "less formal, warmer lipstick". A language model (optional) only turns the request into a fixed list of operations and rephrases facts the planner produced. The planner still picks every item and the budget stays a hard limit. Only the stages whose inputs changed are drawn again.

**Under the hood** (header, any page) streams every step with its tool, time and units. The limits panel shows units used against the session cap.

## The retailer view

A retailer imports a catalog (CSV or JSON, with a validation report) and gets two private links: a shopper link and a manage link. The manage link opens the catalog and a usage view with:

- sessions that planned a look from the catalog
- looks generated, and the average units spent per drawn look
- most chosen items
- what shoppers change (lipstick, formality, budget and so on)
- sessions where nothing fit the budget

Counts are anonymous: no photos, no skin readings, no names, no network addresses and no typed text. Until a real session happens every count is zero and the page says so. **Download CSV** exports the same numbers. The sample catalog's counts are public (the sample catalog is too), which is how you see the view working without importing anything: header > **For retailers** > the link to the sample catalog, or **Catalog**.

How a session is counted: it counts once, when it first plans a look from that catalog. A look counts once, when it is really going to be drawn; a look refused by a spending cap, a retry, and a look drawn again from cache do not count again. Code: `server/src/services/metrics/`, `server/src/routes/stats.js`.

## Limits and spending caps

Spending stops cleanly: a look that would go over a cap is refused before anything is sent to YouCam, with a plain message, and looks already drawn stay available.

| Limit | Default | Setting |
|---|---|---|
| Units per session | 120 | `SESSION_UNIT_CAP` |
| Units per day, whole app | 900 (of the 1,000 free) | `GLOBAL_DAILY_UNIT_CAP` |
| Stage runs per session | 30 | `SESSION_RENDER_CAP` |
| Refinements / model calls per session | 40 / 60 | `AGENT_SESSION_TURN_CAP`, `AGENT_SESSION_LLM_CAP` |
| YouCam requests | 4 per second, 230 per 5 min (documented: 5 and 250) | `YOUCAM_RATE_PER_SECOND`, `YOUCAM_RATE_PER_WINDOW` |
| Per IP: all API requests | 120 per minute | `LIMIT_REQUESTS_PER_MINUTE` |
| Per IP: new sessions | 30 per hour | `LIMIT_SESSIONS_PER_HOUR` |
| Per IP: photo uploads | 40 per hour | `LIMIT_UPLOADS_PER_HOUR` |
| Per IP: skin readings | 12 per hour | `LIMIT_SKIN_PER_HOUR` |
| Per IP: looks started or retried | 24 per hour | `LIMIT_RENDERS_PER_HOUR` |
| Per IP: refinements | 60 per hour | `LIMIT_AGENT_TURNS_PER_HOUR` |
| Per IP: shared-look views / usage views | 90 / 30 per minute | `LIMIT_SHARE_VIEWS_PER_MINUTE`, `LIMIT_STATS_PER_MINUTE` |
| Per IP: catalog imports | 12 per hour | `CATALOG_IMPORTS_PER_HOUR` |

A per-IP limit of `0` turns that limit off. Over a limit the API answers 429 `RATE_LIMITED` with a `Retry-After` header. The active values are visible at `/api/system/status`.

If you run behind a proxy other than Render's single proxy, check `trust proxy` in `server/src/app.js`, or every visitor will look like one IP.

## Privacy and data lifecycle

| Data | Where | Removed |
|---|---|---|
| Uploaded photos and drawn results | Cloudinary, `ensemble/<session>/`, type `authenticated`, tagged `session_<id>` | **Delete everything** button, or at session end (24 hours) by the sweeper |
| Finished YouCam tasks | YouCam (they keep results for a limited time) | Deleted right after each result is copied to our storage; retried by the sweeper and the delete button |
| Session record (consent, preferences, colour numbers, look metadata) | MongoDB | With the session. Holds no images and no face data |
| Unit ledger (feature, units, time. No images, no photos) | MongoDB | After 30 days |
| Usage counters | MongoDB | Numbers only. Removed with the catalog |
| Agent trace ("Under the hood") | Server memory | With the session, or on restart |
| Share links | Nowhere: signed tokens | Expire after 24 hours or when the session ends. Pictures stream through the server, never as direct storage links |

Photos are used only to process the request. They are never used for training, and the consent screen says YouCam processes them.

**The sweeper** (`server/src/services/privacy/purge.js`) runs at boot and every `SESSION_SWEEP_MINUTES` (default 5). For each session past its expiry it deletes the stored files by tag, asks YouCam to delete the finished tasks not already deleted, then removes the record. If storage cannot be cleared the record is kept and retried on the next run, so nothing is dropped silently. Its last run is visible at `/api/system/status` under `privacy.sweeper`. This replaces the MongoDB TTL index the sessions used before, which would have deleted the record before the images. On first boot after upgrading the server drops that old index.

Sessions created before this change that already expired may have left files in Cloudinary under `ensemble/`. Delete that folder once in the Cloudinary console if you ran earlier builds with real photos.

**Logs** are structured JSON in production (one line per request, with the request id). Session ids and catalog and share tokens are never logged: tokens are masked in URLs, and a session appears only as a short one-way fingerprint (`sid`) so one visit can be followed.

## Deploy

**Server on Render:** New > Blueprint > select this repo (uses `render.yaml`). Set the secret values it lists. Use the `starter` plan so the instance never sleeps during judging. Health check: `/healthz`.

**Client on Vercel:** New Project > select this repo > set **Root Directory** to `client`. Set `VITE_API_URL` to the Render URL. Then add the Vercel URL to `CLIENT_ORIGINS` on Render, set `PUBLIC_CLIENT_URL` to the same URL (the server fetches sample photos and sample catalog images from it), and redeploy the server.

**MongoDB Atlas:** allow Render's outbound IPs (or `0.0.0.0/0` for the hackathon) under Network Access.

Set `ENABLE_DEV_ROUTES=false` for the final build if you do not want the System page's real-task probe live.

## API at a glance

Full contracts are in `docs/CONTEXT.md`. Anonymous sessions send `X-Session-Id`; catalog links send `X-Catalog-Token`.

- `POST /api/sessions`, `GET /api/sessions/me`, `DELETE /api/sessions/me` (delete everything)
- Intake: `/api/intake/config`, consent, photos, sample model, preferences
- `POST /api/sessions/me/skin-profile`, override
- `GET /api/catalog/sample`, `POST /api/catalogs/import`, `GET /api/catalogs/mine`
- `POST /api/sessions/me/plan`
- `POST /api/sessions/me/looks`, `GET .../looks/:id/events` (live progress), share
- `POST /api/sessions/me/agent/turn`, trace and governor
- `GET /api/catalogs/mine/stats` and `.csv` (manage link), `GET /api/catalog/sample/stats` and `.csv`
- `GET /api/system/status`, `GET /healthz`

## Troubleshooting

- **"Invalid environment" at start**: the message names the variable. Fix `server/.env`.
- **A look stops with "spending limit"**: a cap was reached. See the table above; raise `SESSION_UNIT_CAP` for testing, never above what you have left of the 1,000 units.
- **429 "Too many requests"**: a per-IP limit. Wait for `Retry-After`, or raise the matching `LIMIT_*` value while testing.
- **Sample photos do not load when drawing**: the server fetches them from `PUBLIC_CLIENT_URL`. Locally the Vite dev server must be running.
- **Share link dead after a restart**: `SHARE_SECRET` is not set.
- **Download of a look is blocked**: the browser refused to read the cloud images into a canvas. Save the two pictures one by one instead.

## Repository map

```
client/src   pages/, components/{intake,looks,agent,catalog,ui}, hooks/, lib/
server/src   app.js, index.js, config/, routes/, middleware/, models/, lib/
             services/{youcam,skin,catalog,planner,render,agent,metrics,privacy,storage}/
server/test  mock YouCam server, in-memory fakes, one test file per area
render.yaml  Render blueprint
docs/        CONTEXT.md, BUILD_PLAN.md
```
