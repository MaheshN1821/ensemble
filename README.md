# Ensemble

One selfie, one full-body photo and an occasion become a complete, coordinated look (outfit, jewellery, lipstick) shown on the shopper's own photos. Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

- `client/` React + Vite + Tailwind CSS v4 (JavaScript, `.jsx`). Deploys to Vercel.
- `server/` Node + Express, MongoDB (Mongoose), Cloudinary. Deploys to Render.
- `docs/CONTEXT.md` decisions, contracts and conventions. Start here in a new chat.
- `docs/BUILD_PLAN.md` the 10-step plan with status.

## Run locally

Requirements: Node 20+, a MongoDB Atlas connection string, a YouCam API key, a Cloudinary account.

```bash
npm run install:all

cp server/.env.example server/.env    # fill in MONGODB_URI, YOUCAM_API_KEY, CLOUDINARY_*
cp client/.env.example client/.env    # leave VITE_API_URL empty locally

npm run dev:server    # http://localhost:8080  (health: /healthz)
npm run dev:client    # http://localhost:5173  (proxies /api to the server)
```

Open http://localhost:5173/system. It should show every service as connected. Use **Fetch live prices** (free) first,
then **Run skin tone analysis** with a selfie to push one real task through the queue and see it land in the ledger.

Sample catalog images are placeholders generated offline: `npm --prefix server run assets` (free). For AI-generated
images later: `npm --prefix server run assets -- --ai --yes --only <itemId>` (spends units; see the script header).

```bash
npm test    # server tests run against a local mock of the YouCam API and spend no units
```

## Deploy

**Server on Render:** New > Blueprint > select this repo (uses `render.yaml`). Set the secret env vars it lists.
Use the `starter` plan so the instance never sleeps during judging.

**Client on Vercel:** New Project > select this repo > set **Root Directory** to `client`. Set `VITE_API_URL` to the Render URL.
Then add the Vercel URL to `CLIENT_ORIGINS` on Render and redeploy the server.

**MongoDB Atlas:** allow Render's outbound IPs (or `0.0.0.0/0` for the hackathon) under Network Access.

## How looks are planned
The planner is deterministic and free (no YouCam call, no language model): `server/src/config/planner.js` holds the weights and rules, `server/src/services/planner/` the search. Same inputs always give the same three looks, and the budget is a hard limit. Open `/looks` after the colour profile.

## How looks are drawn
Choose a look and the server draws it in stages on your own photos through the YouCam API: the outfit on the full-length photo, then earrings, necklace and lipstick on the selfie. Each result is cached, so drawing the same look again costs no units, and a failed step is retried without paying twice. Progress streams live to the look page. Set `SHARE_SECRET` on the server so 24-hour share links survive restarts. Set `PUBLIC_CLIENT_URL` to the client's address so the server can read the sample photos and sample catalog images.

## How looks are refined
Open a look and use **Change this look**: tap a chip (more or less formal, warmer lipstick, different jewellery, cheaper, change colour family) or type a request such as "less formal, warmer lipstick". A language model (optional, set `LLM_API_KEY`) only reads the request into a fixed list of operations and rephrases the planner's facts; the deterministic planner still picks every item and the budget stays a hard limit. Without a key, chips and a keyword reader do the same job. Only the stages whose inputs changed are drawn again. **Under the hood** streams every step with its time and units, and the limits panel shows units used against the session cap. Code: `server/src/services/agent/`, config in `server/src/config/agent.js`.
