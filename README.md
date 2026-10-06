# SLSEA Solar Generation Data API

REST API that serves real-time and historical generation data from rooftop solar installations for the
**Sri Lanka Sustainable Energy Authority (SLSEA)**. NB6007CEM Web API Development coursework.

- **Write-clients:** smart meters. Each logs in as its installation and can only push readings for it.
- **Read-clients:** SLSEA users (analysts, installation officers, admins), limited to their jurisdiction.
- **Backend only.** The Swagger UI is the interface.

> **Status:** starter (phase L0). **Start here:** `docs/BUILD-PROMPTS.md`. Build order and acceptance checks: `docs/IMPLEMENTATION-GUIDE.md` §6.

---

## Requirements

- **Node.js 24 LTS** (`.nvmrc` says 24 — with nvm: `nvm use`)
- **MongoDB 8** locally — Docker or MongoDB Community Server
- **MongoDB Compass** (optional) — to look at the data
- **Postman** (optional) — command-line runs use Newman through `npx` (downloaded on first use, not installed in the project)
- **Git**

## Quick start

1. Install packages:
   ```bash
   npm install
   ```
2. Start a local MongoDB (Docker example):
   ```bash
   docker run -d --name slsea-mongo -p 27017:27017 mongo:8
   ```
3. Create your `.env` from the example and fill in the secrets:
   ```bash
   cp .env.example .env
   ```
4. Run with auto-reload:
   ```bash
   npm run dev
   ```
5. Check: `http://localhost:3000/` → `{"status":"ok","service":"slsea-solar-api"}`
6. From phase L2 on, fill the database:
   ```bash
   npm run seed                 # writes data/seed/*.json and seed-output/ (L1)
   npm run seed:load            # loads them into MONGODB_URI (add -- --drop to reload)
   npm run db:check             # checks counts and rules
   ```

## Environment variables (`.env`)

- `.env` is **git-ignored** — never commit it. Only `.env.example` is committed.
- Real environment variables win over `.env`. `src/config.js` loads the file with Node's built-in `process.loadEnvFile()` (no `dotenv` package).

Example `.env` for local development:

```dotenv
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/slsea
PUBLIC_BASE_URL=http://localhost:3000
JWT_SECRET=paste-a-long-random-value-here
JWT_TTL_MINUTES=60
BOOTSTRAP_ADMIN_USERNAME=hq.admin
BOOTSTRAP_ADMIN_PASSWORD=choose-a-strong-password
BOOTSTRAP_ADMIN_NAME=SLSEA Head Office Admin
ORIGIN_SECRET=
```

| Variable | What it is |
|---|---|
| `PORT` | Port the app listens on (3000) |
| `NODE_ENV` | `development` locally, `production` on EC2 (set by pm2) |
| `MONGODB_URI` | Local MongoDB, or the Atlas connection string in production |
| `PUBLIC_BASE_URL` | Base of every URL the API returns (`Location`, `next`, `previous`). Production: the API Gateway invoke URL |
| `JWT_SECRET` | Token signing key. Generate: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `JWT_TTL_MINUTES` | Token lifetime (60) |
| `BOOTSTRAP_ADMIN_*` | The first ADMIN (`hq.admin`), created at start-up only when there are no users |
| `ORIGIN_SECRET` | **Production only.** Same value API Gateway adds as `X-Origin-Secret`. Empty locally = guard off |

## npm scripts

| Script | What it does | Ready from |
|---|---|---|
| `npm run dev` | Start with nodemon (restarts on changes in `src/`) | L0 |
| `npm start` | Start once with Node (pm2 uses `ecosystem.config.js` instead) | L0 |
| `npm run seed` | Generate `data/seed/*.json` + `seed-output/` (device secrets, test device) | L1 |
| `npm run seed:load` | Load the seed files into `MONGODB_URI` (`-- --drop` empties the five seed collections first; never touches `users`) | L2 |
| `npm run db:check` | Check the loaded database against the expected counts | L2 |
| `npm run test:local` | Run the Postman collection against localhost (Newman) | L0 |
| `npm run test:prod` | Run it against the deployed API | D4 |
| `npm run simulate` | Device simulator | D5 |

## Project structure

```
src/
  server.js        start-up: (L2) connect to MongoDB, (L4) bootstrap hq.admin, listen, graceful shutdown
  app.js           Express app: design rules, health check, (L3) middleware order, routers, 404, errors
  config.js        environment variables
  routes/          wiring only — one router per resource family (path, method, middleware, handler)
  controllers/     read the request, call lib/models, send the response
  middleware/      origin guard, Accept, auth, scope, conditional requests, errors
  lib/             shared logic: area, derived values, ETag, pagination, validation, representations
  models/          one Mongoose model per entity: Province, District, Substation, Installation, Reading, User
  openapi/         the OpenAPI document served at /solar/v1.0/openapi
scripts/           generate-seed.js (L1), load-seed.js + db-check.js (L2), simulate.js (D5)
data/seed/         seed files, one per collection (L1); readings.json is git-ignored
postman/           collection + environment templates
docs/              design logs 01–04, implementation guide, AI log, report plan
```

- Why this layout: `docs/04-architecture-and-deployment.md` §3.2.
- Every `express.Router()` must be created with `{ strict: true, caseSensitive: true }` (routers don't inherit the app's settings).

## Testing with Postman / Newman

1. Copy the environment template and fill in the secrets (the copy is git-ignored):
   ```bash
   cp postman/local.postman_environment.json postman/local.private.postman_environment.json
   ```
   Fill `admin_password`, `test_password`, `device_installation_id`, `device_secret`.
2. Run everything, or one phase together with the folders before it:
   ```bash
   npm run test:local
   npm run test:local -- --folder "L7 Installations" --folder "L8 Readings"
   ```
- **One folder per build phase.** A phase is done when its folder passes.
- **Tokens are fetched automatically** — requests use `Bearer {{tok_<name>}}`.
- **Every response is checked against the API contract** (tests named `[contract]`).
- In the Postman app: import the collection and the private environment. If the database is reset, clear the collection's `tok_*` variables.

## Deployment (phases D1–D5)

- Steps: `docs/IMPLEMENTATION-GUIDE.md` §6.2 and §6.4. Architecture: `docs/04-architecture-and-deployment.md`.
- Shape: **API Gateway (HTTPS) → EC2 (pm2) → MongoDB Atlas**. Only environment variables change between local and production.
- On the server:
  ```bash
  npm ci --omit=dev
  pm2 start ecosystem.config.js && pm2 save && pm2 startup
  # every later deploy:
  git pull && npm ci --omit=dev && pm2 reload slsea-api
  ```

## For the marker (filled in at D4)

- **Live API:** `https://<api-id>.execute-api.<region>.amazonaws.com/solar/v1.0`
- **Swagger UI:** `…/solar/v1.0/docs`
- **Accounts:** `hq.admin`, `nat.analyst`, `west.analyst`, `colombo.analyst`, `kandy.analyst`, `colombo.officer`
- **Test device:** installation id and secret

## Design documents

| File | Contents |
|---|---|
| `docs/01-data-model-design-log.md` | Entity model and its decisions (D1–D19) |
| `docs/02-scope-decisions.md` | Scope, use cases, edge cases, limitations |
| `docs/03-resource-model-and-uris.md` | Resources, URIs, methods, headers, status codes, errors, security |
| `docs/04-architecture-and-deployment.md` | Architecture, code layout, AWS deployment |
| `docs/IMPLEMENTATION-GUIDE.md` | Build plan, data, routes, representations, phases |
| `docs/AI-LOG.md` | Every AI prompt, generator mistake and fix (report appendix) |
| `docs/BUILD-PROMPTS.md` | Step-by-step build guide with a prompt for every phase |
| `docs/REPORT-PLAN.md` | Report sections and word budget |
| `CLAUDE.md` | Standing rules for the coding agent (read at the start of every session) |

## AI use

AI-generated code is permitted and declared. Every prompt, mistake found and fix is recorded in `docs/AI-LOG.md`.
