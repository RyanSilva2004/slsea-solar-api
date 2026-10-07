# SLSEA Solar Generation API — Implementation Guide

This is the **only** specification for the build. Build exactly what is written here.

---

## 0. Rules for the agent

- This file is the single source of truth. Do not read or rely on any other design document.
- Build the steps in §13 **in order**, one at a time. Do not start a step until the previous one is marked done.
- A step is done when every "Done when" item passes, its tests are added, and it is committed.
- **Review gate.** Before committing a step, list in the step report:
  - (a) every place where the code differs from this file;
  - (b) every rule that was relaxed, reinterpreted or skipped.
  - A rule is never relaxed without the user's approval. An approved change is applied through §0.1.
- After each step, update this file:
  - §14 Progress — status, date, commit hash, short note. The hash of a step is recorded in the next step's commit; no separate commits for hashes.
  - §15 Issues — every bug or wrong output you found and fixed in code (yours included).
  - §16 Open questions — anything unclear or contradictory. Do not guess; ask the user.
  - §17 Change log — every change to this specification (rules in §0.1).
- Commit at least once per step. Message format: `L4: geography endpoints` (step id + short summary).
- Never run `git push`. The user reviews each step and pushes.
- Stop every server or background process you start before the step ends. Nothing may be left listening on `PORT`.
- Do not add endpoints, fields, query parameters, error codes, dependencies or features that are not in this file.
- Never change anything in `seed/` except the git-ignored `seed/seed-output/`, which you only read.
- Never commit `.env` or `seed/seed-output/`.
- The database is the seeded **MongoDB Atlas** cluster, used from the first step. Never drop a collection, never delete or change seeded records directly in the database, and never run the seed tool.
- Write tests (`npm test`) may run against Atlas. Every installation they create uses a `meter_id` starting with `TEST-`. The user re-seeds before submission, which removes test data.
- Keep code plain and readable. Small functions. Comments only where they point to a section of this file (e.g. `// §6.7`).
- Use ES modules (`import`/`export`).

### 0.1 Keeping this specification current

- When anything decided during the build differs from or adds to this file (an answer to an open question, a corrected rule, a new file name, a library constraint, a dropped feature), **edit the section it belongs to** so the section states the rule as it now stands.
- Write statements only: what must be built and how it behaves. No reasons, no history, no "previously" in the section.
- Add one line per edit to §17: date, step, section, the new statement (short).
- Later steps follow the edited sections. Nothing in §15–§17 overrides a section; the section is always the current rule.
- §16 answers are moved into the relevant section (and logged in §17) before the step continues.

---

## 1. What is being built

- A JSON REST API for the Sri Lanka Sustainable Energy Authority (SLSEA).
- Smart meters (devices) **write** generation readings for their own installation only.
- SLSEA users **read** data inside their jurisdiction. Officers also manage installations. Admins manage user accounts.
- Base URL path: `/solar/v1.0`.
- MongoDB already holds the seeded data: provinces, districts, substations, installations, readings. Users are created through the API.

---

## 2. Stack

| Item | Choice |
|---|---|
| Runtime | Node.js 24 LTS, `"type": "module"` |
| Web framework | `express` ^5 |
| Database | MongoDB through `mongoose` ^8 |
| Tokens | `jsonwebtoken` ^9 (HS256) |
| Password hashing | `bcryptjs` ^3 |
| Rate limiting | `express-rate-limit` ^8 (default in-memory store) |
| API docs | `swagger-ui-express` ^5 |
| Built-ins used | `node:crypto`, `node:test`, `node --env-file`, `node --watch` |
| Process manager (production) | `pm2` (installed globally on the server, not a dependency) |
| Seed tool | Python 3 + `pymongo` (already written; do not change) |

- No other runtime dependencies. No dev dependencies.

---

## 3. Repository layout

```
.
├── docs/
│   └── IMPLEMENTATION-GUIDE.md      this file
├── seed/
│   ├── seed_slsea.py                seed tool (DO NOT CHANGE)
│   ├── requirements.txt             pymongo>=4.6
│   └── seed-output/                 device secrets written by the seed tool (git-ignored)
├── src/
│   ├── server.js                    start-up sequence (§5.5) incl. bootstrap admin (§7.9), then listen
│   ├── app.js                       Express app: pipeline order (§6.2), routers, 404/405, error handler
│   ├── config.js                    reads and checks environment variables (§4)
│   ├── models/                      one Mongoose model per collection (§5.1)
│   │   ├── province.js  district.js  substation.js
│   │   ├── installation.js  reading.js  user.js  counter.js
│   ├── routes/                      wiring only: paths, methods, middleware chain
│   │   ├── token.js  geography.js  installations.js  readings.js
│   │   ├── region-readings.js  summaries.js  users.js  tooling.js
│   ├── controllers/                 one file per routes file: request → lib/models → response
│   ├── middleware/
│   │   ├── security-headers.js  origin.js  negotiation.js  authenticate.js  require-scope.js
│   │   ├── rate-limit.js  json-body.js  method-not-allowed.js  not-found.js  error-handler.js
│   ├── lib/
│   │   ├── errors.js                ApiError class + error catalogue (§6.10)
│   │   ├── audit.js                 security audit log lines (§7.12)
│   │   ├── geography.js             in-memory geography cache + area helpers (§7.6)
│   │   ├── derived.js               `latestReadings`, `reportingStatus`, `energyToday`, `summary` (§8)
│   │   ├── http-cache.js            ETag, Last-Modified, conditional GET, If-Match (§6.7, §6.8)
│   │   ├── pagination.js            offset/limit parsing, envelope, next/previous links (§6.4)
│   │   ├── query.js                 query-parameter parsing rules (§6.5)
│   │   ├── validation.js            body validators (§9)
│   │   ├── representations.js       document → JSON shape (§6.3)
│   │   ├── ids.js                   counters and id formats (§5.4)
│   │   ├── time.js                  ISO parsing, Sri Lanka day (§6.6, §8)
│   │   ├── tokens.js                JWT sign/verify (§7.3), role → scopes (§7.1)
│   │   └── secrets.js               device secrets, password hashing, `DUMMY_HASH`, Basic header parsing (§7.2, §7.7, §7.8)
│   └── openapi/
│       └── document.js              OpenAPI 3.0.3 document as a JS object (§10)
├── scripts/
│   ├── create-test-accounts.js      (§11.1)
│   └── simulate.js                  (§11.2, step D2)
├── tests/                           node:test files (§12)
├── ecosystem.config.cjs             pm2 config (step D1)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### 3.1 Where each endpoint lives

| Routes / controller file | Endpoints (§9) |
|---|---|
| `token.js` | EP1 |
| `geography.js` | EP2, EP3, EP4 |
| `summaries.js` | EP5 |
| `installations.js` | EP6, EP7, EP8, EP12 |
| `readings.js` | EP9, EP10, EP11 |
| `region-readings.js` | EP17 |
| `users.js` | EP13, EP14, EP15 |
| `tooling.js` | §10 |

- Several routers may be mounted on the same prefix; each path is declared in exactly one file.

### 3.2 `package.json` scripts

| Script | Command |
|---|---|
| `start` | `node --env-file=.env src/server.js` |
| `dev` | `node --env-file=.env --watch src/server.js` |
| `test` | `node --env-file=.env --test "tests/*.test.js"` |
| `test:smoke` | `node --env-file=.env --test tests/smoke.test.js` |
| `accounts` | `node --env-file=.env scripts/create-test-accounts.js` |
| `simulate` | `node --env-file=.env scripts/simulate.js` |

### 3.3 `.gitignore`

```
node_modules/
.env
seed-output/
__pycache__/
*.log
.DS_Store
seed/seed-output/
```

---

## 4. Environment variables

| Name | Example (local) | Required | Used for |
|---|---|---|---|
| `PORT` | `3000` | yes | HTTP port |
| `MONGODB_URI` | `mongodb+srv://USER:PASS@CLUSTER.mongodb.net/slsea` | yes | the seeded Atlas database (name taken from the URI) |
| `PUBLIC_BASE_URL` | `http://localhost:3000/solar/v1.0` | yes | every absolute URL the API returns; no trailing slash; `https://` in production |
| `JWT_SECRET` | 64 random characters | yes, ≥ 32 chars | token signing |
| `BOOTSTRAP_ADMIN_USERNAME` | `hq.admin` | no (default `hq.admin`) | §7.9 |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | yes when `users` is empty; 10–72 characters whenever set | §7.9 |
| `ORIGIN_SECRET` | empty locally | no | §7.10; guard is off when empty |
| `TEST_BASE_URL` | `http://localhost:3000/solar/v1.0` | tests/scripts (default `PUBLIC_BASE_URL`) | §11, §12 |
| `TEST_ACCOUNT_PASSWORD` | — | tests/scripts | §11.1 |
| `SIM_DEVICES_FILE` | `seed/seed-output/device-credentials.json` | simulator | §11.2 |
| `SIM_SKIP` | `INS-000002,INS-000065` | simulator (this default) | §11.2 |

- `config.js` stops the process with a clear message if a required variable is missing or invalid.
- `config.js` checks that `BOOTSTRAP_ADMIN_PASSWORD`, when set, is 10–72 characters; otherwise it stops the process with a clear message.
- `.env.example` lists every name above with placeholder values and no real secrets.

---

## 5. Database

### 5.1 Collections and fields

- Collection names are fixed (set `collection:` explicitly in each schema): `provinces`, `districts`, `substations`, `installations`, `readings`, `users`, `counters`.
- Schemas: `versionKey: false`, no Mongoose `timestamps` option (times are set by code), `strict: true`.
- Every query uses `.lean()` unless a document is being saved.
- MongoDB's `_id` exists on every document but is **never** returned or used as an API id.

**provinces** (seeded, read-only)

| Field | Type | Notes |
|---|---|---|
| `province_id` | Number (int) | 1–9 |
| `name` | String | |
| `updated_at` | Date | seed time |

**districts** (seeded, read-only)

| Field | Type | Notes |
|---|---|---|
| `district_id` | Number (int) | 1–25 |
| `name` | String | |
| `province_id` | Number (int) | |
| `updated_at` | Date | |

**substations** (seeded, read-only)

| Field | Type | Notes |
|---|---|---|
| `substation_id` | Number (int) | 1–42 |
| `name` | String | |
| `district_id` | Number (int) | |
| `updated_at` | Date | |

**installations**

| Field | Type | Notes |
|---|---|---|
| `installation_id` | String | `INS-` + 6 digits |
| `meter_id` | String | unique |
| `capacity_kw` | Number | > 0 |
| `status` | String | `ACTIVE` \| `DECOMMISSIONED` |
| `substation_id` | Number (int) | |
| `device_secret_hash` | String \| null | SHA-256 hex of the device secret |
| `device_secret_issued_at` | Date \| null | |
| `created_at` | Date | |
| `updated_at` | Date | |

**readings** (append-only)

| Field | Type | Notes |
|---|---|---|
| `reading_id` | Number (int) | |
| `installation_id` | String | |
| `recorded_at` | Date | measurement time (from the device) |
| `received_at` | Date | arrival time (set by the server) |
| `power_kw` | Number | |
| `energy_kwh` | Number | lifetime counter |
| `voltage` | Number | volts |

**users** (not seeded)

| Field | Type | Notes |
|---|---|---|
| `user_id` | String | UUID from `crypto.randomUUID()` |
| `name` | String | |
| `username` | String | unique |
| `password_hash` | String | bcrypt |
| `password_changed_at` | Date | |
| `role` | String | `ANALYST` \| `INSTALLATION_OFFICER` \| `ADMIN` |
| `jurisdiction_level` | String | `NATIONAL` \| `PROVINCIAL` \| `DISTRICT` |
| `district_id` | Number (int) | posting district |
| `created_at` | Date | |
| `updated_at` | Date | |

**counters** (internal)

| Field | Type | Notes |
|---|---|---|
| `_id` | String | `installation_id` or `reading_id` |
| `seq` | Number | last number issued |

### 5.2 Indexes

Declare exactly these in the schemas (they already exist from the seed for the first five collections).

| Collection | Keys | Unique |
|---|---|---|
| provinces | `{ province_id: 1 }` | yes |
| districts | `{ district_id: 1 }` | yes |
| districts | `{ province_id: 1 }` | no |
| substations | `{ substation_id: 1 }` | yes |
| substations | `{ district_id: 1 }` | no |
| installations | `{ installation_id: 1 }` | yes |
| installations | `{ meter_id: 1 }` | yes |
| installations | `{ status: 1 }` | no |
| installations | `{ substation_id: 1 }` | no |
| readings | `{ reading_id: 1 }` | yes |
| readings | `{ installation_id: 1, recorded_at: 1 }` | yes |
| readings | `{ installation_id: 1, received_at: 1 }` | no |
| users | `{ user_id: 1 }` | yes |
| users | `{ username: 1 }` | yes |

- Set `autoIndex: false` on the connection.
- At start-up call `Model.createIndexes()` for every model. **Never** call `syncIndexes()`.

### 5.3 Seed facts (for tests and README)

- Counts: 9 provinces, 25 districts, 42 substations, 240 installations, 159,312 readings.
- Ids: installations `INS-000001`–`INS-000240`; readings 1–159312; meters `SLM-10000001`–`SLM-10000240`.
- Readings cover 7 days at 15-minute steps, ending at the time the seed tool was run.
- Substations: Colombo (district 1) = 1 Kolonnawa, 2 Pannipitiya, 3 Dehiwala. Kandy (district 4) = 8 Kiribathkumbura, 9 Peradeniya.
- Edge-case installations:

| Installation | District | Substation | Kind | Status | Credential | Readings |
|---|---|---|---|---|---|---|
| `INS-000001` | 1 Colombo | 1 | never reported | ACTIVE | none | 0 |
| `INS-000002` | 1 Colombo | 2 | silent | ACTIVE | yes | 648 (stop 6 h before seed end) |
| `INS-000003` | 1 Colombo | 3 | decommissioned | DECOMMISSIONED | none | 384 (stop 3 days before seed end) |
| `INS-000064` | 4 Kandy | 8 | never reported | ACTIVE | none | 0 |
| `INS-000065` | 4 Kandy | 9 | silent | ACTIVE | yes | 648 |
| `INS-000066` | 4 Kandy | 8 | decommissioned | DECOMMISSIONED | none | 384 |

- `INS-000004` (Colombo, substation 1) is a normal site; its secret is in `seed/seed-output/test-device.json` on the machine that ran the seed.
- The Atlas database is already seeded. Re-seeding is done by the user only (before submission), never by the agent or the app:
  `cd seed && python3 seed_slsea.py --uri "<MONGODB_URI>" --drop`
  Run from `seed/`, it writes device secrets to `seed/seed-output/` (git-ignored).

### 5.4 Ids for new records

- `installation_id`: `INS-` + next `installation_id` counter value, zero-padded to 6 digits.
- `reading_id`: next `reading_id` counter value.
- `user_id`: `crypto.randomUUID()`.
- Next value: `Counter.findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })`.
- At start-up, raise each counter to at least the highest stored id: `updateOne({ _id }, { $max: { seq: highest } }, { upsert: true })`.
  - highest installation number = numeric part of the largest `installation_id` (sort descending, take 1), or 0.
  - highest reading id = largest `reading_id`, or 0.
- Gaps are allowed. Numbers are never reused.

### 5.5 Start-up sequence (`server.js`)

1. Load and check config (§4).
2. Connect to MongoDB (`autoIndex: false`).
3. `createIndexes()` for every model.
4. Raise counters (§5.4).
5. Load the geography cache (§7.6).
6. Bootstrap the first admin (§7.9).
7. Start listening on `PORT`. Log one line with the port and `PUBLIC_BASE_URL`.
- Steps 2–6 each log one line: database name; number of models indexed; `installation_id` and `reading_id` counter values after raising; geography counts (provinces, districts, substations); bootstrap admin created or not.
- Any failure in 1–6 → log the error and exit with code 1.

---

## 6. HTTP conventions

### 6.1 Paths and routing

- All API routes live under `/solar/v1.0`.
- Routing is **strict** and **case-sensitive**: `app.set('strict routing', true)`, `app.set('case sensitive routing', true)`, and every `express.Router({ strict: true, caseSensitive: true, mergeParams: true })`.
  - `/installations/` and `/Installations` → 404.
- Each path is declared once with `router.route(path)`, its methods chained, and `.all(methodNotAllowed([...]))` last.
- `app.set('etag', false)` and `app.set('x-powered-by', false)`.
- Unknown path (including other versions such as `/solar/v2.0/...`) → 404 `40403`.
- Known path, method not listed → 405 `40501` with `Allow: <methods>` (e.g. `Allow: GET, POST`).

**Path id formats** (a value that does not match → 404 `40401`):

| Parameter | Pattern |
|---|---|
| `{province-id}`, `{district-id}`, `{substation-id}`, `{reading-id}` | `^[1-9][0-9]*$` |
| `{installation-id}` | `^INS-[0-9]{6}$` |
| `{user-id}` | UUID (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) |

### 6.2 Request pipeline (fixed order)

| Step | Where | Check | Failure |
|---|---|---|---|
| 0 | `security-headers.js` (all requests) | sets the security headers of §6.11 on every response | — |
| 1 | `origin.js` (all requests) | `X-Origin-Secret` equals `ORIGIN_SECRET` (only when set) | 403 `40309` |
| 2 | `tooling.js` | tooling routes (§10) answered here; they skip steps 3–9 | — |
| 3 | `negotiation.js` | if `Accept` is present, `req.accepts('application/json')` must be truthy | 406 `40601` |
| 4 | router | path exists; method allowed | 404 `40403` · 405 `40501` |
| 5 | `authenticate.js` | bearer token valid and current (§7.4) | 401 `40101` · `40102` |
| 6 | `require-scope.js` | effective scopes contain the route's scope (§7.5) | 403 `40301` |
| 7 | `rate-limit.js` (routes listed in §7.11) | request within the limit | 429 `42901` |
| 8 | `json-body.js` (routes with a JSON body) | `Content-Type` is `application/json` (charset allowed), then JSON parses | 415 `41501` · 400 `40001` |
| 9 | controller | in this order: query/body validation (400) → target exists and is in the area (404 / 403) → `If-Match` (403 `40303` / 412) → business rules (409 / 403) → respond |

- `/token` uses its own body handling and its own rate limit (§7.2, §7.11); steps 5–8 do not apply to it.
- `json-body.js` = content-type check, then `express.json({ limit: '16kb' })`. Parse errors → 400 `40001` "Malformed JSON body". Body over 16kb → 400 `40001`. Unsupported charset or content encoding → 415 `41501`.
- A JSON body must be a JSON object; anything else → 400 `40001`.
- Request values reach database filters and updates only after validation as plain strings, numbers or dates. A request object, array or field is never placed into a filter or update as it arrived.
- `error-handler.js` turns `ApiError` into the error body (§6.10). Any other error → log it, 500 `50001`, no stack trace.

### 6.3 Representations

- `Content-Type: application/json; charset=utf-8` on every body (`res.json`).
- snake_case field names everywhere.
- Never returned: `_id`, `device_secret_hash`, `password_hash`, `received_at`, `created_at`, `updated_at`, `password_changed_at`, `device_secret_issued_at`.
- Built explicitly in `lib/representations.js` (pick fields; never spread a document).

| Resource | Shape |
|---|---|
| Province | `{ "province_id": 1, "name": "Western" }` |
| District | `{ "district_id": 1, "name": "Colombo", "province_id": 1 }` |
| Substation | `{ "substation_id": 1, "name": "Kolonnawa", "district_id": 1 }` |
| Installation | `{ "installation_id": "INS-000241", "meter_id": "SLM-10000241", "capacity_kw": 5, "status": "ACTIVE", "substation_id": 1 }` |
| Reading | `{ "reading_id": 159313, "installation_id": "INS-000241", "recorded_at": "2026-10-04T08:15:00.000Z", "power_kw": 3.412, "energy_kwh": 10234.551, "voltage": 236.4 }` |
| User | `{ "user_id": "7c2d…", "name": "Nimali Perera", "username": "nimali.p", "role": "ANALYST", "jurisdiction_level": "DISTRICT", "district_id": 4 }` |

Overview and summary shapes: §9 EP8, EP5. The overview is built by `overview(...)` and the summary by `generationSummary(...)` in `lib/representations.js`.

### 6.4 Collections and pagination

- Every collection response:
  ```json
  { "count": 672, "next": "<absolute url or null>", "previous": "<absolute url or null>", "items": [ ... ] }
  ```
- `count` = total items matching the query (all pages).
- `offset`: integer ≥ 0, default 0. `limit`: integer 1–100, default 20.
- `next` = same URL with `offset = offset + limit`, only if `offset + limit < count`, else `null`.
- `previous` = same URL with `offset = max(0, offset − limit)`, only if `offset > 0`, else `null`.
- Links = `PUBLIC_BASE_URL` + path after the base + every query parameter of the request, with `offset` and `limit` set explicitly.
- `lib/pagination.js`: `paging(query)` → `{ offset, limit }` with defaults; `collection(req, { count, items, offset, limit })` → the envelope.
- Offset beyond `count` → 200 with empty `items`.
- An empty result is 200 with `count: 0` and `items: []`, never 404.

### 6.5 Query parameters

- Each route lists its allowed parameters (§9). Any other parameter → 400 `40002`.
- A parameter given more than once → 400 `40002`.
- `offset`, `limit` invalid → 400 `40002`.
- `province-id`, `district-id`, `substation-id`: integer pattern and must exist in the geography cache → else 400 `40002`.
- `status`: `ACTIVE` | `DECOMMISSIONED`. `reporting-status`: `REPORTING` | `SILENT` | `NEVER_REPORTED`. `role`: the three roles. `jurisdiction-level`: the three levels. Exact upper case → else 400 `40002`.
- `sort`: `recorded-at:desc` (default) | `recorded-at:asc` → else 400 `40002`.
- `from` (inclusive), `to` (exclusive): timestamps per §6.6 → else 400 `40003`. Both given and `from >= to` → 400 `40003`.
- Several filters combine with AND.
- `lib/query.js`: `readQuery(req, allowedNames)` → `{ name: parsedValue }` for the parameters present. Parsing stops at the first invalid parameter; `error[]` holds that one problem.

### 6.6 Timestamps

- Input pattern: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$`, and `Date.parse` must succeed. No offset → rejected.
- Stored as `Date`. Output always `date.toISOString()` (UTC, milliseconds included).
- HTTP date headers (`Last-Modified`, `If-Modified-Since`): `toUTCString()`, compared at whole seconds.

### 6.7 Conditional GET

Every successful GET (200) sends `ETag` and `Last-Modified`.

- **ETag:** strong, `"` + base64url(SHA-256(`JSON.stringify(source)`)) + `"`.
  - `source` = the response body. For summaries (EP5) the body **without** `computed_at`.
- **Last-Modified** (sent floored to the second):

| Resource | Value |
|---|---|
| Province, district, substation (member) | its `updated_at` |
| Province, district, substation lists | latest `updated_at` in that collection |
| Installation (member) | `updated_at` |
| User (member) | `updated_at` |
| Reading (member), last-known reading | the reading's `received_at` |
| `/installations/{id}/readings` | latest `received_at` of that installation; installation `created_at` if it has none |
| Everything else (installation list, user list, overview, summaries, region readings) | time the response is built |

- **Request handling:**
  1. If `If-None-Match` is present: split on commas, trim, drop a leading `W/`. If any value equals the current ETag, or the header is `*` → 304.
  2. Else if `If-Modified-Since` is a valid HTTP date and floor-to-second(Last-Modified) ≤ that date → 304.
  3. Else → 200 with body.
- **304:** status 304, headers `ETag` and `Last-Modified`, no body, no `Content-Type`.
- One helper (`sendWithCaching(req, res, body, lastModified, etagSource?)`) does all of this.

### 6.8 Conditional updates (`If-Match`)

- Required on `PUT` and `DELETE` of installations and users.
- Header missing → 403 `40303`.
- Header is `*`, or any comma-separated value equals the ETag of the **current** representation (same function as GET) → continue.
- Otherwise → 412 `41201`.
- Checked after the target is found (a repeated DELETE gives 404, not 412).
- Helpers in `lib/http-cache.js`: `checkIfMatch(req, currentBody)` (throws `40303` / `41201`); `sendUpdated(res, body, lastModified)` for a successful PUT.
- Successful PUT → 200, body = new representation, new `ETag` and `Last-Modified`.

### 6.9 Create responses

Every POST that creates a record:
- 201, body = the new representation.
- `Location` and `Content-Location` = absolute URL of the new resource.
- `ETag` and `Last-Modified` as for a GET of that resource.
- Helper: `sendCreated(res, body, pathAfterBase, lastModified)` in `lib/http-cache.js`.

### 6.10 Error body and catalogue

Every 4xx and 5xx body:

```json
{
  "code": 40001,
  "message": "capacity_kw must be greater than 0 and at most 1000.",
  "description": "Invalid request body",
  "error": [ { "code": 40001, "message": "capacity_kw must be greater than 0 and at most 1000." } ]
}
```

- `code`: from the table below. `description`: the fixed short title from the table. `message`: detailed text for this case. `error`: an array with one entry per field problem; `[]` when there is none.
- Exactly these four fields, always present.
- Thrown as `new ApiError(code, message, { errors, headers })` (`lib/errors.js`); `headers` carries `Allow` / `WWW-Authenticate` / `Retry-After`.

| HTTP | Code | Description (fixed) | Used when |
|---|---|---|---|
| 400 | 40001 | Invalid request body | missing/unknown/invalid field; malformed JSON; body over 16kb; bad form at `/token` |
| 400 | 40002 | Invalid query parameter | unknown/repeated parameter; bad value; filter not inside the path region |
| 400 | 40003 | Invalid time | bad timestamp; no offset; future/too old reading; `from >= to` |
| 400 | 40004 | Reading value out of range | power, voltage or energy outside limits |
| 400 | 40005 | Energy counter inconsistent | counter below the previous or above the next reading in time |
| 401 | 40101 | Authentication required | no bearer token |
| 401 | 40102 | Invalid token | bad signature, expired, wrong issuer/audience, subject gone or revoked |
| 401 | 40103 | Invalid credentials | wrong username/password or device credentials at `/token` |
| 403 | 40301 | Insufficient scope | effective scopes lack the route's scope |
| 403 | 40302 | Outside jurisdiction | region (path or filter) or substation outside the caller's area |
| 403 | 40303 | Precondition required | `If-Match` missing |
| 403 | 40304 | Installation decommissioned | credential issue or reading for a decommissioned site |
| 403 | 40305 | Own account | ADMIN changing or deleting their own account |
| 403 | 40306 | Wrong installation | device token used for another installation |
| 403 | 40307 | Wrong current password | own password change with a wrong current password |
| 403 | 40308 | Not allowed for this account | password of another user, caller not ADMIN |
| 403 | 40309 | Forbidden origin | origin secret missing or wrong |
| 404 | 40401 | Resource not found | unknown id, hidden asset outside the area, invalid path id |
| 404 | 40402 | No readings yet | last-known reading of an installation without readings |
| 404 | 40403 | Path not found | no route matches |
| 405 | 40501 | Method not allowed | method not listed for the path (always with `Allow`) |
| 406 | 40601 | Not acceptable | `Accept` does not allow `application/json` |
| 409 | 40901 | Conflicting reading | another reading with the same `recorded_at` and different values |
| 409 | 40902 | Meter already registered | `meter_id` used by another installation |
| 409 | 40903 | Installation has readings | DELETE of an installation with readings |
| 409 | 40904 | Username taken | `username` used by another user |
| 412 | 41201 | Precondition failed | stale `If-Match` |
| 415 | 41501 | Unsupported media type | wrong request `Content-Type` |
| 429 | 42901 | Too many requests | a rate limit of §7.11 exceeded (always with `Retry-After`) |
| 500 | 50001 | Internal error | anything unexpected |

### 6.11 Response headers summary

| Header | When |
|---|---|
| `Content-Type: application/json; charset=utf-8` | every response with a body |
| `ETag`, `Last-Modified` | every 200 GET, 304, 201, 200 PUT |
| `Location`, `Content-Location` | every 201 |
| `Content-Location` | last-known reading (EP9); identical reading resend (EP10) |
| `Allow` | every 405 |
| `WWW-Authenticate` | every 401 (values in §7.2, §7.4) |
| `Retry-After` (whole seconds) | every 429 |
| `Cache-Control: no-store` + `Pragma: no-cache` | every `/token` response; device credential 200 (EP12); password 200 (EP15) |
| `X-Content-Type-Options: nosniff` | every response (set by `security-headers.js`) |
| `Strict-Transport-Security: max-age=31536000` | every response when `PUBLIC_BASE_URL` starts with `https://` (set by `security-headers.js`) |

- No CORS headers are sent (no `Access-Control-*` headers on any response).
- A DELETE 200 and the action POSTs that return 200 (EP12, EP15) carry no `ETag` or `Last-Modified`.

---

## 7. Security

### 7.1 Scopes

| Principal | Scopes |
|---|---|
| Device | `readings:write` |
| ANALYST | `geography:read generation:read account:write` |
| INSTALLATION_OFFICER | `geography:read generation:read installations:write credentials:issue account:write` |
| ADMIN | `geography:read users:manage account:write` |

- `lib/tokens.js` holds this table: `roleScopes(role)` and `DEVICE_SCOPES`.

### 7.2 `POST /solar/v1.0/token`

- No bearer token. `Allow: POST`.
- Every `/token` response, errors included, carries `Cache-Control: no-store` and `Pragma: no-cache`.
- Every 401 `40103` carries `WWW-Authenticate: Basic realm="solar"` and writes a `token_rejected` audit line (§7.12).
- Request `Content-Type` must be `application/x-www-form-urlencoded` → else 415 `41501`. Parse with `express.urlencoded({ extended: false, limit: '16kb' })`. Body over 16kb → 400 `40001`.
- Order: content-type check → form parsing → token rate limit (§7.11) → grant handling.
- Unknown form fields are **ignored**.
- `grant_type` missing or not `password` / `client_credentials` → 400 `40001`.

**`grant_type=password` (users)**
- Fields `username`, `password` required as single non-empty values → else 400 `40001`.
- Any `Authorization` header is ignored.
- User not found → `bcrypt.compare(password, DUMMY_HASH)` still runs, then 401 `40103`. `DUMMY_HASH` is a bcrypt hash (cost 10) of a random value, created once when `lib/secrets.js` loads.
- `bcrypt.compare` fails → 401 `40103`.
- Both cases use the same message and `WWW-Authenticate: Basic realm="solar"`.
- Token: `typ: "user"`, `sub: user_id`, `scope` = role scopes (§7.1), `ver = password_changed_at.getTime()`.

**`grant_type=client_credentials` (devices)**
- `Authorization: Basic base64(installation_id:device_secret)` required. Missing or malformed → 401 `40103`.
- Fail with 401 `40103` (same message) when: installation not found, `status` ≠ `ACTIVE`, no `device_secret_hash`, or SHA-256 of the secret does not match (compare with `crypto.timingSafeEqual`).
- Token: `typ: "device"`, `sub: installation_id`, `scope: "readings:write"`, `ver = device_secret_issued_at.getTime()`.

**Response 200** (headers `Cache-Control: no-store`, `Pragma: no-cache`):
```json
{ "access_token": "eyJ…", "token_type": "Bearer", "expires_in": 3600, "scope": "geography:read generation:read account:write" }
```
- All `/token` errors use the normal error body (§6.10).

### 7.3 JWT

- HS256 with `JWT_SECRET`. Lifetime 3600 s.
- Claims: `iss: "slsea-solar-api"`, `aud: "slsea-solar-api"`, `sub`, `typ`, `scope` (space-separated), `ver` (number), `iat`, `exp`.
- Verify with `algorithms: ['HS256']`, issuer and audience checked.

### 7.4 `authenticate.js`

- No `Authorization: Bearer <token>` → 401 `40101`, `WWW-Authenticate: Bearer realm="solar"`.
- Verify fails (signature, expiry, iss, aud, missing claims) → 401 `40102`, `WWW-Authenticate: Bearer realm="solar", error="invalid_token"`.
- `typ: "user"`: load the user by `user_id = sub`. Missing, or `ver` ≠ `password_changed_at.getTime()` → 401 `40102`.
- `typ: "device"`: load the installation by `installation_id = sub`. Missing, `status` ≠ `ACTIVE`, `device_secret_issued_at` null, or `ver` ≠ `device_secret_issued_at.getTime()` → 401 `40102`.
- Sets `req.principal`:
  - user: `{ type: 'user', user, scopes: tokenScopes ∩ roleScopes(user.role), area: areaOf(user) }`
  - device: `{ type: 'device', installation, scopes: tokenScopes ∩ ['readings:write'] }`

### 7.5 `require-scope.js`

- `requireScope(...anyOf)`: passes if `req.principal.scopes` contains at least one listed scope; else 403 `40301`.

### 7.6 Geography cache and areas (`lib/geography.js`)

- At start-up load all provinces, districts, substations into maps: by id, districts by province, substations by district, district of each substation, province of each district.
- Never changes at runtime.
- `areaOf(user)` → set of district ids:
  - `DISTRICT` → `{ user.district_id }`
  - `PROVINCIAL` → every district in the posting district's province
  - `NATIONAL` → all districts
- `districtOfInstallation(inst)` = district of `inst.substation_id`.
- An installation is **in the area** if its district is in the area set.
- A **region is inside the area** if every one of its districts is in the area set (district → itself; province → its districts; substation → its district; national → caller is `NATIONAL`).
- Answers:
  - single installation (and its readings, overview, credential) outside the area → 404 `40401`
  - region in a path or filter, or a substation in a filter or body, outside the area → 403 `40302`
- Provinces, districts and substations are readable by every user (no area check).
- EP2, EP3, EP4 lists and members are served from this cache (filtering and paging in memory).
- Area helpers in `lib/geography.js`: `districtInArea`, `provinceInArea`, `substationInArea`, `installationInArea` (each `(id or installation, area)` → boolean) and `substationsOfArea(area)` → substation ids.

### 7.7 Device credentials

- Secret = `crypto.randomBytes(32).toString('base64url')` (no padding).
- Stored hash = `crypto.createHash('sha256').update(secret, 'utf8').digest('hex')`. (Same as the seed tool.)
- Store `device_secret_hash` and `device_secret_issued_at = now`. Do not change `updated_at`.
- The secret is returned once and never stored in plain text.
- Removed (both fields set to `null`) when the installation becomes `DECOMMISSIONED`.

### 7.8 Passwords

- `bcryptjs.hash(password, 10)`. Length 10–72 characters.
- `password_changed_at = now` on create, change and reset (this revokes older tokens through `ver`).
- Never returned.

### 7.9 Bootstrap admin

- `BOOTSTRAP_ADMIN_PASSWORD` must be 10–72 characters whenever it is set (checked by `config.js`, §4).
- At start-up, if the `users` collection is empty:
  - `BOOTSTRAP_ADMIN_PASSWORD` missing → exit with an error.
  - Create `{ user_id: randomUUID(), name: "HQ Administrator", username: BOOTSTRAP_ADMIN_USERNAME, role: "ADMIN", jurisdiction_level: "NATIONAL", district_id: 1 }` with the hashed password.
- If any user exists, do nothing.

### 7.10 Origin guard

- When `ORIGIN_SECRET` is non-empty, every request (tooling included) must carry `X-Origin-Secret` equal to it (`timingSafeEqual`), else 403 `40309`.
- When empty, the guard is skipped.

### 7.11 Rate limits (`middleware/rate-limit.js`)

| Limiter | Applies to | Key | Window | Limit | Requests counted |
|---|---|---|---|---|---|
| `tokenLimiter` | `POST /token`, after form parsing (§7.2) | `password:<username>` for the password grant; `device:<installation_id>` from the Basic header for client credentials; requests with no usable key are not counted (`skip`) | 15 minutes | 10 | only responses with status ≥ 400 (`skipSuccessfulRequests: true`); a successful token response resets the count for its key |
| `readingsLimiter` | `POST /installations/{installation-id}/readings`, after `require-scope.js`, before `json-body.js` | `installation:<installation_id of the device token>` | 1 minute | 120 | every request |

- `tokenLimiter` has no key for a password grant without a usable `username`, a client-credentials request without a readable Basic header, or any other `grant_type`; such requests are skipped and never counted.
- A 200 from `/token` calls `tokenLimiter.resetKey(key)` for its key before responding.
- Built with `express-rate-limit`: options `windowMs`, `limit`, `keyGenerator`, `skip` and `skipSuccessfulRequests` (token limiter only), `standardHeaders: false`, `legacyHeaders: false`, `validate: false`, default memory store.
- `handler`: `next(new ApiError(42901, …, { headers: { 'Retry-After': seconds } }))`, where `seconds` = whole seconds until `req.rateLimit.resetTime`, at least 1.
- Each 429 writes a `rate_limited` audit line (§7.12).
- Counters live in the process; the API runs as one process (D1).

### 7.12 Audit log (`lib/audit.js`)

- `audit(event, fields)` writes one JSON line to standard output: `{ "time": "<ISO>", "event": "<event>", …fields }`.

| Event | When | Fields |
|---|---|---|
| `token_rejected` | every 401 `40103` at `/token` | `grant` (`password` / `client_credentials` / null), `subject` (username or installation id as sent, or null) |
| `rate_limited` | every 429 | `limiter`, `key` |
| `wrong_installation` | every 403 `40306` | `token_installation`, `path_installation` |

- Never written to the audit log: passwords, device secrets, tokens, `Authorization` headers, request bodies.

---

## 8. Derived values (`lib/derived.js`)

Constants: reporting interval 15 min; silent threshold 30 min; Sri Lanka offset +05:30 (no DST).

- Exports: `latestReadings(ids)` → map id → reading (EP5, EP6, EP8); `reportingStatus(installation, latest, now)` (EP5, EP6, EP8); `energyToday(ids, now)` → map id → contribution (EP5); `summary(installations, now)` → `{ current_power_kw, energy_today_kwh, installations }` (EP5).
- Every "newest reading per installation" aggregation sorts `{ installation_id: -1, recorded_at: -1 }` (the exact reverse of the index `{ installation_id: 1, recorded_at: 1 }`), so no in-memory sort runs. `allowDiskUse` is not used.

- **Latest reading per installation:** aggregation on `readings`: `$match { installation_id: { $in: ids } }` → `$sort { installation_id: -1, recorded_at: -1 }` → `$group { _id: '$installation_id', doc: { $first: '$$ROOT' } }`. Returns a map id → reading.
- **Reporting status** (`now` = request time):
  - `DECOMMISSIONED` → `null`
  - no reading → `NEVER_REPORTED`
  - `now − latest.recorded_at > 30 min` → `SILENT`
  - else → `REPORTING`
- **Sri Lanka day:** `day` = date of `now + 5h30m` as `YYYY-MM-DD`; `dayStart` = that date at 00:00 +05:30 as a UTC instant.
- **Energy today** for one installation:
  - `lastToday` = newest reading with `dayStart ≤ recorded_at ≤ now`. None → contributes 0.
  - `baseline` = newest reading with `recorded_at < dayStart`; if none, the oldest reading with `recorded_at ≥ dayStart`.
  - contribution = `lastToday.energy_kwh − baseline.energy_kwh`.
  - Compute for many installations with two aggregations, not one query per installation:
    - today: `$match { installation_id: { $in: ids }, recorded_at: { $gte: dayStart, $lte: now } }` → `$sort { installation_id: 1, recorded_at: 1 }` → `$group { _id, first: { $first: '$energy_kwh' }, last: { $last: '$energy_kwh' } }`;
    - baseline: `$match { installation_id: { $in: ids }, recorded_at: { $lt: dayStart } }` → `$sort { installation_id: -1, recorded_at: -1 }` → `$group { _id, energy: { $first: '$energy_kwh' } }`.
    - contribution = `last − (baseline energy, or first when there is no baseline)`.
- **Summary** over a set of installations:
  - `active` = count with status ACTIVE; `decommissioned` = count DECOMMISSIONED.
  - `reporting`, `silent`, `never_reported` = counts of ACTIVE installations by reporting status.
  - `current_power_kw` = sum of latest `power_kw` of REPORTING installations.
  - `energy_today_kwh` = sum of energy-today contributions of **all** installations (decommissioned included).
  - Both sums rounded to 3 decimals.

---

## 9. Endpoints

All paths below are after `/solar/v1.0`. Common to every endpoint unless stated: bearer token required; `Accept` checked; GET responses follow §6.7; errors follow §6.10; 401/403 `40301`/405/406 possible everywhere.

### EP1 — `/token` — POST
- See §7.2 and §7.11.

### EP2 — `/provinces`, `/provinces/{province-id}` — GET
- Scope `geography:read`.
- List params: `offset`, `limit`. Sorted by `province_id` ascending.
- Member: unknown id → 404 `40401`.

### EP3 — `/districts`, `/districts/{district-id}` — GET
- Scope `geography:read`.
- List params: `province-id`, `offset`, `limit`. Sorted by `district_id`.
- Member: unknown id → 404 `40401`.

### EP4 — `/substations`, `/substations/{substation-id}` — GET
- Scope `geography:read`.
- List params: `province-id`, `district-id`, `offset`, `limit`. Sorted by `substation_id`.
- Member: unknown id → 404 `40401`.

### EP5 — Generation summaries — GET
- Paths: `/districts/{district-id}/generation-summary`, `/provinces/{province-id}/generation-summary`, `/generation-summary`.
- Scope `generation:read`. No query parameters: any query parameter → 400 `40002`.
- Order: query parameters (400 `40002`) → unknown district/province → 404 `40401`; region not inside the caller's area → 403 `40302`; national path and caller not `NATIONAL` → 403 `40302`.
- Installations = all installations whose substation is in the region (any status).
- Response:
  ```json
  {
    "area": { "level": "DISTRICT", "id": 1, "name": "Colombo" },
    "day": "2026-10-04",
    "computed_at": "2026-10-04T08:20:11.000Z",
    "current_power_kw": 412.338,
    "energy_today_kwh": 1820.104,
    "installations": { "active": 26, "reporting": 24, "silent": 1, "never_reported": 1, "decommissioned": 1 }
  }
  ```
  - Province: `"level": "PROVINCIAL"`. National: `{ "level": "NATIONAL", "id": null, "name": "Sri Lanka" }`.
- ETag ignores `computed_at`. Last-Modified = response time.

### EP6 — `/installations` — GET, POST

**GET** — scope `generation:read`
- Params: `province-id`, `district-id`, `substation-id`, `status`, `reporting-status`, `offset`, `limit`.
- Any region filter not inside the caller's area → 403 `40302`.
- Result: installations in the caller's area ∩ filters, sorted by `installation_id` ascending.
- `reporting-status` keeps only ACTIVE installations with that status.
- Filtering and paging are done in memory after loading the area's installations.
- Items are installation representations (no reporting status).

**POST** — scope `installations:write`, JSON body
- Body exactly: `meter_id`, `capacity_kw`, `substation_id`.
  - `status` present → 400 `40001` ("status cannot be set on create"). Any other unknown field → 400 `40001`.
  - `meter_id`: string matching `^[A-Z0-9-]{3,32}$`.
  - `capacity_kw`: number, `> 0` and `≤ 1000`.
  - `substation_id`: integer that exists → else 400 `40001`.
- Substation not inside the caller's area → 403 `40302`.
- `meter_id` used by any installation → 409 `40902` (also catch duplicate-key error 11000).
- Create: new `installation_id`, `status: "ACTIVE"`, credential fields `null`, `created_at = updated_at = now`.
- Response: §6.9, Location `PUBLIC_BASE_URL/installations/{installation-id}`.

### EP7 — `/installations/{installation-id}` — GET, PUT, DELETE

**GET** — scope `generation:read`
- Not found or not in the area → 404 `40401`.

**PUT** — scope `installations:write`, JSON body, `If-Match` required
- Body exactly: `meter_id`, `capacity_kw`, `status`, `substation_id` — all required, same rules as POST; `status` is `ACTIVE` | `DECOMMISSIONED`.
- Order: body (400) → target not found / not in area (404 `40401`) → new substation not inside area (403 `40302`) → `If-Match` (403 `40303` / 412 `41201`) → `meter_id` used by **another** installation (409 `40902`).
- Save all four fields, `updated_at = now`.
- If `status` changes to `DECOMMISSIONED`: set `device_secret_hash` and `device_secret_issued_at` to `null`.
- Changing `DECOMMISSIONED` → `ACTIVE` does not create a credential.
- Response 200 (§6.8).

**DELETE** — scope `installations:write`, `If-Match` required
- Order: not found / not in area (404 `40401`) → `If-Match` → has any reading (409 `40903`) → delete.
- Response 200, body = the deleted representation.

### EP8 — `/installations/{installation-id}/overview` — GET
- Scope `generation:read`. Not found / not in area → 404 `40401`.
- Response:
  ```json
  {
    "installation": { "installation_id": "INS-000004", "meter_id": "SLM-10000004", "capacity_kw": 5, "status": "ACTIVE", "substation_id": 1 },
    "substation": { "substation_id": 1, "name": "Kolonnawa" },
    "district": { "district_id": 1, "name": "Colombo" },
    "province": { "province_id": 1, "name": "Western" },
    "reporting_status": "REPORTING",
    "last_known_reading": { "reading_id": 2017, "installation_id": "INS-000004", "recorded_at": "…", "power_kw": 3.412, "energy_kwh": 10234.551, "voltage": 236.4 }
  }
  ```
  - `last_known_reading`: `null` when there is none.
  - `reporting_status`: `null` when DECOMMISSIONED.
- Last-Modified = response time.

### EP9 — `/installations/{installation-id}/last-known-reading` — GET
- Scope `generation:read`.
- Not found / not in area → 404 `40401`. No readings → 404 `40402`.
- Body = the newest reading by `recorded_at`. `Content-Location` = `PUBLIC_BASE_URL/installations/{id}/readings/{reading-id}`.
- Last-Modified = its `received_at`.

### EP10 — `/installations/{installation-id}/readings` — GET, POST

**GET** — scope `generation:read`
- Params: `from`, `to`, `sort`, `offset`, `limit`.
- Not found / not in area → 404 `40401`.
- Query: `installation_id`, `recorded_at` window, sort by `recorded_at` (direction from `sort`), skip/limit, `countDocuments` for `count`.

**POST** — scope `readings:write` (device tokens only), JSON body.
- No query parameters: any query parameter → 400 `40002`, checked before step 1.
- Middleware order: `authenticate` → `requireScope('readings:write')` → `readingsLimiter` (§7.11) → `json-body`.
- Controller steps in order:
1. Body exactly: `recorded_at`, `power_kw`, `energy_kwh`, `voltage`, all required.
   - `installation_id` in the body → 400 `40001` ("installation_id comes from the URL"). Other unknown field → 400 `40001`.
   - Numbers must be finite JSON numbers → else 400 `40001`. `recorded_at` missing or not a string → 400 `40001`.
2. `recorded_at` invalid per §6.6, more than 2 minutes in the future, or more than 7 days before now → 400 `40003`.
3. Path installation ≠ the token's installation:
   - path id not matching `^INS-[0-9]{6}$` → 404 `40401`, no audit line;
   - otherwise → 403 `40306` and a `wrong_installation` audit line (§7.12).
4. Installation `DECOMMISSIONED` → 403 `40304`.
5. Ranges → 400 `40004`: `power_kw < 0` or `> capacity_kw × 1.05`; `voltage < 180` or `> 270`; `energy_kwh < 0`.
6. A reading with the same `installation_id` and `recorded_at` exists:
   - same `power_kw`, `energy_kwh`, `voltage` → **200**, body = existing reading, `Content-Location` = its URL, plus `ETag`, `Last-Modified`.
   - different → 409 `40901`.
7. Counter check: `prev` = newest reading with `recorded_at` < new; `next` = oldest with `recorded_at` > new. `energy_kwh < prev.energy_kwh` or `> next.energy_kwh` → 400 `40005`.
8. Insert with new `reading_id`, `received_at = now`. Duplicate-key error on (installation, recorded_at) → go back to step 6.
9. Response: §6.9, Location `PUBLIC_BASE_URL/installations/{id}/readings/{reading-id}`.
- When several fields fail in one step, `error[]` lists all of them.

### EP11 — `/installations/{installation-id}/readings/{reading-id}` — GET
- Scope `generation:read`.
- Installation not found / not in area, reading not found, or reading of another installation → 404 `40401`.
- Allowed methods: GET only (PUT/DELETE → 405).

### EP12 — `/installations/{installation-id}/device-credential` — POST
- Scope `credentials:issue`. No body: a non-empty request body (`Content-Length` > 0 or `Transfer-Encoding` present) → 400 `40001`, checked before the installation is looked up.
- Not found / not in area → 404 `40401`. DECOMMISSIONED → 403 `40304`.
- Issue a new secret (§7.7); it replaces any old one.
- Response 200 (`Cache-Control: no-store`, `Pragma: no-cache`):
  ```json
  { "installation_id": "INS-000241", "device_secret": "…", "issued_at": "2026-10-04T08:20:11.000Z" }
  ```
- Allowed methods: POST only (GET → 405).

### EP13 — `/users` — GET, POST
- Scope `users:manage`.

**GET**
- Params: `district-id`, `role`, `jurisdiction-level`, `offset`, `limit`. Sorted by `username` ascending. No area narrowing.

**POST** — JSON body
- Body exactly: `name`, `username`, `password`, `role`, `jurisdiction_level`, `district_id`.
  - `name`: string, 1–100 characters after trimming; stored and returned trimmed.
  - `username`: `^[a-z0-9._-]{3,32}$`.
  - `password`: string, 10–72 characters.
  - `role`, `jurisdiction_level`: enums. `district_id`: existing district.
  - `role: ADMIN` with a level other than `NATIONAL` → 400 `40001`.
- `username` taken → 409 `40904` (also catch error 11000).
- Create with `user_id = randomUUID()`, hashed password, `password_changed_at = created_at = updated_at = now`.
- Response: §6.9, Location `PUBLIC_BASE_URL/users/{user-id}`. Body has no password.

### EP14 — `/users/{user-id}` — GET, PUT, DELETE
- Scope `users:manage`. Unknown id → 404 `40401`.

**PUT** — JSON body, `If-Match` required
- Body exactly: `name`, `username`, `role`, `jurisdiction_level`, `district_id` (all required; rules as EP13, `name` stored trimmed). `password` present → 400 `40001`.
- Order: body (400) → not found (404) → `If-Match` (403 / 412) → target is the caller (403 `40305`) → username taken by another user (409 `40904`).
- Save, `updated_at = now`. Response 200.

**DELETE** — `If-Match` required
- Order: not found (404) → `If-Match` → target is the caller (403 `40305`) → delete. Response 200, body = deleted representation.

### EP15 — `/users/{user-id}/password` — POST
- Required scope: `account:write` or `users:manage` (either passes pipeline step 6).
- **Own account** (`user-id` = caller):
  - Body exactly `current_password`, `new_password` → else 400 `40001`.
  - `current_password` wrong → 403 `40307`.
  - `new_password` 10–72 chars and different from the current one → else 400 `40001`.
- **Another account** — order: 40308 → body (400) → unknown user (404):
  - Caller lacks `users:manage` → 403 `40308`.
  - Body exactly `new_password` (10–72 chars) → else 400 `40001`.
  - Unknown user → 404 `40401`.
- Save new hash, `password_changed_at = updated_at = now`.
- Response 200 (`Cache-Control: no-store`, `Pragma: no-cache`; errors do not carry them):
  ```json
  { "user_id": "7c2d…", "password_changed_at": "2026-10-04T08:20:11.000Z" }
  ```

### EP17 — Region readings — GET
- Paths: `/districts/{district-id}/readings`, `/provinces/{province-id}/readings`.
- Scope `generation:read`.
- Params:
  - district: `substation-id`, `from`, `to`, `sort`, `offset`, `limit`.
  - province: `district-id`, `substation-id`, `from`, `to`, `sort`, `offset`, `limit`.
  - A filter value not inside the path region (or a substation not in the given `district-id`) → 400 `40002`.
- Order: params, including each filter inside the path region and the given `district-id` (400 `40002`) → unknown region (404 `40401`) → region not inside the caller's area (403 `40302`).
  - An unknown region contains no district or substation: any `district-id` or `substation-id` filter on it → 400 `40002`; without filters → 404 `40401`.
- Query: installation ids of the region (narrowed by filters), all statuses → readings with those ids and the time window, sorted by `recorded_at` (direction from `sort`) then `installation_id` ascending, skip/limit, `countDocuments` for `count`.
- Items: reading representations. Last-Modified = response time.

---

## 10. Tooling routes (no token, no `Accept` check)

| Route | Response |
|---|---|
| `GET /` | 200 `{ "status": "ok", "service": "slsea-solar-api" }` |
| `GET /solar/v1.0/openapi` | 200, the OpenAPI document (JSON) |
| `GET /solar/v1.0/docs` | 301, `Location: docs/` |
| `GET /solar/v1.0/docs/` and its assets | Swagger UI (`swagger-ui-express`, `validatorUrl: null`) loading `/solar/v1.0/openapi` |

- Each tooling path answers other methods with 405 `40501` (`Allow: GET`). `/solar/v1.0/docs/package.json` → 404 `40403`.

**OpenAPI document** (`src/openapi/document.js`, OpenAPI 3.0.3):
- `servers: [{ url: PUBLIC_BASE_URL }]`.
- Every path and method in §9 with: summary, parameters (path + query with types and enums), request body schema, every success response with headers, every error status the endpoint can return.
  - Each error response lists the codes (§6.10) that operation can return. Every bearer operation lists 400 `40002`, 401 `40101`/`40102`, 403 `40301`/`40309`, 406 and 500.
  - Every GET lists 304 and the optional `If-None-Match` / `If-Modified-Since` headers.
  - 405 is stated in each operation's description (`Allow` = the methods of its path) and as `components.responses.MethodNotAllowed`; 404 `40403` is in the error codes table of `info.description`.
  - Query filter parameters (`province-id`, `district-id`, `substation-id`) carry no example value, so "Try it out" sends no filter unless one is entered.
- `POST /token` and `POST /installations/{installation-id}/readings` list 429 with the `Retry-After` header.
- Components: schemas for every representation, the collection envelope, the summary, the overview, the token response, and `Error` (§6.10).
- `securitySchemes`: `oauth2` with flows `password` and `clientCredentials`, both `tokenUrl: PUBLIC_BASE_URL + "/token"`, scopes from §7.1 with one-line descriptions (password: the user scopes; clientCredentials: `readings:write`).
- Each operation lists its required scope under `security`.
- `If-Match` declared as a **required** header on PUT and DELETE.
- A short `info.description` covering: how to get a token in Swagger (Authorize → password flow with a test account, or client-credentials with `installation_id` + secret), the rate limits (§7.11), and the error codes table.

---

## 11. Scripts

- Scripts and `tests/helpers.js` send `X-Origin-Secret: <ORIGIN_SECRET>` on every request when `ORIGIN_SECRET` is non-empty.

### 11.1 `scripts/create-test-accounts.js`

- Gets a token for `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` from `TEST_BASE_URL`.
- Creates each account below with `POST /users` and password `TEST_ACCOUNT_PASSWORD`. A 409 means it exists: skip.
- Prints a table of usernames and results.

| username | name | role | level | district_id |
|---|---|---|---|---|
| `colombo.analyst` | Colombo Analyst | ANALYST | DISTRICT | 1 |
| `kandy.analyst` | Kandy Analyst | ANALYST | DISTRICT | 4 |
| `western.analyst` | Western Analyst | ANALYST | PROVINCIAL | 1 |
| `central.analyst` | Central Analyst | ANALYST | PROVINCIAL | 4 |
| `national.analyst` | National Analyst | ANALYST | NATIONAL | 1 |
| `colombo.officer` | Colombo Officer | INSTALLATION_OFFICER | DISTRICT | 1 |
| `kandy.officer` | Kandy Officer | INSTALLATION_OFFICER | DISTRICT | 4 |

### 11.2 `scripts/simulate.js` (step D2)

- Reads devices from `SIM_DEVICES_FILE` (JSON array of `{ installation_id, device_secret }`), skipping ids in `SIM_SKIP`.
- Uses `national.analyst` (password `TEST_ACCOUNT_PASSWORD`) to read each device's installation (`capacity_kw`) and last-known reading (`energy_kwh`) at start.
- One **tick**, for each device:
  - Device token via `/token` client credentials (cache each token for 55 minutes).
  - `recorded_at` = now floored to 15 minutes (UTC).
  - `power_kw` = 0 outside 06:15–18:00 Sri Lanka time; inside: `capacity_kw × 0.85 × sin(π × (minutesSinceMidnightLocal − 360) / 720)^1.3 × random(0.92–1.0)`, capped at `capacity_kw`, rounded to 3 decimals.
  - `energy_kwh` = last energy + `power_kw × 0.25`, rounded to 3 decimals. `voltage` = random 215–250, 1 decimal.
  - `POST /installations/{id}/readings`. 201 or 200 → keep the new energy. 429 → wait `Retry-After` seconds and retry once. Log any other status and continue.
- Modes: `node scripts/simulate.js --once` (one tick, then exit) and default (tick at every 15-minute boundary + 30 s, forever).
- Base URL from `TEST_BASE_URL`.

---

## 12. Tests (`tests/`)

- Node's built-in runner (`node:test`, `node:assert/strict`) and global `fetch`. The server must already be running.
- `tests/helpers.js`: base URL (`TEST_BASE_URL`), `api(method, path, { token, headers, body, form })`, `userToken(username)` (cached), `deviceToken(id, secret)`. `path` is relative to the base URL, or an absolute URL (tooling routes such as `GET /`).
- Preconditions: database seeded; test accounts created (`npm run accounts`).
- Write tests create their own installation in Colombo (via `colombo.officer`) with `meter_id` = `TEST-` + a unique suffix (e.g. timestamp), issue its credential and post readings with `recorded_at` inside the last hour.
- At the end of a test file, each test installation without readings is deleted; one with readings is set to `DECOMMISSIONED` with `PUT` (DELETE answers 409 `40903`).
- Tests never modify or delete seeded installations (`INS-000001`–`INS-000240`), except read-only checks and refused operations (e.g. DELETE `INS-000003` → 409).
- Count assertions on seeded areas use `≥` (earlier test runs add records).
- Rate-limit tests use keys no other test uses: usernames that do not exist (`probe-` + random suffix) for the token limiter, and a dedicated `TEST-` installation for the readings limiter. Real accounts and other tests are never limited.
- A third and fourth full test run in a row on the same server process pass without 429.
- Files: `01-pipeline.test.js`, `02-token.test.js`, `02b-hardening.test.js`, `03-geography.test.js`, `04-users.test.js`, `05-installations.test.js`, `06-readings.test.js`, `07-views.test.js`, `08-summaries.test.js`.
- `smoke.test.js` is **read-only** (safe for production): health, docs, openapi, token for `national.analyst` and `colombo.analyst`, one GET per endpoint family, a 304 round trip, 401 without token, 403 `40301` for an analyst on `/users`, 404 for `INS-000064` as `colombo.analyst`, 403 `40302` for `colombo.analyst` on Kandy's summary, `X-Content-Type-Options: nosniff` present.

---

## 13. Build steps

### L0 — Clean repository and scaffold
- Remove every file and folder except `.git/`, `docs/IMPLEMENTATION-GUIDE.md`, `seed/seed_slsea.py`, `.env` and `seed/seed-output/` (the last two are kept but must never be committed). If `seed/seed_slsea.py` is missing, stop and ask the user for it.
- Run `git log --all --oneline -- .env seed-output seed/seed-output` and record the result in §15 (if anything was ever committed, the user must rotate those secrets).
- Create: `package.json` (§2, §3.2), `.gitignore` (§3.3), `.env.example` (§4), `seed/requirements.txt`, the folder layout (§3), `src/config.js`, `src/app.js`, `src/server.js` (listen only), `GET /` health route, a minimal `README.md` (how to install and run).
- **Done when:** `npm install` succeeds with only the §2 dependencies; `npm run dev` starts; `GET /` returns the health JSON; `git status` shows no `.env` or `seed/seed-output/`.

### L1 — Database layer and start-up
- Models (§5.1, §5.2), connection, `createIndexes`, counters (§5.4), geography cache (§7.6), bootstrap admin (§7.9), full start-up sequence (§5.5).
- **Done when:** start-up against the seeded Atlas database succeeds; log shows counters at `installation_id` ≥ 240 and `reading_id` ≥ 159312; geography cache holds 9/25/42; `hq.admin` exists after first start and is not created again on restart; no seed index was dropped (`db.readings.getIndexes()` unchanged).

### L2 — HTTP foundation
- Pipeline order (§6.2): origin guard, tooling bypass, negotiation, 404, 405 helper, error handler, `ApiError` + catalogue (§6.10), `json-body.js`, `lib/http-cache.js` (§6.7, §6.8), `lib/pagination.js` (§6.4), `lib/query.js` (§6.5), `lib/time.js` (§6.6), `lib/representations.js` (§6.3).
- Tests: `01-pipeline.test.js` (406 with `Accept: text/html` on an API path, 404 `40403`, trailing slash 404, upper-case path 404, health OK with `Accept: text/html`, error body has exactly the four fields, origin guard when `ORIGIN_SECRET` is set).
- **Done when:** tests pass.

### L3 — Token and authentication
- `POST /token` (§7.2), `lib/tokens.js`, `lib/secrets.js`, `authenticate.js`, `require-scope.js`, roles → scopes (§7.1), `areaOf` (§7.6).
- Tests: `02-token.test.js` (admin password grant OK; wrong password 401 `40103` + `WWW-Authenticate`; JSON body → 415; missing `grant_type` → 400; unknown form field ignored; `no-store` header; bad bearer → 401 `40102`; no bearer → 401 `40101`; device grant with `INS-000004` if `seed/seed-output/test-device.json` exists, else skipped; device grant for `INS-000003` → 401 `40103`). Until a route uses a bearer token (L4), the `authenticate.js` checks call the middleware directly, with the test connected to the database.
- **Done when:** tests pass.

### L3a — Auth hardening
- §4 / §7.9: `BOOTSTRAP_ADMIN_PASSWORD` length 10–72 checked by `config.js` (reverses the §15 row 2 change; log the reversal as a new §15 row).
- §7.2: equal-time password check with `DUMMY_HASH`; `/token` form limit 16kb; order content-type → form → `tokenLimiter` → grant.
- §7.11: `middleware/rate-limit.js` with `tokenLimiter` (the `readingsLimiter` is added in L7); `express-rate-limit` added to `package.json`.
- §7.12: `lib/audit.js`; `token_rejected` and `rate_limited` lines.
- §6.2 / §6.11: `middleware/security-headers.js` as pipeline step 0; `json-body.js` limit 16kb; error catalogue 429 `42901` with `Retry-After`.
- §6.2: review existing code for the rule "request values reach filters only after validation"; fix and log any place that breaks it.
- Tests: `02b-hardening.test.js`:
  - unknown username and wrong password for `hq.admin` each take at least 30 ms;
  - 11 failed logins for `probe-<random>` → the 11th is 429 `42901` with `Retry-After`, `Cache-Control: no-store` and the four-field error body;
  - a second unknown username `probe-<random>` still gets 401 (keys are separate);
  - 15 requests with a missing `grant_type` → all 400, none 429;
  - 12 successful `hq.admin` logins in a row → all 200;
  - form `username[$ne]=x&password=y&grant_type=password` → 400 `40001`;
  - `/token` body over 16kb → 400 `40001`;
  - `X-Content-Type-Options: nosniff` on `GET /` and on a 404; no `Access-Control-Allow-Origin` header; no `Strict-Transport-Security` while `PUBLIC_BASE_URL` is `http://`.
- **Done when:** `02b-hardening.test.js` and all earlier tests pass; starting the app with a 9-character `BOOTSTRAP_ADMIN_PASSWORD` exits with code 1 and a clear message; one failed login prints exactly one `token_rejected` line that contains no password.

### L4 — Geography
- EP2, EP3, EP4 with pagination, filters, conditional GET.
- Tests: `03-geography.test.js` (counts 9/25/42; `/districts?province-id=1` count 3; `/substations?district-id=1` count 3; unknown id 404; `/districts/abc` 404; `?limit=101` 400 `40002`; unknown param 400; next/previous links; `If-None-Match` → 304 empty body; `If-Modified-Since` → 304; POST → 405 with `Allow: GET`; no token → 401 `40101` with `WWW-Authenticate: Bearer realm="solar"`; device token → 403 `40301`). Reads use the bootstrap admin token (test accounts arrive in L5); the device test uses `INS-000004` from `seed/seed-output/test-device.json` and is skipped if the file is missing.
- **Done when:** tests pass.

### L5 — Users and passwords
- EP13, EP14, EP15; `scripts/create-test-accounts.js` (§11.1).
- Tests: `04-users.test.js` (create → 201 + Location that resolves; duplicate username 409; ADMIN + DISTRICT 400; PUT without `If-Match` 403 `40303`; stale 412; admin PUT/DELETE own account 403 `40305`; analyst on `/users` 403 `40301`; own password change → old token 401 `40102`; wrong current password 403 `40307`; analyst changing another user's password 403 `40308`; admin reset OK; DELETE then DELETE → 200 then 404; deleted user's token → 401; JSON body over 16kb → 400 `40001`; `"username": { "$gt": "" }` → 400 `40001`; rate-limit reset: create `probe-reset-<random>` as `hq.admin`, 9 failed logins → all 401, 1 successful login → 200, 9 more failed logins → all 401 (none 429), a 10th failure → 401, an 11th failure → 429 `42901`, then delete the user).
- **Done when:** tests pass and `npm run accounts` creates all §11.1 accounts (and skips them on a second run).

### L6 — Installations and device credentials
- EP6, EP7, EP12.
- Tests: `05-installations.test.js` (`colombo.analyst` list count ≥ 27 and `national.analyst` ≥ 240 — exactly 27 / 240 on a fresh seed, more after write tests; `?district-id=4` as `colombo.analyst` → 403 `40302`; `?reporting-status=NEVER_REPORTED` as `colombo.analyst` → only `INS-000001` among the seeded installations, any other result is a `TEST-` installation; `INS-000064` as `colombo.analyst` → 404; officer POST → 201 + Location, status ACTIVE; `status` in POST body 400; `"meter_id": { "$gt": "" }` → 400 `40001`; substation 8 as `colombo.officer` → 403; duplicate meter 409; PUT full replace with `If-Match`; PUT missing field 400; PUT to substation 8 → 403; DELETE `INS-000003` → 409 `40903`; credential → 200 + secret + `no-store`; credential with a request body → 400 `40001`; device token works with the new secret (checked with `GET /provinces`: 403 `40301` = valid, 401 `40102` = revoked); re-issue → old device token 401; decommission via PUT → device token 401 `40102`, `/token` 401 `40103`, credential issue 403 `40304`; analyst POST → 403 `40301`; DELETE new installation without readings → 200).
- **Done when:** tests pass.

### L7 — Readings
- EP10 (GET + POST), EP11, EP9; `readingsLimiter` (§7.11); `wrong_installation` audit line (§7.12).
- Tests: `06-readings.test.js` (POST → 201 + Location that resolves; identical resend → 200 + Content-Location; changed values same time → 409; `installation_id` in body 400; no offset 400 `40003`; 10 min in future 400 `40003`; 8 days old 400 `40003`; power > capacity × 1.05 → 400 `40004`; voltage 300 → 400 `40004`; energy below previous → 400 `40005`; late reading between two others with consistent counter → 201; device posting to another installation 403 `40306`; a newly issued and a re-issued device credential each give a token that posts a reading → 201, and the token from before the re-issue → 401 `40102`; analyst POST → 403 `40301`; device GET → 403 `40301`; history `count` ≥ 672 for `INS-000004` (exactly 672 on a fresh seed); `sort=recorded-at:asc` order; `from`/`to` window; `from >= to` 400; last-known of `INS-000001` → 404 `40402`; last-known Content-Location resolves; reading of another installation → 404; PUT on a reading → 405; on a dedicated `TEST-` installation, 121 POSTs with body `{}` within one minute → the first 120 are 400 `40001` and the 121st is 429 `42901` with `Retry-After`; another installation is not limited at the same time).
- **Done when:** tests pass.

### L8 — Overview and region readings
- EP8, EP17.
- Tests: `07-views.test.js` (overview of `INS-000004` complete; `INS-000001` → `last_known_reading: null`, `NEVER_REPORTED`; `INS-000003` → `reporting_status: null`; `INS-000002` → `SILENT` (if the seed is older than 30 min every seeded site may be SILENT — assert only on `INS-000001`/`INS-000003` exact values; for `INS-000002` and `INS-000004` the status must be `SILENT` when `last_known_reading.recorded_at` is more than 30 min old, else `REPORTING`); `/districts/1/readings` count = sum of the history counts of the Colombo installations, both with `to` = 2 hours before the test run (other test files post readings concurrently); `?substation-id=8` on district 1 → 400 `40002`; `colombo.analyst` on `/districts/4/readings` → 403 `40302`; `/provinces/1/readings` as `colombo.analyst` → 403; as `western.analyst` → 200; paging links).
- **Done when:** tests pass.

### L9 — Generation summaries
- EP5 with `lib/derived.js` (§8).
- Tests: `08-summaries.test.js` (district 1 counts: active ≥ 26, decommissioned ≥ 1, never_reported ≥ 1 — exactly 26 / 1 / 1 on a fresh seed; numbers ≥ 0; `colombo.analyst` on district 4 → 403; province 1 as `colombo.analyst` → 403, as `western.analyst` → 200; national as `western.analyst` → 403, as `national.analyst` → 200 with active + decommissioned ≥ 240; admin → 403 `40301`; second request with `If-None-Match` → 304 when nothing changed, on district 4 as `kandy.analyst` (no test file writes there); posting a reading changes the ETag).
- **Done when:** tests pass.

### L10 — OpenAPI and Swagger UI
- `src/openapi/document.js` (§10), `/openapi`, `/docs`.
- Tests in `01-pipeline.test.js`: `/openapi` → 200, `openapi: 3.0.3`, `servers` and both `tokenUrl`s from `PUBLIC_BASE_URL`; 429 + `Retry-After` on `/token` and readings POST; `If-Match` on the four PUT/DELETE operations; `/docs` → 301 `docs/`; `/docs/` → Swagger UI HTML with `nosniff`; `swagger-ui-init.js` loads `/solar/v1.0/openapi`.
- **Done when:** `/solar/v1.0/docs` loads in a browser with the security headers in place; Authorize with the password flow (`colombo.analyst`) works and "Try it out" succeeds on `/installations`; client-credentials flow works with a device credential; every endpoint and status in §9 is listed, including 429 on `/token` and readings POST; the document is valid OpenAPI 3.0.3 (no errors shown by Swagger UI).

### L10a — Four-field error body
- §6.10: the error body has exactly `code`, `message`, `description`, `error`; `error` is always an array (`[]` when there are no field problems). The documentation-link field (§16 Q6) is removed from `lib/errors.js`, the OpenAPI `Error` schema, the `info.description` error-codes text and the tests.
- Status codes, error codes and headers are unchanged; `/docs` stays.
- Tests: the error-body assertions in `01-pipeline.test.js`, `02b-hardening.test.js` and `06-readings.test.js` expect exactly the four fields.
- **Done when:** the field named in §16 Q6 appears nowhere in `src/`, `tests/` or this file outside §16 and §17; the OpenAPI document validates; `npm test` passes.

### L11 — Full acceptance and README
- Run the full suite against Atlas with the app running on the laptop.
- Review every endpoint against §9 one more time; fix and log gaps in §15.
- README: what the API is; local setup (Atlas URI in `.env`, laptop IP in Atlas Network Access, `npm run dev`, `npm run accounts`, `npm test`); seed command (user only); test accounts table; edge-case installations table (§5.3); how to get a token (curl examples for both grants); rate limits (§7.11); link to `/docs`; error code table reference.
- **Done when:** `npm test` passes completely twice in a row (the second run proves tests do not depend on a clean database); README steps work from a fresh clone.

### D1 — Production readiness
- `ecosystem.config.cjs`: app name `slsea-api`, script `src/server.js`, `node_args: '--env-file=.env'`, `instances: 1`, `autorestart: true`, `max_memory_restart: '300M'`.
- Confirm the origin guard (§7.10) and `PUBLIC_BASE_URL` are used everywhere (Location, links, OpenAPI `servers` and `tokenUrl`).
- README: "Deployment" section (EC2 commands: install Node 24, `npm ci --omit=dev`, `pm2 start ecosystem.config.cjs`, `pm2 save`, `pm2 startup`; update: `git pull && npm ci --omit=dev && pm2 reload slsea-api`).
- **Done when:** app runs under pm2 locally with `ORIGIN_SECRET` set; requests without the header get 403 `40309`; with `PUBLIC_BASE_URL=https://example.test/solar/v1.0` every response carries `Strict-Transport-Security`; `npm run test:smoke` passes with the header supplied (helpers send `X-Origin-Secret` when `ORIGIN_SECRET` is set).

### D2 — Device simulator
- `scripts/simulate.js` (§11.2).
- **Done when:** `npm run simulate -- --once` against local posts one reading per device (except `SIM_SKIP`) with 201s; a second `--once` in the same slot gets 200s; `INS-000004` overview shows `REPORTING`; no 429 responses during a full tick.

---

## 14. Progress

| Step | Status | Date | Commit | Notes |
|---|---|---|---|---|
| L0 Clean repo + scaffold | ☑ | 2026-10-06 | 5248780 | Old files removed; scaffold, config check, `GET /` health; 5 runtime deps only |
| L1 Database + start-up | ☑ | 2026-10-06 | b382a88 | 7 models + §5.2 indexes; counters 240 / 159312; geography 9/25/42; `hq.admin` created on first start, skipped on restart; seed indexes unchanged |
| L2 HTTP foundation | ☑ | 2026-10-06 | 73a742b | Pipeline origin → tooling → negotiation → routers → 404 → error handler; `ApiError` + catalogue; json-body, http-cache, pagination, query, time, representations; `01-pipeline.test.js` 10/10 (origin guard run with `ORIGIN_SECRET` set) |
| L3 Token + authentication | ☑ | 2026-10-06 | 6fd605f | `POST /token` password + client-credentials grants; `lib/tokens.js` (HS256, iss/aud, role scopes), `lib/secrets.js`, `authenticate.js`, `require-scope.js`, `areaOf`; `02-token.test.js` 16/16 (device grant with `INS-000004` ran) |
| L3a Auth hardening | ☑ | 2026-10-07 | d1d96eb | `security-headers.js` (step 0), `tokenLimiter` (10 failures / 15 min per key, success resets, keyless requests skipped), `DUMMY_HASH` equal-time login, `lib/audit.js` (`token_rejected`, `rate_limited`), 16kb form/JSON limits, 429 `42901`, `BOOTSTRAP_ADMIN_PASSWORD` 10–72 check; filter-validation review found nothing to fix; `npm test` 33 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process |
| L4 Geography | ☑ | 2026-10-07 | 51e45ec | `routes/geography.js` + `controllers/geography.js`: EP2–EP4 lists (filters `province-id`, `district-id`, paging, links) and members from the geography cache; `authenticate` → `requireScope('geography:read')`; conditional GET with collection-latest / member `updated_at`; `03-geography.test.js` 17/17; `npm test` 50 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process |
| L5 Users + passwords | ☑ | 2026-10-07 | a1e9c5e | `routes/users.js` + `controllers/users.js`: EP13 list (filters `district-id`, `role`, `jurisdiction-level`, sorted by `username`) and create; EP14 GET/PUT/DELETE with `If-Match` and own-account 40305; EP15 own change (current password checked) and admin reset, both revoke older tokens; `lib/validation.js` user/password body rules (every field problem listed); `scripts/create-test-accounts.js` created all 7 accounts, second run skipped all 7; `04-users.test.js` 19/19 (incl. rate-limit reset test moved from `02b`); `npm test` 68 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on four runs in a row on one server process |
| L6 Installations + credentials | ☑ | 2026-10-07 | 14150bd | `routes/installations.js` + `controllers/installations.js`: EP6 list (area installations loaded once, filters `province-id`, `district-id`, `substation-id`, `status`, `reporting-status` and paging in memory; region filter outside the area 403 `40302`) and create; EP7 GET/PUT/DELETE with `If-Match`, decommissioning clears the credential, DELETE refused when readings exist; EP12 credential issue (`no-store`, replaces the old secret, 403 `40304` when decommissioned); `lib/validation.js` installation body rules; `lib/derived.js` latest reading + reporting status; area helpers in `lib/geography.js`; `05-installations.test.js` 24/24 (review gate: EP12 rejects a request body); `npm test` 92 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process; no `TEST-` installation left afterwards, seeded installations unchanged |
| L7 Readings | ☑ | 2026-10-07 | 9cb62ab | `routes/readings.js` + `controllers/readings.js`: EP10 GET (`from`/`to` window, `sort`, paging, Last-Modified = latest `received_at` or `created_at`) and POST (steps 1–9 in order; duplicate key on (installation, `recorded_at`) re-runs step 6); EP11 member (reading of another installation 404); EP9 last-known with `Content-Location`; `readingsLimiter` (120 / min per device installation, after `requireScope`, before `json-body`); `wrong_installation` audit line; `lib/validation.js` reading body rules; `06-readings.test.js` 21/21; `npm test` 113 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process, no 429 outside the limiter test (review gate: malformed path id at step 3 → 404, query parameters on POST → 400 `40002`, history count ≥ 672); test installations with readings are left `DECOMMISSIONED` (§12) |
| L8 Overview + region readings | ☑ | 2026-10-07 | cdb2948 | EP8 overview in `routes/installations.js` + `controllers/installations.js` (`latestReadings` + `reportingStatus`, geography from the cache, `representations.overview`, Last-Modified = response time); EP17 `routes/region-readings.js` + `controllers/region-readings.js`: `/districts/{id}/readings` and `/provinces/{id}/readings`, filters checked against the path region and the given `district-id` (400 `40002`) → unknown region 404 → area 403 `40302`; region installations of any status → readings sorted by `recorded_at` then `installation_id`, `countDocuments`; `07-views.test.js` 13/13; `npm test` 126 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process, 429 only on `probe-` / dedicated `TEST-` keys (review gate: EP17 filter-in-region 400 before unknown region 404) |
| L9 Generation summaries | ☑ | 2026-10-07 | 5876a07 | `routes/summaries.js` + `controllers/summaries.js`: EP5 district, province and national summaries (query parameters 400 `40002` → unknown region 404 → area 403 `40302`; national only for `NATIONAL` callers); `lib/derived.js` `energyToday` (two aggregations: today first/last, baseline before the day) and `summary`; `representations.generationSummary`; ETag without `computed_at`; latest-reading and baseline sorts `{ installation_id: -1, recorded_at: -1 }` (DISTINCT_SCAN, 250 keys instead of 143,832; national summary ≈ 0.5 s); district 1 `energy_today_kwh` cross-checked with per-installation queries; `08-summaries.test.js` 8/8; `npm test` 134 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process, 429 only on `probe-` / dedicated `TEST-` keys (review gate: reversed sort, EP5 query parameters 400 first, 304 test on district 4) |
| L10 OpenAPI + Swagger | ☑ | 2026-10-07 | b24bee7 | `src/openapi/document.js`: OpenAPI 3.0.3, 22 paths / 29 operations (matches the routers one to one), schemas for every representation, collection envelope, summary, overview, token, credential, password and `Error`; per-operation error responses list their codes from the `lib/errors.js` catalogue; `oauth2` password + clientCredentials flows; `info.description` with Swagger token steps, rate limits and the error table (generated from the catalogue); `/openapi`, `/docs` (301 → `docs/`), `/docs/` Swagger UI in `routes/tooling.js` + `controllers/tooling.js`; validated with `@apidevtools/swagger-parser` (scratchpad, not a dependency); headless Firefox: UI loads with `nosniff` and no error panel, password flow as `colombo.analyst` + "Try it out" `GET /installations` → 200, clientCredentials with `INS-000004` → token 200 and `GET /provinces` → 403 `40301`; `01-pipeline.test.js` +3 tests; `npm test` 137 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on the 4th and 5th of five runs in a row on one server process (summaries of runs 1–3 not captured), 429 only on `probe-` / dedicated `TEST-` keys (review gate: `/docs` redirect, 405 placement, filter examples) |
| L10a Four-field error body | ☑ | 2026-10-07 | | §6.10 error body is exactly `code`, `message`, `description`, `error` (always an array); `lib/errors.js` `errorBody` and the `config` import trimmed; OpenAPI `Error` schema has the four fields (`additionalProperties: false`) and `info.description` text updated; error-body assertions in `01-pipeline`, `02b-hardening`, `06-readings` expect four fields, `01-pipeline` also checks `error: []` without field problems; §16 Q6/Q7 answered; status codes, error codes and headers unchanged; OpenAPI document validates (swagger-parser); `npm test` 137 pass / 1 skipped (origin guard, `ORIGIN_SECRET` empty) on three runs in a row on one server process |
| L11 Full acceptance + README | ☐ | | | |
| D1 Production readiness | ☐ | | | |
| D2 Device simulator | ☐ | | | |

Status values: ☐ not started · ◐ in progress · ☑ done.

---

## 15. Issues found and fixed

| # | Step | What was wrong | Spec section | Fix | Commit |
|---|---|---|---|---|---|
| 1 | L0 | `git log --all --oneline -- .env seed-output` returned no commits: `.env` and `seed-output/` were never committed; no secrets to rotate | §13 L0 | None needed; both git-ignored (§3.3) | — |
| 2 | L1 | Bootstrap admin (own code) rejected a `BOOTSTRAP_ADMIN_PASSWORD` shorter than 10 characters; §7.9 only requires it to be present | §7.9 | Check reduced to "missing → exit" (reversed in L3a: §4/§7.9 now require 10–72) | b382a88 |
| 3 | L3 | Spec paths named `seed-output/` at the repo root; the seed output is in `seed/seed-output/`, so the `INS-000004` device test would always be skipped | §0, §3, §3.3, §4, §5.3, §13 L3 | Paths changed to `seed/seed-output/` (user's decision); `.env.example` and `.gitignore` updated | 6fd605f |
| 4 | L3a | Reversal of row 2: start-up accepted a `BOOTSTRAP_ADMIN_PASSWORD` of any length; §4/§7.9 now require 10–72 characters whenever set | §4, §7.9 | `config.js` checks the length and exits with code 1 and a clear message | (L3a) |
| 5 | L3a | `/token` returned 401 for an unknown username without running bcrypt, so it answered faster than a wrong password | §7.2 | `checkPassword` compares against `DUMMY_HASH` when the user is missing | (L3a) |
| 6 | L8 | `07-views.test.js` (own test) requested an offset beyond the count of the `substation-id=1` query without that filter, so the page was not empty | §6.4 | The request keeps the same filter | (L8) |
| 7 | L9 | `GET /generation-summary` and national `GET /installations?reporting-status=…` answered 500 `50001` (bug since L6): the latest-reading `$sort { installation_id: 1, recorded_at: -1 }` did not match the index direction, so MongoDB sorted ~144k readings in memory and hit its 32 MB limit | §8 | Latest-reading and baseline aggregations sort `{ installation_id: -1, recorded_at: -1 }` (reversed index scan, DISTINCT_SCAN) | (L9) |
| 8 | L10 | Swagger UI "Try it out" on `GET /installations` (own document) prefilled the filter examples (`province-id=1&district-id=1&substation-id=1`), so `colombo.analyst` got 403 `40302` | §10 | Query filter parameters carry no example | (L10) |
| 9 | L10 | `/solar/v1.0/docs/package.json` answered swagger-ui-express's plain-text 404 instead of the error body | §6.10, §10 | Routed to `not-found.js` → 404 `40403` | (L10) |

---

## 16. Open questions

| # | Step | Question | Answer (from the user) |
|---|---|---|---|
| 1 | L3a | `tokenLimiter` counts every response ≥ 400. Each `npm test` run sends 4 such responses keyed `password:hq.admin` (2 wrong passwords in `02-token`, 1 missing password in `02-token`, 1 wrong password in `02b`) and 4 keyed `invalid` (missing/unknown `grant_type` and device grant without `Authorization` in `02-token`, `username[$ne]` in `02b`). A third run within 15 minutes on the same server process makes `hq.admin` hit 429, which conflicts with §12 "real accounts … are never limited". Restart the server between runs, change the tests to use `probe-` usernames, or something else? | Resolved by §7.11 reset-on-success and skip-malformed (§17 #29–31) |
| 2 | L6 | EP12 says "No body". A body sent with the request is currently ignored (not parsed, no error). Keep that, or answer a non-empty body with 400 `40001`? | Non-empty body → 400 `40001`; no body is accepted (§9 EP12, §17 #42) |
| 3 | L7 | EP10 POST step 3 compares the path installation with the token's. §6.1 says a path id that does not match `^INS-[0-9]{6}$` → 404 `40401`. The code answers such an id with 404 `40401` at step 3 (no audit line); a well-formed id of another installation gets 403 `40306` + `wrong_installation`. Keep that, or answer every mismatch with 403 `40306`? | Keep it: malformed id → 404 `40401` without audit line; well-formed other id → 403 `40306` + audit (§9 EP10 step 3, §17 #46) |
| 4 | L7 | L7 asks for history `count` 672 for `INS-000004` (exact). The D2 simulator posts readings for `INS-000004`, after which the count is above 672. Keep the exact check (and re-seed after simulating), or assert `≥ 672`? | Assert `≥ 672` (§13 L7, §17 #48) |
| 5 | L8 | EP17 order is params (400) → unknown region (404). A filter (`district-id` / `substation-id`) cannot lie inside a region that does not exist, so the code answers e.g. `/districts/99/readings?substation-id=1` with 400 `40002`; without filters it is 404 `40401`. Keep that, or check filter containment only after the region is found (→ 404)? | Keep it: params incl. filter inside the region (400) → unknown region (404) → area (403) (§9 EP17, §17 #52) |
| 6 | L10a | Keep `more_info` in the error body? | No. Optional in WSO2 §11; it always pointed at the same `/docs` page. Removed in L10a (§6.10, §17 #62) |
| 7 | L10a | Credential for a DECOMMISSIONED installation: 403 or 409? | 403 `40304` (kept). WSO2 §9: 403 = understood but refused to perform. 409 considered and rejected (§9 EP12 unchanged) |

---

## 17. Change log (specification edits)

| # | Date | Step | Section | New statement |
|---|---|---|---|---|
| 1 | 2026-10-06 | L1 | §3 | `server.js` holds the bootstrap admin (§7.9) |
| 2 | 2026-10-06 | L2 | §6.2 | JSON body over 100kb → 400 `40001`; unsupported charset/encoding → 415 `41501` |
| 3 | 2026-10-06 | L2 | §6.4 | `lib/pagination.js` exports `paging(query)` and `collection(req, …)` |
| 4 | 2026-10-06 | L2 | §6.5 | `readQuery(req, allowedNames)`; first invalid parameter stops parsing, one `error[]` entry |
| 5 | 2026-10-06 | L2 | §6.8 | `checkIfMatch(req, currentBody)` and `sendUpdated(res, body, lastModified)` in `lib/http-cache.js` |
| 6 | 2026-10-06 | L2 | §6.9 | `sendCreated(res, body, pathAfterBase, lastModified)` in `lib/http-cache.js` |
| 7 | 2026-10-06 | L2 | §6.10 | Errors thrown as `new ApiError(code, message, { errors, headers })` |
| 8 | 2026-10-06 | L2 | §12 | `api()` path may be an absolute URL (tooling routes) |
| 9 | 2026-10-06 | L3 | §0, §3, §3.3, §4, §5.3 | Seed output lives in `seed/seed-output/` (git-ignored, never committed); `SIM_DEVICES_FILE` example points there |
| 10 | 2026-10-06 | L3 | §13 L3 | Device test reads `seed/seed-output/test-device.json`; `authenticate.js` checks call the middleware directly until L4 |
| 11 | 2026-10-06 | L3 | §3, §7.1 | `lib/tokens.js` holds role → scopes: `roleScopes(role)`, `DEVICE_SCOPES` |
| 12 | 2026-10-06 | L3 | §7.2 | Every `/token` response carries `no-store`/`no-cache`; every 40103 carries `WWW-Authenticate: Basic realm="solar"`; `username`/`password` must be single non-empty values |
| 13 | 2026-10-06 | L1 | §5.5 | Steps 2–6 each log one line (database, indexes, counters, geography, bootstrap) |
| 14 | 2026-10-07 | L3a (review) | §0 | Review gate before each commit; never `git push`; stop every started server; step hash recorded in the next step's commit |
| 15 | 2026-10-07 | L3a (review) | §0, §5.3, §13 L0 | Seed output path `seed/seed-output/` in all rules; re-seed runs from `seed/` |
| 16 | 2026-10-07 | L3a (review) | §2 | `express-rate-limit` ^8 added as a runtime dependency |
| 17 | 2026-10-07 | L3a (review) | §3 | New files `middleware/security-headers.js`, `middleware/rate-limit.js`, `lib/audit.js` |
| 18 | 2026-10-07 | L3a (review) | §4, §7.9 | `BOOTSTRAP_ADMIN_PASSWORD` must be 10–72 characters whenever set; `config.js` exits otherwise |
| 19 | 2026-10-07 | L3a (review) | §6.2 | Pipeline: step 0 security headers, step 7 rate limit, steps renumbered; JSON body limit 16kb; request values reach filters only after validation |
| 20 | 2026-10-07 | L3a (review) | §6.10 | New code 429 `42901` "Too many requests" with `Retry-After`; `ApiError` headers include `Retry-After` |
| 21 | 2026-10-07 | L3a (review) | §6.11 | `X-Content-Type-Options: nosniff` on every response; HSTS when `PUBLIC_BASE_URL` is `https://`; `Retry-After` on 429; no CORS headers |
| 22 | 2026-10-07 | L3a (review) | §7.2 | Unknown username runs `bcrypt.compare` against `DUMMY_HASH`; form limit 16kb; order content-type → form → `tokenLimiter` → grant; 40103 writes `token_rejected` |
| 23 | 2026-10-07 | L3a (review) | §7.11 | Rate limits: `tokenLimiter` 10 failed per 15 min per username/installation; `readingsLimiter` 120 per min per installation |
| 24 | 2026-10-07 | L3a (review) | §7.12 | Audit log events `token_rejected`, `rate_limited`, `wrong_installation`; secrets never logged |
| 25 | 2026-10-07 | L3a (review) | §9 EP10, EP15 | EP10 POST middleware order with `readingsLimiter`; 40306 writes `wrong_installation`; EP15 refers to pipeline step 6 |
| 26 | 2026-10-07 | L3a (review) | §10, §11.2 | OpenAPI lists 429 + `Retry-After` and the rate limits; simulator retries once after 429 |
| 27 | 2026-10-07 | L3a | §3 | `lib/secrets.js` also holds `DUMMY_HASH` and Basic header parsing (`readBasic`, used by `/token` and `tokenLimiter`) |
| 28 | 2026-10-07 | L3a | §7.11 | `tokenLimiter` key is `invalid` also when `grant_type` is neither `password` nor `client_credentials` (replaced by #29) |
| 29 | 2026-10-07 | L3a | §7.11 | Successful token response resets its key (`resetKey`); requests with no usable username / installation id, or another `grant_type`, are skipped; no `invalid` key |
| 30 | 2026-10-07 | L3a | §12 | A third and fourth full test run in a row on the same server process pass without 429 |
| 31 | 2026-10-07 | L3a | §13 L3a | `02b` adds: success resets the count after 3 failures; 15 missing-`grant_type` requests all 400 |
| 32 | 2026-10-07 | L4 | §7.6 | EP2–EP4 lists and members are served from the geography cache (in-memory filtering and paging) |
| 33 | 2026-10-07 | L4 | §13 L4 | `03-geography.test.js` reads with the bootstrap admin token; device test uses `INS-000004` from `seed/seed-output/test-device.json`, skipped if missing |
| 34 | 2026-10-07 | L3a (review) | §12, §13 | New step L3a and `02b-hardening.test.js`; rate-limit tests use isolated keys; L4–L7, L10, L11, D1, D2 checks extended |
| 35 | 2026-10-07 | L5 | §13 L3a | `02b` no longer has the "3 failures, success, 3 more failures" reset test |
| 36 | 2026-10-07 | L5 | §13 L5 | `04-users` adds the rate-limit reset test: `probe-reset-<random>`, 9 failures, success, 9 + 1 failures → 401, 11th → 429 `42901`, user deleted |
| 37 | 2026-10-07 | L5 (review) | §9 EP15 | Another account: order 40308 → body (400) → unknown user (404) |
| 38 | 2026-10-07 | L5 (review) | §9 EP13, EP14 | `name` is trimmed and stored trimmed |
| 39 | 2026-10-07 | L5 (review) | §6.11, §9 EP15 | EP15 sends `no-store`/`no-cache` only on its 200; DELETE 200 and action POST 200s (EP12, EP15) carry no `ETag`/`Last-Modified` |
| 40 | 2026-10-07 | L6 | §7.6 | Area helpers `districtInArea`, `provinceInArea`, `substationInArea`, `installationInArea`, `substationsOfArea` in `lib/geography.js` |
| 41 | 2026-10-07 | L6 | §8 | `lib/derived.js` exports `latestReadings(ids)` and `reportingStatus(installation, latest, now)` |
| 42 | 2026-10-07 | L6 (review) | §9 EP12 | A non-empty request body → 400 `40001`, checked before the installation lookup (§16 Q2) |
| 43 | 2026-10-07 | L6 (review) | §13 L6 | `NEVER_REPORTED` check: only `INS-000001` among seeded installations, others are `TEST-`; device token checked with `GET /provinces` (403 `40301` valid, 401 `40102` revoked); credential with a body → 400 `40001` |
| 44 | 2026-10-07 | L6 (review) | §13 L7 | New and re-issued device credentials are proven by a reading POST → 201; the pre-re-issue token → 401 `40102` |
| 45 | 2026-10-07 | L7 | §12 | At the end of a test file, test installations without readings are deleted; those with readings are set to `DECOMMISSIONED` |
| 46 | 2026-10-07 | L7 (review) | §9 EP10 | POST step 3: malformed path id → 404 `40401` without audit line; well-formed id of another installation → 403 `40306` + `wrong_installation` (§16 Q3) |
| 47 | 2026-10-07 | L7 (review) | §9 EP10 | POST: any query parameter → 400 `40002`, checked before step 1 |
| 48 | 2026-10-07 | L7 (review) | §13 L7 | `INS-000004` history `count` ≥ 672 (exactly 672 on a fresh seed) (§16 Q4) |
| 49 | 2026-10-07 | L8 | §6.3 | The overview is built by `overview(...)` in `lib/representations.js` |
| 50 | 2026-10-07 | L8 | §8 | `latestReadings` and `reportingStatus` are also used by EP8 |
| 51 | 2026-10-07 | L8 | §13 L8 | `INS-000002`/`INS-000004` status asserted from the age of `last_known_reading`; Colombo region count compared with the per-installation sum, both with `to` = 2 hours before the run |
| 52 | 2026-10-07 | L8 (review) | §9 EP17 | Check order: params incl. filter inside the path region / `district-id` (400 `40002`) → unknown region (404 `40401`) → area (403 `40302`); a filter on an unknown region → 400 `40002` (§16 Q5) |
| 53 | 2026-10-07 | L9 (review) | §8 | Newest-reading aggregations sort `{ installation_id: -1, recorded_at: -1 }`; no `allowDiskUse` |
| 54 | 2026-10-07 | L9 | §8, §3 | `lib/derived.js` exports `energyToday(ids, now)` and `summary(installations, now)`; energy today uses a today aggregation (first/last) and a baseline aggregation |
| 55 | 2026-10-07 | L9 | §6.3 | The summary is built by `generationSummary(...)` in `lib/representations.js` |
| 56 | 2026-10-07 | L9 (review) | §9 EP5 | Any query parameter → 400 `40002`, checked before unknown region (404) and area (403) |
| 57 | 2026-10-07 | L9 (review) | §13 L9 | The 304 test runs on district 4 as `kandy.analyst` |
| 58 | 2026-10-07 | L10 | §10 | `GET /solar/v1.0/docs` → 301 `docs/`; Swagger UI at `/solar/v1.0/docs/` (`validatorUrl: null`); tooling paths answer 405 with `Allow: GET`; `/docs/package.json` → 404 `40403` |
| 59 | 2026-10-07 | L10 | §10 | Error responses list their codes; bearer operations list 400 `40002`, 401, 403 `40301`/`40309`, 406, 500; GETs list 304 and `If-None-Match` / `If-Modified-Since`; 405 in operation descriptions + `components.responses.MethodNotAllowed`; `40403` in the info error table |
| 60 | 2026-10-07 | L10 | §10 | Query filter parameters have no example value; password flow lists the user scopes, clientCredentials `readings:write` |
| 61 | 2026-10-07 | L10 | §13 L10 | `01-pipeline.test.js` covers `/openapi`, `/docs`, `/docs/` and `swagger-ui-init.js` |
| 62 | 2026-10-07 | L10a (review) | §6.10 | Error body has exactly `code`, `message`, `description`, `error` (always an array); no `more_info` (§16 Q6) |
| 63 | 2026-10-07 | L10a (review) | §13 L2, L3a, D1 | Tests check the four-field body; D1 no longer checks `more_info` |
| 64 | 2026-10-07 | L10a (review) | §13, §14 | New step L10a |
| 65 | 2026-10-07 | L10a (review) | §16 | Q7 recorded: decommissioned credential issue stays 403 `40304` |
