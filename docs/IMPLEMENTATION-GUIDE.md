# SLSEA Solar Generation API — Implementation Guide

This is the **only** specification for the build. Build exactly what is written here.

---

## 0. Rules for the agent

- This file is the single source of truth. Do not read or rely on any other design document.
- Build the steps in §13 **in order**, one at a time. Do not start a step until the previous one is marked done.
- A step is done when every "Done when" item passes, its tests are added, and it is committed.
- After each step, update this file:
  - §14 Progress — status, date, commit hash, short note.
  - §15 Issues — every bug or wrong output you found and fixed in code (yours included).
  - §16 Open questions — anything unclear or contradictory. Do not guess; ask the user.
  - §17 Change log — every change to this specification (rules below).

### 0.1 Keeping this specification current

- When anything decided during the build differs from or adds to this file (an answer to an open question, a corrected rule, a new file name, a library constraint, a dropped feature), **edit the section it belongs to** so the section states the rule as it now stands.
- Write statements only: what must be built and how it behaves. No reasons, no history, no "previously" in the section.
- Add one line per edit to §17: date, step, section, the new statement (short).
- Later steps follow the edited sections. Nothing in §15–§17 overrides a section; the section is always the current rule.
- §16 answers are moved into the relevant section (and logged in §17) before the step continues.
- Commit at least once per step. Message format: `L4: geography endpoints` (step id + short summary).
- Do not add endpoints, fields, query parameters, error codes, dependencies or features that are not in this file.
- Never change anything in `seed/`.
- Never commit `.env` or `seed-output/`.
- The database is the seeded **MongoDB Atlas** cluster, used from the first step. Never drop a collection, never delete or change seeded records directly in the database, and never run the seed tool.
- Write tests (`npm test`) may run against Atlas. Every installation they create uses a `meter_id` starting with `TEST-`. The user re-seeds before submission, which removes test data.
- Keep code plain and readable. Small functions. Comments only where they point to a section of this file (e.g. `// §6.7`).
- Use ES modules (`import`/`export`).

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
│   └── requirements.txt             pymongo>=4.6
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
│   │   ├── origin.js  negotiation.js  authenticate.js  require-scope.js
│   │   ├── json-body.js  method-not-allowed.js  not-found.js  error-handler.js
│   ├── lib/
│   │   ├── errors.js                ApiError class + error catalogue (§6.10)
│   │   ├── geography.js             in-memory geography cache + area helpers (§7.6)
│   │   ├── derived.js               latest readings, reporting status, energy today, summaries (§8)
│   │   ├── http-cache.js            ETag, Last-Modified, conditional GET, If-Match (§6.7, §6.8)
│   │   ├── pagination.js            offset/limit parsing, envelope, next/previous links (§6.4)
│   │   ├── query.js                 query-parameter parsing rules (§6.5)
│   │   ├── validation.js            body validators (§9)
│   │   ├── representations.js       document → JSON shape (§6.3)
│   │   ├── ids.js                   counters and id formats (§5.4)
│   │   ├── time.js                  ISO parsing, Sri Lanka day (§6.6, §8)
│   │   ├── tokens.js                JWT sign/verify (§7.3)
│   │   └── secrets.js               device secrets, password hashing (§7.7, §7.8)
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
```

---

## 4. Environment variables

| Name | Example (local) | Required | Used for |
|---|---|---|---|
| `PORT` | `3000` | yes | HTTP port |
| `MONGODB_URI` | `mongodb+srv://USER:PASS@CLUSTER.mongodb.net/slsea` | yes | the seeded Atlas database (name taken from the URI) |
| `PUBLIC_BASE_URL` | `http://localhost:3000/solar/v1.0` | yes | every absolute URL the API returns; no trailing slash |
| `JWT_SECRET` | 64 random characters | yes, ≥ 32 chars | token signing |
| `BOOTSTRAP_ADMIN_USERNAME` | `hq.admin` | no (default `hq.admin`) | §7.9 |
| `BOOTSTRAP_ADMIN_PASSWORD` | — | yes when `users` is empty | §7.9 |
| `ORIGIN_SECRET` | empty locally | no | §7.10; guard is off when empty |
| `TEST_BASE_URL` | `http://localhost:3000/solar/v1.0` | tests/scripts (default `PUBLIC_BASE_URL`) | §11, §12 |
| `TEST_ACCOUNT_PASSWORD` | — | tests/scripts | §11.1 |
| `SIM_DEVICES_FILE` | `seed-output/device-credentials.json` | simulator | §11.2 |
| `SIM_SKIP` | `INS-000002,INS-000065` | simulator (this default) | §11.2 |

- `config.js` stops the process with a clear message if a required variable is missing or invalid.
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

- `INS-000004` (Colombo, substation 1) is a normal site; its secret is in `seed-output/test-device.json` on the machine that ran the seed.
- The Atlas database is already seeded. Re-seeding is done by the user only (before submission), never by the agent or the app:
  `python3 seed/seed_slsea.py --uri "<MONGODB_URI>" --drop`
  It writes device secrets to `seed-output/` (git-ignored).

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
| 0 | `origin.js` (all requests) | `X-Origin-Secret` equals `ORIGIN_SECRET` (only when set) | 403 `40309` |
| 1 | `tooling.js` | tooling routes (§10) answered here; they skip steps 2–7 | — |
| 2 | `negotiation.js` | if `Accept` is present, `req.accepts('application/json')` must be truthy | 406 `40601` |
| 3 | router | path exists; method allowed | 404 `40403` · 405 `40501` |
| 4 | `authenticate.js` | bearer token valid and current (§7.4) | 401 `40101` · `40102` |
| 5 | `require-scope.js` | effective scopes contain the route's scope (§7.5) | 403 `40301` |
| 6 | `json-body.js` (routes with a JSON body) | `Content-Type` is `application/json` (charset allowed), then JSON parses | 415 `41501` · 400 `40001` |
| 7 | controller | in this order: query/body validation (400) → target exists and is in the area (404 / 403) → `If-Match` (403 `40303` / 412) → business rules (409 / 403) → respond |

- `/token` uses its own body handling (§7.2) and no step 4–5.
- `json-body.js` = content-type check, then `express.json({ limit: '100kb' })`. Parse errors → 400 `40001` "Malformed JSON body".
- A JSON body must be a JSON object; anything else → 400 `40001`.
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

Overview and summary shapes: §9 EP8, EP5.

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
- Successful PUT → 200, body = new representation, new `ETag` and `Last-Modified`.

### 6.9 Create responses

Every POST that creates a record:
- 201, body = the new representation.
- `Location` and `Content-Location` = absolute URL of the new resource.
- `ETag` and `Last-Modified` as for a GET of that resource.

### 6.10 Error body and catalogue

Every 4xx and 5xx body:

```json
{
  "code": 40001,
  "message": "capacity_kw must be greater than 0 and at most 1000.",
  "description": "Invalid request body",
  "more_info": "<PUBLIC_BASE_URL>/docs",
  "error": [ { "code": 40001, "message": "capacity_kw must be greater than 0 and at most 1000." } ]
}
```

- `code`: from the table below. `description`: the fixed short title from the table. `message`: detailed text for this case. `more_info`: always `PUBLIC_BASE_URL + "/docs"`. `error`: one entry per field problem; `[]` when there is none.
- All five fields are always present.

| HTTP | Code | Description (fixed) | Used when |
|---|---|---|---|
| 400 | 40001 | Invalid request body | missing/unknown/invalid field; malformed JSON; bad form at `/token` |
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
| `Cache-Control: no-store` + `Pragma: no-cache` | `/token`, device credential, password responses |

---

## 7. Security

### 7.1 Scopes

| Principal | Scopes |
|---|---|
| Device | `readings:write` |
| ANALYST | `geography:read generation:read account:write` |
| INSTALLATION_OFFICER | `geography:read generation:read installations:write credentials:issue account:write` |
| ADMIN | `geography:read users:manage account:write` |

### 7.2 `POST /solar/v1.0/token`

- No bearer token. `Allow: POST`.
- Request `Content-Type` must be `application/x-www-form-urlencoded` → else 415 `41501`. Parse with `express.urlencoded({ extended: false })`.
- Unknown form fields are **ignored**.
- `grant_type` missing or not `password` / `client_credentials` → 400 `40001`.

**`grant_type=password` (users)**
- Fields `username`, `password` required → else 400 `40001`.
- Any `Authorization` header is ignored.
- User not found or `bcrypt.compare` fails → 401 `40103`, `WWW-Authenticate: Basic realm="solar"`.
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

- At start-up, if the `users` collection is empty:
  - `BOOTSTRAP_ADMIN_PASSWORD` missing → exit with an error.
  - Create `{ user_id: randomUUID(), name: "HQ Administrator", username: BOOTSTRAP_ADMIN_USERNAME, role: "ADMIN", jurisdiction_level: "NATIONAL", district_id: 1 }` with the hashed password.
- If any user exists, do nothing.

### 7.10 Origin guard

- When `ORIGIN_SECRET` is non-empty, every request (tooling included) must carry `X-Origin-Secret` equal to it (`timingSafeEqual`), else 403 `40309`.
- When empty, the guard is skipped.

---

## 8. Derived values (`lib/derived.js`)

Constants: reporting interval 15 min; silent threshold 30 min; Sri Lanka offset +05:30 (no DST).

- **Latest reading per installation:** aggregation on `readings`: `$match { installation_id: { $in: ids } }` → `$sort { installation_id: 1, recorded_at: -1 }` → `$group { _id: '$installation_id', doc: { $first: '$$ROOT' } }`. Returns a map id → reading.
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
  - Compute for many installations with aggregations (`$group` with `$first`/`$last` after sorting), not one query per installation.
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
- See §7.2.

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
- Scope `generation:read`. No query parameters.
- Order: unknown district/province → 404 `40401`; region not inside the caller's area → 403 `40302`; national path and caller not `NATIONAL` → 403 `40302`.
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

**POST** — scope `readings:write` (device tokens only), JSON body. Steps in order:
1. Body exactly: `recorded_at`, `power_kw`, `energy_kwh`, `voltage`, all required.
   - `installation_id` in the body → 400 `40001` ("installation_id comes from the URL"). Other unknown field → 400 `40001`.
   - Numbers must be finite JSON numbers → else 400 `40001`. `recorded_at` missing or not a string → 400 `40001`.
2. `recorded_at` invalid per §6.6, more than 2 minutes in the future, or more than 7 days before now → 400 `40003`.
3. Path installation ≠ the token's installation → 403 `40306`.
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
- Scope `credentials:issue`. No body.
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
  - `name`: string, 1–100 characters after trimming.
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
- Body exactly: `name`, `username`, `role`, `jurisdiction_level`, `district_id` (all required; rules as EP13). `password` present → 400 `40001`.
- Order: body (400) → not found (404) → `If-Match` (403 / 412) → target is the caller (403 `40305`) → username taken by another user (409 `40904`).
- Save, `updated_at = now`. Response 200.

**DELETE** — `If-Match` required
- Order: not found (404) → `If-Match` → target is the caller (403 `40305`) → delete. Response 200, body = deleted representation.

### EP15 — `/users/{user-id}/password` — POST
- Required scope: `account:write` or `users:manage` (either passes step 5).
- **Own account** (`user-id` = caller):
  - Body exactly `current_password`, `new_password` → else 400 `40001`.
  - `current_password` wrong → 403 `40307`.
  - `new_password` 10–72 chars and different from the current one → else 400 `40001`.
- **Another account:**
  - Caller lacks `users:manage` → 403 `40308` (checked before looking the user up).
  - Unknown user → 404 `40401`.
  - Body exactly `new_password` (10–72 chars) → else 400 `40001`.
- Save new hash, `password_changed_at = updated_at = now`.
- Response 200 (`Cache-Control: no-store`, `Pragma: no-cache`):
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
- Order: params (400) → unknown region (404 `40401`) → region not inside the caller's area (403 `40302`).
- Query: installation ids of the region (narrowed by filters), all statuses → readings with those ids and the time window, sorted by `recorded_at` (direction from `sort`) then `installation_id` ascending, skip/limit, `countDocuments` for `count`.
- Items: reading representations. Last-Modified = response time.

---

## 10. Tooling routes (no token, no `Accept` check)

| Route | Response |
|---|---|
| `GET /` | 200 `{ "status": "ok", "service": "slsea-solar-api" }` |
| `GET /solar/v1.0/openapi` | 200, the OpenAPI document (JSON) |
| `/solar/v1.0/docs` | Swagger UI (`swagger-ui-express`) loading `/solar/v1.0/openapi` |

**OpenAPI document** (`src/openapi/document.js`, OpenAPI 3.0.3):
- `servers: [{ url: PUBLIC_BASE_URL }]`.
- Every path and method in §9 with: summary, parameters (path + query with types and enums), request body schema, every success response with headers, every error status the endpoint can return.
- Components: schemas for every representation, the collection envelope, the summary, the overview, the token response, and `Error` (§6.10).
- `securitySchemes`: `oauth2` with flows `password` and `clientCredentials`, both `tokenUrl: PUBLIC_BASE_URL + "/token"`, scopes from §7.1 with one-line descriptions.
- Each operation lists its required scope under `security`.
- `If-Match` declared as a **required** header on PUT and DELETE.
- A short `info.description` covering: how to get a token in Swagger (Authorize → password flow with a test account, or client-credentials with `installation_id` + secret), and the error codes table.

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
  - `POST /installations/{id}/readings`. 201 or 200 → keep the new energy. Log any other status and continue.
- Modes: `node scripts/simulate.js --once` (one tick, then exit) and default (tick at every 15-minute boundary + 30 s, forever).
- Base URL from `TEST_BASE_URL`.

---

## 12. Tests (`tests/`)

- Node's built-in runner (`node:test`, `node:assert/strict`) and global `fetch`. The server must already be running.
- `tests/helpers.js`: base URL (`TEST_BASE_URL`), `api(method, path, { token, headers, body, form })`, `userToken(username)` (cached), `deviceToken(id, secret)`.
- Preconditions: database seeded; test accounts created (`npm run accounts`).
- Write tests create their own installation in Colombo (via `colombo.officer`) with `meter_id` = `TEST-` + a unique suffix (e.g. timestamp), issue its credential and post readings with `recorded_at` inside the last hour.
- Tests never modify or delete seeded installations (`INS-000001`–`INS-000240`), except read-only checks and refused operations (e.g. DELETE `INS-000003` → 409).
- Count assertions on seeded areas use `≥` (earlier test runs add records).
- One file per step: `01-pipeline.test.js`, `02-token.test.js`, `03-geography.test.js`, `04-users.test.js`, `05-installations.test.js`, `06-readings.test.js`, `07-views.test.js`, `08-summaries.test.js`.
- `smoke.test.js` is **read-only** (safe for production): health, docs, openapi, token for `national.analyst` and `colombo.analyst`, one GET per endpoint family, a 304 round trip, 401 without token, 403 `40301` for an analyst on `/users`, 404 for `INS-000064` as `colombo.analyst`, 403 `40302` for `colombo.analyst` on Kandy's summary.

---

## 13. Build steps

### L0 — Clean repository and scaffold
- Remove every file and folder except `.git/`, `docs/IMPLEMENTATION-GUIDE.md`, `seed/seed_slsea.py`, `.env` and `seed-output/` (the last two are kept but must never be committed). If `seed/seed_slsea.py` is missing, stop and ask the user for it.
- Run `git log --all --oneline -- .env seed-output` and record the result in §15 (if anything was ever committed, the user must rotate those secrets).
- Create: `package.json` (§2, §3.2), `.gitignore` (§3.3), `.env.example` (§4), `seed/requirements.txt`, the folder layout (§3), `src/config.js`, `src/app.js`, `src/server.js` (listen only), `GET /` health route, a minimal `README.md` (how to install and run).
- **Done when:** `npm install` succeeds with only the §2 dependencies; `npm run dev` starts; `GET /` returns the health JSON; `git status` shows no `.env` or `seed-output/`.

### L1 — Database layer and start-up
- Models (§5.1, §5.2), connection, `createIndexes`, counters (§5.4), geography cache (§7.6), bootstrap admin (§7.9), full start-up sequence (§5.5).
- **Done when:** start-up against the seeded Atlas database succeeds; log shows counters at `installation_id` ≥ 240 and `reading_id` ≥ 159312; geography cache holds 9/25/42; `hq.admin` exists after first start and is not created again on restart; no seed index was dropped (`db.readings.getIndexes()` unchanged).

### L2 — HTTP foundation
- Pipeline order (§6.2): origin guard, tooling bypass, negotiation, 404, 405 helper, error handler, `ApiError` + catalogue (§6.10), `json-body.js`, `lib/http-cache.js` (§6.7, §6.8), `lib/pagination.js` (§6.4), `lib/query.js` (§6.5), `lib/time.js` (§6.6), `lib/representations.js` (§6.3).
- Tests: `01-pipeline.test.js` (406 with `Accept: text/html` on an API path, 404 `40403`, trailing slash 404, upper-case path 404, health OK with `Accept: text/html`, error body has all five fields, origin guard when `ORIGIN_SECRET` is set).
- **Done when:** tests pass.

### L3 — Token and authentication
- `POST /token` (§7.2), `lib/tokens.js`, `lib/secrets.js`, `authenticate.js`, `require-scope.js`, roles → scopes (§7.1), `areaOf` (§7.6).
- Tests: `02-token.test.js` (admin password grant OK; wrong password 401 `40103` + `WWW-Authenticate`; JSON body → 415; missing `grant_type` → 400; unknown form field ignored; `no-store` header; bad bearer → 401 `40102`; no bearer → 401 `40101`; device grant with `INS-000004` if `seed-output/test-device.json` exists, else skipped; device grant for `INS-000003` → 401 `40103`).
- **Done when:** tests pass.

### L4 — Geography
- EP2, EP3, EP4 with pagination, filters, conditional GET.
- Tests: `03-geography.test.js` (counts 9/25/42; `/districts?province-id=1` count 3; `/substations?district-id=1` count 3; unknown id 404; `/districts/abc` 404; `?limit=101` 400 `40002`; unknown param 400; next/previous links; `If-None-Match` → 304 empty body; `If-Modified-Since` → 304; POST → 405 with `Allow: GET`).
- **Done when:** tests pass.

### L5 — Users and passwords
- EP13, EP14, EP15; `scripts/create-test-accounts.js` (§11.1).
- Tests: `04-users.test.js` (create → 201 + Location that resolves; duplicate username 409; ADMIN + DISTRICT 400; PUT without `If-Match` 403 `40303`; stale 412; admin PUT/DELETE own account 403 `40305`; analyst on `/users` 403 `40301`; own password change → old token 401 `40102`; wrong current password 403 `40307`; analyst changing another user's password 403 `40308`; admin reset OK; DELETE then DELETE → 200 then 404; deleted user's token → 401).
- **Done when:** tests pass and `npm run accounts` creates all §11.1 accounts (and skips them on a second run).

### L6 — Installations and device credentials
- EP6, EP7, EP12.
- Tests: `05-installations.test.js` (`colombo.analyst` list count ≥ 27 and `national.analyst` ≥ 240 — exactly 27 / 240 on a fresh seed, more after write tests; `?district-id=4` as `colombo.analyst` → 403 `40302`; `?reporting-status=NEVER_REPORTED` as `colombo.analyst` → only `INS-000001`; `INS-000064` as `colombo.analyst` → 404; officer POST → 201 + Location, status ACTIVE; `status` in POST body 400; substation 8 as `colombo.officer` → 403; duplicate meter 409; PUT full replace with `If-Match`; PUT missing field 400; PUT to substation 8 → 403; DELETE `INS-000003` → 409 `40903`; credential → 200 + secret + `no-store`; device token works with the new secret; re-issue → old device token 401; decommission via PUT → device token 401 `40102`, `/token` 401 `40103`, credential issue 403 `40304`; analyst POST → 403 `40301`; DELETE new installation without readings → 200).
- **Done when:** tests pass.

### L7 — Readings
- EP10 (GET + POST), EP11, EP9.
- Tests: `06-readings.test.js` (POST → 201 + Location that resolves; identical resend → 200 + Content-Location; changed values same time → 409; `installation_id` in body 400; no offset 400 `40003`; 10 min in future 400 `40003`; 8 days old 400 `40003`; power > capacity × 1.05 → 400 `40004`; voltage 300 → 400 `40004`; energy below previous → 400 `40005`; late reading between two others with consistent counter → 201; device posting to another installation 403 `40306`; analyst POST → 403 `40301`; device GET → 403 `40301`; history `count` 672 for `INS-000004`; `sort=recorded-at:asc` order; `from`/`to` window; `from >= to` 400; last-known of `INS-000001` → 404 `40402`; last-known Content-Location resolves; reading of another installation → 404; PUT on a reading → 405).
- **Done when:** tests pass.

### L8 — Overview and region readings
- EP8, EP17.
- Tests: `07-views.test.js` (overview of `INS-000004` complete; `INS-000001` → `last_known_reading: null`, `NEVER_REPORTED`; `INS-000003` → `reporting_status: null`; `INS-000002` → `SILENT` (if the seed is older than 30 min every seeded site may be SILENT — assert only on `INS-000001`/`INS-000003` exact values); `/districts/1/readings` count = sum for Colombo; `?substation-id=8` on district 1 → 400 `40002`; `colombo.analyst` on `/districts/4/readings` → 403 `40302`; `/provinces/1/readings` as `colombo.analyst` → 403; as `western.analyst` → 200; paging links).
- **Done when:** tests pass.

### L9 — Generation summaries
- EP5 with `lib/derived.js` (§8).
- Tests: `08-summaries.test.js` (district 1 counts: active ≥ 26, decommissioned ≥ 1, never_reported ≥ 1 — exactly 26 / 1 / 1 on a fresh seed; numbers ≥ 0; `colombo.analyst` on district 4 → 403; province 1 as `colombo.analyst` → 403, as `western.analyst` → 200; national as `western.analyst` → 403, as `national.analyst` → 200 with active + decommissioned ≥ 240; admin → 403 `40301`; second request with `If-None-Match` → 304 when nothing changed; posting a reading changes the ETag).
- **Done when:** tests pass.

### L10 — OpenAPI and Swagger UI
- `src/openapi/document.js` (§10), `/openapi`, `/docs`.
- **Done when:** `/solar/v1.0/docs` loads in a browser; Authorize with the password flow (`colombo.analyst`) works and "Try it out" succeeds on `/installations`; client-credentials flow works with a device credential; every endpoint and status in §9 is listed; the document is valid OpenAPI 3.0.3 (no errors shown by Swagger UI).

### L11 — Full acceptance and README
- Run the full suite against Atlas with the app running on the laptop.
- Review every endpoint against §9 one more time; fix and log gaps in §15.
- README: what the API is; local setup (Atlas URI in `.env`, laptop IP in Atlas Network Access, `npm run dev`, `npm run accounts`, `npm test`); seed command (user only); test accounts table; edge-case installations table (§5.3); how to get a token (curl examples for both grants); link to `/docs`; error code table reference.
- **Done when:** `npm test` passes completely twice in a row (the second run proves tests do not depend on a clean database); README steps work from a fresh clone.

### D1 — Production readiness
- `ecosystem.config.cjs`: app name `slsea-api`, script `src/server.js`, `node_args: '--env-file=.env'`, `instances: 1`, `autorestart: true`, `max_memory_restart: '300M'`.
- Confirm the origin guard (§7.10) and `PUBLIC_BASE_URL` are used everywhere (Location, links, `more_info`, OpenAPI `servers` and `tokenUrl`).
- README: "Deployment" section (EC2 commands: install Node 24, `npm ci --omit=dev`, `pm2 start ecosystem.config.cjs`, `pm2 save`, `pm2 startup`; update: `git pull && npm ci --omit=dev && pm2 reload slsea-api`).
- **Done when:** app runs under pm2 locally with `ORIGIN_SECRET` set; requests without the header get 403 `40309`; `npm run test:smoke` passes with the header supplied (helpers send `X-Origin-Secret` when `ORIGIN_SECRET` is set).

### D2 — Device simulator
- `scripts/simulate.js` (§11.2).
- **Done when:** `npm run simulate -- --once` against local posts one reading per device (except `SIM_SKIP`) with 201s; a second `--once` in the same slot gets 200s; `INS-000004` overview shows `REPORTING`.

---

## 14. Progress

| Step | Status | Date | Commit | Notes |
|---|---|---|---|---|
| L0 Clean repo + scaffold | ☑ | 2026-10-06 | 5248780 | Old files removed; scaffold, config check, `GET /` health; 5 runtime deps only |
| L1 Database + start-up | ☑ | 2026-10-06 | COMMIT_L1 | 7 models + §5.2 indexes; counters 240 / 159312; geography 9/25/42; `hq.admin` created on first start, skipped on restart; seed indexes unchanged |
| L2 HTTP foundation | ☐ | | | |
| L3 Token + authentication | ☐ | | | |
| L4 Geography | ☐ | | | |
| L5 Users + passwords | ☐ | | | |
| L6 Installations + credentials | ☐ | | | |
| L7 Readings | ☐ | | | |
| L8 Overview + region readings | ☐ | | | |
| L9 Generation summaries | ☐ | | | |
| L10 OpenAPI + Swagger | ☐ | | | |
| L11 Full acceptance + README | ☐ | | | |
| D1 Production readiness | ☐ | | | |
| D2 Device simulator | ☐ | | | |

Status values: ☐ not started · ◐ in progress · ☑ done.

---

## 15. Issues found and fixed

| # | Step | What was wrong | Spec section | Fix | Commit |
|---|---|---|---|---|---|
| 1 | L0 | `git log --all --oneline -- .env seed-output` returned no commits: `.env` and `seed-output/` were never committed; no secrets to rotate | §13 L0 | None needed; both git-ignored (§3.3) | — |
| 2 | L1 | Bootstrap admin (own code) rejected a `BOOTSTRAP_ADMIN_PASSWORD` shorter than 10 characters; §7.9 only requires it to be present | §7.9 | Check reduced to "missing → exit" | COMMIT_L1 |

---

## 16. Open questions

| # | Step | Question | Answer (from the user) |
|---|---|---|---|
| | | | |

---

## 17. Change log (specification edits)

| # | Date | Step | Section | New statement |
|---|---|---|---|---|
| 1 | 2026-10-06 | L1 | §3 | `server.js` holds the bootstrap admin (§7.9) |
| 2 | 2026-10-06 | L1 | §5.5 | Steps 2–6 each log one line (database, indexes, counters, geography, bootstrap) |