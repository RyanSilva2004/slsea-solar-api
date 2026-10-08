# SLSEA Real-Time Solar Generation Data API

| | |
|---|---|
| Student | K D R Silva|
| NIBM index | BSCCOMP24.2P-059 |
| Coventry index | 16110614 |
| Module | NB6007CEM Web API Development |
| Live API | _to be added_ |
| Live OpenAPI (Swagger UI) | _to be added_ |
| Repository | https://github.com/RyanSilva2004/slsea-solar-api |

A JSON REST API for the Sri Lanka Sustainable Energy Authority (SLSEA). Smart meters write
generation readings for their own installation; SLSEA users read data inside their jurisdiction.
Base path: `/solar/v1.0`. The full specification is in [`docs/IMPLEMENTATION-GUIDE.md`](docs/IMPLEMENTATION-GUIDE.md).

## Architecture

<!-- architecture diagram: docs/architecture.png -->
![](docs/architecture.png)

Request path: client → API Gateway → Caddy → Node/Express → MongoDB Atlas

## Features

- **Endpoint groups**
  - token: `POST /token`
  - geography: `/provinces`, `/districts`, `/substations`
  - installations: list, create, replace, delete, overview, device credential
  - readings: per-installation history and ingestion, single reading, last-known reading, district and province readings
  - summaries: district, province and national generation summaries
  - users: user accounts and password changes
- **Write–read split.** Device tokens (client-credentials grant, scope `readings:write`) can only post readings for their own installation. User tokens (password grant) read data, and their scopes depend on the role: `ANALYST`, `INSTALLATION_OFFICER` or `ADMIN`.
- **Jurisdiction scoping.** Each user is `DISTRICT`, `PROVINCIAL` or `NATIONAL`. An installation outside the caller's area answers 404. A region outside the area answers 403 `40302`.
- **Pagination, filtering, sorting**
  - Collections return `{ count, next, previous, items }` and take `offset` and `limit` (1–100, default 20).
  - Filters: `province-id`, `district-id`, `substation-id`, `status`, `reporting-status`, `role`, `jurisdiction-level`, plus `from` / `to` time windows.
  - Readings sort with `sort=recorded-at:desc|asc`.
- **Conditional requests**
  - Every GET returns `ETag` and `Last-Modified`. `If-None-Match` or `If-Modified-Since` gets 304.
  - `PUT` and `DELETE` on installations and users require `If-Match`: 403 `40303` when it is missing, 412 `41201` when it is stale.
- **Error body.** Every error has exactly four fields: `code`, `message`, `description`, `error` (always an array). The full code table is in the Swagger UI description.
- **Rate limits**
  - `POST /token`: 10 failed requests per 15 minutes per username or installation. A success resets the count.
  - `POST /installations/{installation-id}/readings`: 120 requests per minute per device installation.
  - Over the limit you get 429 `42901` with `Retry-After`.
- **Security headers**
  - `X-Content-Type-Options: nosniff` on every response. `Strict-Transport-Security` when served over `https://`.
  - `Cache-Control: no-store` on token and secret responses. No CORS headers.
  - Optional origin guard via `X-Origin-Secret`.
- **OpenAPI.** An OpenAPI 3.0.3 document at `/openapi`, and Swagger UI at `/docs` with password and client-credentials sign-in.

## Tech stack

| Item | Version |
|---|---|
| Node.js | 24 LTS (ES modules, `node --env-file`, `node --watch`, `node:test`) |
| express | ^5.2.1 |
| mongoose (MongoDB Atlas) | ^8.24.5 |
| jsonwebtoken (HS256) | ^9.0.3 |
| bcryptjs | ^3.0.3 |
| express-rate-limit | ^8.7.1 |
| swagger-ui-express (OpenAPI 3.0.3) | ^5.0.1 |
| Seed tool | Python 3 + pymongo ≥ 4.6 |
| Process manager (production) | pm2 (global install, not a dependency) |

## Run locally

Requirements: Node.js 24, and a MongoDB Atlas cluster that has already been seeded.

1. In Atlas → Network Access, add your laptop's IP address.
2. Install and configure:
   ```bash
   git clone https://github.com/RyanSilva2004/slsea-solar-api.git
   cd slsea-solar-api
   npm install
   cp .env.example .env      # then fill in the values; never commit .env
   ```
3. Start the API (on first start, with no users in the database, it creates the bootstrap admin from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`):
   ```bash
   npm run dev
   ```
4. In a second terminal, create the test accounts (run it again and it skips accounts that already exist):
   ```bash
   npm run accounts
   ```

**Seeding (database owner only).** The Atlas database is already seeded. To re-seed (this drops and recreates the data), run from `seed/`:

```bash
cd seed
pip install -r requirements.txt
python3 seed_slsea.py --uri "<MONGODB_URI>" --drop
```

It writes device secrets to `seed/seed-output/`, which is git-ignored.

**`.env` variables** (see `.env.example`):

| Name | Used for |
|---|---|
| `PORT` | HTTP port |
| `MONGODB_URI` | the seeded Atlas database |
| `PUBLIC_BASE_URL` | base of every absolute URL the API returns (no trailing slash) |
| `JWT_SECRET` | token signing (at least 32 characters) |
| `BOOTSTRAP_ADMIN_USERNAME` | first admin's username (default `hq.admin`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | first admin's password (10–72 characters, at most 72 bytes in UTF-8) |
| `ORIGIN_SECRET` | origin guard; leave empty locally |
| `TEST_BASE_URL` | base URL for tests and scripts |
| `TEST_ACCOUNT_PASSWORD` | password of the test accounts |
| `SIM_DEVICES_FILE` | device list for the simulator |
| `SIM_SKIP` | installations the simulator skips |

**npm scripts**

| Script | What it does |
|---|---|
| `npm start` | start the API |
| `npm run dev` | start the API and restart on file changes |
| `npm test` | full test suite (server must be running) |
| `npm run test:smoke` | read-only smoke tests, safe against production |
| `npm run accounts` | create the test accounts |
| `npm run simulate` | device simulator (`scripts/simulate.js` is added in step D2) |

**Local URLs**

| What | URL |
|---|---|
| API base | http://localhost:3000/solar/v1.0 |
| Swagger UI | http://localhost:3000/solar/v1.0/docs |
| OpenAPI JSON | http://localhost:3000/solar/v1.0/openapi |
| Health | http://localhost:3000/ |

## Test accounts, examples and tests

### Test accounts

Created by `npm run accounts`, all with the password from `TEST_ACCOUNT_PASSWORD`. The bootstrap admin (`hq.admin` by default) uses `BOOTSTRAP_ADMIN_PASSWORD`.

| Username | Role | Level | District |
|---|---|---|---|
| `colombo.analyst` | ANALYST | DISTRICT | 1 Colombo |
| `kandy.analyst` | ANALYST | DISTRICT | 4 Kandy |
| `western.analyst` | ANALYST | PROVINCIAL | 1 Colombo (Western province) |
| `central.analyst` | ANALYST | PROVINCIAL | 4 Kandy (Central province) |
| `national.analyst` | ANALYST | NATIONAL | 1 |
| `colombo.officer` | INSTALLATION_OFFICER | DISTRICT | 1 Colombo |
| `kandy.officer` | INSTALLATION_OFFICER | DISTRICT | 4 Kandy |
| `hq.admin` | ADMIN | NATIONAL | 1 |

### Edge-case installations

| Installation | District | Substation | Kind | Status | Credential | Readings |
|---|---|---|---|---|---|---|
| `INS-000001` | 1 Colombo | 1 | never reported | ACTIVE | none | 0 |
| `INS-000002` | 1 Colombo | 2 | silent | ACTIVE | yes | 648 (stop 6 h before seed end) |
| `INS-000003` | 1 Colombo | 3 | decommissioned | DECOMMISSIONED | none | 384 (stop 3 days before seed end) |
| `INS-000064` | 4 Kandy | 8 | never reported | ACTIVE | none | 0 |
| `INS-000065` | 4 Kandy | 9 | silent | ACTIVE | yes | 648 |
| `INS-000066` | 4 Kandy | 8 | decommissioned | DECOMMISSIONED | none | 384 |

`INS-000004` (Colombo, substation 1) is a normal site. Its device secret is in `seed/seed-output/test-device.json` on the machine that ran the seed.

### curl examples

The examples read secrets from your shell, so nothing secret is typed into the command:

```bash
set -a; . ./.env; set +a
BASE=http://localhost:3000/solar/v1.0
```

User token (password grant):

```bash
TOKEN=$(curl -s -X POST $BASE/token \
  -d grant_type=password -d username=colombo.analyst \
  --data-urlencode "password=$TEST_ACCOUNT_PASSWORD" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
```

Device token (client-credentials grant, HTTP Basic `installation_id:device_secret`):

```bash
DEVICE_SECRET=$(node -pe 'JSON.parse(require("fs").readFileSync("seed/seed-output/test-device.json")).device_secret')
DEVICE_TOKEN=$(curl -s -X POST $BASE/token -u "INS-000004:$DEVICE_SECRET" \
  -d grant_type=client_credentials \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
```

Reading data:

```bash
curl -s "$BASE/installations?district-id=1&limit=5" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/installations/INS-000004/overview" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/installations/INS-000004/readings?sort=recorded-at:asc&limit=3" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/districts/1/generation-summary" -H "Authorization: Bearer $TOKEN"
```

Conditional GET (send the `ETag` back and get `304 Not Modified`):

```bash
curl -s -i "$BASE/provinces" -H "Authorization: Bearer $TOKEN" | grep -i '^etag'
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/provinces" \
  -H "Authorization: Bearer $TOKEN" -H 'If-None-Match: "<etag from above>"'
```

Posting a reading (device token; `recorded_at` must be within the last 7 days and no more than 2 minutes ahead):

```bash
curl -s -X POST "$BASE/installations/INS-000004/readings" \
  -H "Authorization: Bearer $DEVICE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"recorded_at":"2026-10-07T08:15:00Z","power_kw":3.4,"energy_kwh":10234.6,"voltage":236.4}'
```

In query strings, write a `+` time-zone offset as `%2B`, e.g. `from=2026-10-07T00:00:00%2B05:30`.

### Running the tests

The tests use Node's built-in runner against a running server (`TEST_BASE_URL`). Before running them, the database must be seeded and the test accounts created (`npm run accounts`).

```bash
npm run dev          # terminal 1
npm test             # terminal 2: full suite
```

The read-only smoke suite (`npm run test:smoke`) is safe against production. When `ORIGIN_SECRET` is set, the tests and scripts send it as `X-Origin-Secret`.

Write tests create their own installations with a `meter_id` starting with `TEST-`. They never change the seeded installations.

## Project structure

- `src/controllers/`: one file per routes file; turns a request into lib/model calls and a response
- `src/lib/`: shared logic: errors, geography cache and areas, derived values, HTTP caching, pagination, query parsing, validation, representations, ids, time, tokens, secrets, audit log
- `src/middleware/`: security headers, origin guard, content negotiation, authentication, scopes, rate limits, JSON body, 404/405, error handler
- `src/models/`: one Mongoose model per collection
- `src/openapi/`: the OpenAPI 3.0.3 document
- `src/routes/`: paths, methods and the middleware chain of each endpoint

## Deployment

The API runs on an EC2 instance as one process under pm2 (`ecosystem.config.cjs`: app `slsea-api`, `src/server.js` with the `.env` next to `ecosystem.config.cjs`, whatever folder pm2 is started from, 1 instance, restart above 300 MB).

**First install**

```bash
# Node.js 24 LTS (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24

npm install -g pm2

git clone <repository URL> slsea-solar-api
cd slsea-solar-api
npm ci --omit=dev
# create .env with the variables listed under "Run locally":
#   PUBLIC_BASE_URL is the public https:// URL; ORIGIN_SECRET is set
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints, so pm2 starts on boot
```

**Update**

```bash
git pull && npm ci --omit=dev && pm2 reload slsea-api
```

**Automatic deployment**

`main` is the development branch; a release is `git push origin main:live`. The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the `check` job (`npm ci`, `node --check` on `src/` and `scripts/`) on every push to `main` and `live`. A push to `live` then runs `scripts/deploy.sh` on the EC2 instance through AWS Systems Manager (OIDC role, no access keys): fast-forward to `origin/live`, `npm ci --omit=dev`, `pm2 startOrReload`, `pm2 save` and a 30-second health check, rolling back to the previous commit on any failure. Last, it runs `tests/smoke.test.js` against the public URL. The deploy and smoke jobs run only when the repository variable `AWS_ROLE_ARN` is set (with `AWS_REGION`, `EC2_INSTANCE_ID` and `PUBLIC_API_URL`); the smoke job reads the secret `TEST_ACCOUNT_PASSWORD`.

**Production behaviour**

- With `ORIGIN_SECRET` set, every request without the matching `X-Origin-Secret` header gets 403 `40309`.
- With an `https://` `PUBLIC_BASE_URL`, every response carries `Strict-Transport-Security: max-age=31536000`. Every absolute URL the API returns (`Location`, `Content-Location`, paging links, OpenAPI `servers` and `tokenUrl`) is built from `PUBLIC_BASE_URL`.
- Check a deployment with `npm run test:smoke`, with `TEST_BASE_URL` set to the public URL.
