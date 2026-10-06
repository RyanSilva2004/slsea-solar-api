# Build Guide — a prompt for every phase

> **Your job is to direct and critique, not to type code** (brief §10, rubric D4). The agent writes; you check every output against the docs, find its mistakes, get them fixed, and log them.
>
> These prompts were drafted with Claude. Record that in `docs/AI-LOG.md`, and record the prompts you actually used — rewording them in your own words is good evidence of directing the generation.

---

## The loop — every phase

1. **New session.** Paste the **primer** (below) with the phase name and guide sections.
2. **Plan first.** The agent lists the files it will touch and anything unclear. Read the plan; correct it before any code is written.
3. **Build.** Paste the phase prompt.
4. **Read the diff yourself.** Use the phase's "Check yourself" list and the lecture checklist in `docs/AI-LOG.md`.
5. **Review prompt** (below). The agent audits its own code; you decide what is really wrong.
6. **Test.** Run the commands and the Postman folder for the phase. A phase is done only when its folder passes.
7. **Log** the prompt, the mistakes found and the fixes in `docs/AI-LOG.md`.
8. **Commit** with the phase message, then push. One phase = one or more commits.

**Viva rule:** before committing, you should be able to explain every file in the diff — which entity (01) or resource (03) it serves, and why.

---

## Standard prompts

### Primer — start of every session

```text
Read CLAUDE.md. Then read docs/IMPLEMENTATION-GUIDE.md sections <SECTIONS>, and the
design-log entries those sections cite. We are building phase <PHASE> only.

Before writing any code, reply with:
1. The files you will create or change, one line each on what goes in them.
2. Anything in the docs that is unclear, contradictory, or missing for this phase.
Then wait for my OK.
```

### Review — end of every phase

```text
Review the code you wrote in this phase against CLAUDE.md and the "Checks for every phase"
list in docs/IMPLEMENTATION-GUIDE.md §6.5. Also check: the request order of 03 M2, the error
codes of guide §5.2, the headers of guide §5.3, and that the OpenAPI document covers every
route you added. List every mismatch with file and line. Do not fix anything yet.
```

### Fix a failing Postman test

```text
The Postman folder "<FOLDER>" fails on "<TEST NAME>": expected <X>, got <Y>.
Find the cause in the code and fix only that. If you think the test itself is wrong,
say why, quoting the guide section, and change nothing.
```

---

## L0 — Local setup (no agent needed)

**Goal:** the starter runs locally, and the repository exists on GitHub and is shared with the module leader.

**You do:**
1. Unzip the starter. Run `nvm use` (Node 24), then `npm install`.
2. `docker run -d --name slsea-mongo -p 27017:27017 mongo:8` (or install MongoDB Community Server 8).
3. `cp .env.example .env`. Fill `JWT_SECRET` (the command is in the README) and `BOOTSTRAP_ADMIN_PASSWORD`.
4. `npm run dev`. Open `http://localhost:3000/`.
5. Copy `postman/local.postman_environment.json` to `postman/local.private.postman_environment.json`. Fill `admin_password` and `test_password`. The device fields are filled at L1.
6. `npm run test:local -- --folder "L0 Health"` passes.
7. `git init`, create a **private** GitHub repository, push, and **add the module leader as a collaborator now**. The eligibility gate needs it, and the marker sees the whole commit history.

**Commit:** `L0: starter, design docs, Postman collection`

---

## L1 — Seed generator

**Sections:** guide §3.2, §3.3 · **Postman:** none

```text
Phase L1. Write scripts/generate-seed.js (run by `npm run seed`) exactly as guide §3.3
describes, with the document fields of guide §3.2.

- One seeded pseudo-random generator (a small function such as mulberry32), so that ids and
  values are identical on every run for the same end time. UUIDs are built from it.
  No faker, no new dependency. Device secrets alone use node:crypto randomBytes(32), base64url.
- Optional `--end <ISO timestamp>`; default = now rounded down to 15 minutes.
- Write compact (unindented) JSON arrays, Extended JSON dates ({"$date": "..."}), one file per
  collection in data/seed/. Plus seed-output/device-credentials.json and
  seed-output/test-device.json (the first normal Colombo installation by meter_id).
- Follow the counts, names, ids, capacities, diurnal shape (Sri Lanka time, UTC+05:30),
  energy counter, voltage, received_at and edge cases of §3.3 exactly.
- At the end, run every check in the §3.3 check table against the generated data and print
  a pass/fail table. Exit with code 1 if any check fails.
Keep it to plain functions, one per collection, with comments citing the guide.
```

**Check yourself:**
- Every `district_id`, `substation_id` and `installation_id` points at a document that exists (lecture S2).
- Night readings are exactly 0. No `power_kw` above `capacity_kw`. The counter never goes down.
- Edge cases: two never-reported, two silent, two decommissioned (Colombo and Kandy).
- Running it twice with the same `--end` gives identical files, except `installations.json`, whose secret hashes change.
- No `users` file.

**Done when:** `npm run seed` prints all checks passed. Put the test device's id and secret (from `seed-output/test-device.json`) into your private Postman environment.

**Commit:** `L1: seed generator and seed files` (`readings.json` is git-ignored by design)

---

## L2 — Database, models, loader

**Sections:** guide §3.2, §3.3 · 04 AR5 · **Postman:** none

```text
Phase L2.
1. src/db.js: connect with Mongoose to config.mongodbUri (call requireSettings('MONGODB_URI')),
   and a disconnect helper.
2. src/models/: one model per entity — Province, District, Substation, Installation, Reading,
   User — with exactly the fields, types and indexes of guide §3.2. versionKey: false,
   strict schemas, explicit collection names (provinces, districts, substations,
   installations, readings, users).
3. src/server.js: connect and run syncIndexes for every model before app.listen.
4. scripts/load-seed.js (`npm run seed:load`) exactly as "Loading" in guide §3.3: EJSON parse
   with mongoose.mongo.BSON.EJSON, stop if seed collections are not empty unless --drop,
   never touch users, insert in batches of 5,000 in FK order, syncIndexes, print counts.
5. scripts/db-check.js (`npm run db:check`): the same checks as the generator, run against
   the database, as a pass/fail table; exit code 1 on any failure.
No routes in this phase.
```

**Check yourself:**
- The unique indexes from §3.2 exist (look in Compass, or `db.readings.getIndexes()`). They include (`installation_id`, `recorded_at`) on readings, `meter_id`, and `username`.
- The loader refuses to run twice without `--drop`, and never drops `users`.
- The models contain no business logic. That lives in `lib/`.

**Done when:** `npm run seed:load` → `npm run db:check` → every row passes. `npm run dev` still starts.

**Commit:** `L2: models, seed loader, database check`

---

## L3 — Skeleton

**Sections:** guide §4.1, §5.1, §5.2, §4.4 (check order) · 03 M2, U2, U3, S1, E1 · **Postman:** `L3 Skeleton`

```text
Phase L3: the request pipeline, with no resource routes yet.
1. src/lib/errors.js: ApiError(status, code, message, details) and the error code catalogue of
   guide §5.2 as named constants.
2. src/middleware/: origin (403 40309 when config.originSecret is set and X-Origin-Secret does
   not match), negotiation (406 40601 unless Accept allows application/json — absent, */*,
   application/*, application/json), jsonBody (415 41501 unless Content-Type is
   application/json; 400 40001 on malformed JSON — used per route, not app-wide),
   methodNotAllowed(allow) (405 40501 + Allow), errors (404 40401 for unknown paths, and the
   §5.2 error body for everything; 500 → 50001 with no stack).
3. src/openapi/: the OpenAPI 3.1 document — info, servers = publicBaseUrl + basePath, the
   Error schema, the collection envelope schema, and one oauth2 security scheme with the
   password and clientCredentials flows (tokenUrl /solar/v1.0/token) listing every scope of
   guide §4.4. No paths yet except /openapi.
4. src/routes/tooling.js: GET /solar/v1.0/openapi (JSON) and Swagger UI at /solar/v1.0/docs.
5. src/app.js in the order of 03 M2 / 04 §3.1: origin → negotiation → routers at
   config.basePath → 404 → error handler. Keep the health route.
```

**Check yourself:**
- There is no `app.use(express.json())`.
- `/solar/v1.0/nothing` → 404 with the §5.2 body. `Accept: application/xml` → 406.
- The error handler never sends `err.stack`.

**Done when:** `L0 Health` and `L3 Skeleton` pass. Swagger UI opens at `/solar/v1.0/docs`.

**Commit:** `L3: request pipeline, error contract, OpenAPI skeleton`

---

## L4 — Authentication

**Sections:** guide §4.4, §5.4.1, §3.4 · 03 A2–A9, EP1 · **Postman:** `L4 Auth`

```text
Phase L4.
1. src/lib/tokens.js: sign and verify JWTs (HS256) with iss, aud, sub, typ, ver, scope, iat,
   exp, jti — values from guide §4.4. ver = password_changed_at or device_secret_issued_at in
   milliseconds.
2. POST /solar/v1.0/token (routes/token.js + controllers/token.js), guide §5.4.1:
   express.urlencoded on this route only (415 otherwise); grant_type password (bcryptjs
   compare) and client_credentials (HTTP Basic installation_id:device_secret, or client_id /
   client_secret form fields; SHA-256 + crypto.timingSafeEqual). One 401 40103 message for
   every credential failure, including a decommissioned installation and an unknown username
   (compare against a dummy bcrypt hash so timing is the same). Cache-Control: no-store,
   Pragma: no-cache. Scopes by role from the §4.4 table.
3. src/middleware/auth.js: Bearer token → verify → re-check the database exactly as §4.4
   "Every request re-checks the database" → req.principal = { type, id, role,
   jurisdiction_level, district_id, scopes }. 401 40101 (no token) / 40102 (bad, expired or
   revoked) with the WWW-Authenticate values of §5.3.
4. src/middleware/scope.js: scope(...required) → 403 40301.
5. src/lib/area.js: the set of district ids a user may see (DISTRICT / PROVINCIAL / NATIONAL,
   §4.4 "Area"), plus helpers: is a district / province / substation inside the area.
6. Bootstrap in server.js: if users is empty, create hq.admin from the BOOTSTRAP_* settings
   (requireSettings('JWT_SECRET', 'BOOTSTRAP_ADMIN_PASSWORD')).
7. Add /token to the OpenAPI document.
```

**Check yourself:**
- Role, level and posting come from the database on every request, never from the token (03 A7).
- Revocation compares `ver` for **equality**, not `iat` (03 A7).
- The token response uses the same field names as RFC 6749 (`access_token`, `token_type`, `expires_in`, `scope`). Token errors still use the §5.2 body (03 E5).
- No secret or token in any `console.log`.

**Done when:** `L4 Auth` passes. Swagger's **Authorize** button gets a token with both flows.

**Commit:** `L4: token endpoint, JWT auth, scopes, area helper, bootstrap admin`

---

## L5 — Shared helpers and users

**Sections:** guide §5.1, §5.3, §5.4.9, §5.4.10, §4.3 · 03 S5, S7, S8, M4, EP13–EP15 · **Postman:** `L5 Users`, then `L5 Setup — test accounts`

**Prompt 5a — helpers:**
```text
Phase L5, part 1: the shared helpers every later phase uses. No routes yet.
- lib/etag.js: strong ETag = '"' + first 32 hex of SHA-256(JSON body) + '"'; option to leave
  fields out of the hash (for computed_at, later).
- lib/conditional.js: send(req, res, status, body, lastModified) — sets ETag and
  Last-Modified (HTTP date, whole seconds); answers 304 with an empty body when If-None-Match
  matches, else when If-Modified-Since >= Last-Modified (both rounded down to seconds);
  If-None-Match wins (guide §5.3).
- middleware/ifMatch.js: missing → 403 40303; does not match the current ETag → 412 41201.
- lib/pagination.js: offset (default 0) and limit (1–100, default 20) → 400 40002 if invalid;
  envelope { count, next, previous, items } with absolute links that keep every other query
  parameter (guide §5.1).
- lib/query.js: allowed parameters per route; unknown parameter or bad value → 400 40002.
- lib/validation.js: strict body validation — required fields, types, ranges, unknown fields
  → 400 40001 with one entry per field problem in `error` (guide §5.2).
- lib/representations.js: explicit field lists for every resource of guide §5.4.
```

**Prompt 5b — users:**
```text
Phase L5, part 2: /users, /users/{user-id}, /users/{user-id}/password exactly as guide
§5.4.9 and §5.4.10, using the part-1 helpers, scope users:manage (password: account:write
for your own account, users:manage for someone else's). bcryptjs for hashes. Set
password_changed_at (ms) on create and on every password change. Every rule and error code
listed there, in the order of 03 M2 (existence before If-Match, so a second DELETE gives
404). Add all three paths to the OpenAPI document.
```

**Check yourself:**
- PUT replaces the whole user and rejects a `password` field. There is no merge and no PATCH (03 M4).
- The password never appears in any response.
- A duplicate username → 409 `40904`: the unique-index error (E11000) is caught and turned into an `ApiError`.
- An ADMIN can't change or delete their own account. An ADMIN must be NATIONAL.

**Done when:** `L4 Auth` + `L5 Users` pass. Then run **`L5 Setup — test accounts`** once.

**Commit:** `L5: conditional requests, pagination, validation, user management`

---

## L6 — Geography

**Sections:** guide §5.4.2, §4.3 · 03 EP2–EP4 · **Postman:** `L6 Geography`

```text
Phase L6: /provinces, /districts, /substations and their members (guide §5.4.2), scope
geography:read. Filters from guide §4.3 (province-id on districts and substations,
district-id on substations); a filter value that does not exist → 400 40002. Default order
by id. Last-Modified = updated_at (newest in the list for collections). Public reference
data: no area narrowing. Use the L5 helpers for paging, ETag and 304. Add to OpenAPI.
```

**Check yourself:**
- Every district includes `province_id` and every substation includes `district_id` (lecture S5: FK fields present).
- An empty result → 200 with `items: []`, not 404 (lecture S8).
- `/Provinces` and `/provinces/` → 404.

**Done when:** `L6 Geography` passes.

**Commit:** `L6: geography reference data`

---

## L7 — Installations

**Sections:** guide §5.4.3, §4.3, §4.4 (area) · 03 EP6, EP7, §9.3 · **Postman:** `L7 Installations`

```text
Phase L7: /installations and /installations/{installation-id} — GET, POST, PUT, DELETE —
exactly as guide §5.4.3. Lists narrowed to the caller's area; filters province-id,
district-id, substation-id, status (reporting-status comes in L9); a filter outside the area
→ 403 40302; a single installation outside the area → 404 40401. POST: status not accepted,
starts ACTIVE, 201 with Location/Content-Location/ETag/Last-Modified. PUT: full replacement,
If-Match, both substations in the area, DECOMMISSIONED clears device_secret_hash and
device_secret_issued_at. DELETE: If-Match; 409 40903 if it has readings. meter_id unique →
409 40902. Keep the area logic in lib/area.js. Add to OpenAPI.
```

**Check yourself:**
- An installation's district always comes **through its substation** and is never stored on it (01 D4).
- Delete never cascades to readings (lecture S8; 03 M7).
- A user can't read or write installations outside their area by guessing an id.

**Done when:** `L7 Installations` passes.

**Commit:** `L7: installations CRUD with area rules and If-Match`

---

## L8 — Readings

**Sections:** guide §5.4.6, §5.4.11, §4.3 · 03 M5, M6, EP10, EP11, EP17, S3–S6 · **Postman:** `L8 Readings`

**Prompt 8a — device ingestion:**
```text
Phase L8, part 1: POST /installations/{installation-id}/readings and
GET /installations/{installation-id}/readings/{reading-id}, exactly as guide §5.4.6.
- Device token only (readings:write). Path id must equal the token's sub (403 40306).
  installation_id in the body → 400 40001.
- Validation order and codes: 40003 (time), 40004 (ranges), 40005 (counter checked against
  the reading just before AND just after by recorded_at — not the last one received).
- Same recorded_at: identical values → 200 with the existing reading and Content-Location;
  different → 409 40901.
- Store received_at = now. 201 with Location (the member URI), Content-Location, ETag,
  Last-Modified = received_at.
- The member: 404 if it belongs to another installation or the installation is outside the
  caller's area. PUT/DELETE → 405 (append-only).
Add to OpenAPI.
```

**Prompt 8b — history and region readings:**
```text
Phase L8, part 2: GET /installations/{installation-id}/readings (§5.4.6) and
GET /districts/{district-id}/readings, GET /provinces/{province-id}/readings (§5.4.11).
from (inclusive) and to (exclusive) need an offset (400 40003; from >= to → 40003);
sort recorded-at:desc (default) or recorded-at:asc; offset/limit; envelope with count.
Region readings: one query with installation_id $in the region's installations, sorted by
recorded_at then installation_id; substation-id (and district-id for provinces) must be
inside the region (else 400 40002); region outside the caller's area → 403 40302.
Last-Modified rules from guide §5.3. Use the (installation_id, recorded_at) index.
No global /readings route. Add to OpenAPI.
```

**Check yourself:**
- There is no `GET /readings` anywhere (lecture S3).
- The installation is taken from the token, never from the body (lecture S8).
- The counter check compares neighbours **by time**: a late 10:00 reading is checked against 09:45 and 10:15.
- `+05:30` timestamps are accepted. Timestamps without an offset are rejected.

**Done when:** `L8 Readings` passes.

**Commit:** `L8: reading ingestion, history and region readings`

---

## L9 — Derived reads

**Sections:** guide §5.4.4, §5.4.5, §5.5 · 03 R6, EP8, EP9 · **Postman:** `L9 Derived reads`

```text
Phase L9. In lib/derived.js: getLastReading(installationId) (newest by recorded_at) and
reportingStatus (guide §5.5: NEVER_REPORTED / SILENT older than 30 minutes / REPORTING;
null when DECOMMISSIONED). Then:
- GET /installations/{installation-id}/last-known-reading (§5.4.5): the reading,
  Content-Location = its own URI, 404 40402 when there are none.
- GET /installations/{installation-id}/overview (§5.4.4): installation + substation +
  district + province + reporting_status + last_known_reading (null when none).
- The reporting-status filter on GET /installations: compute it for all listed
  installations with ONE aggregation (newest recorded_at per installation), not one query
  per installation.
Both new routes use the same getLastReading. Add to OpenAPI.
```

**Check yourself:**
- The overview **nests** `last_known_reading`. There are no flat `last_power` fields and no full history inside it (lecture S5).
- The newest reading is found by **sorting on `recorded_at`**, not by insert order (lecture S6).
- One shared `getLastReading`, not two copies (lecture S6).

**Done when:** `L9 Derived reads` passes.

**Commit:** `L9: last-known reading, overview, reporting status`

---

## L10 — Generation summaries

**Sections:** guide §5.4.7, §5.5 · 03 EP5, S7 · **Postman:** `L10 Summaries`

```text
Phase L10: the three generation-summary routes of guide §5.4.7, calculated as guide §5.5.
"Today" is the calendar day in Asia/Colombo (UTC+05:30); compute the UTC instant of local
midnight. Use aggregation pipelines over the area's installations — not one query per
installation. Area rules: district inside the area; province only if the whole province is
inside the area; national only for NATIONAL users; else 403 40302; unknown id → 404.
The ETag is computed with computed_at left out, so an unchanged summary still returns 304.
Add to OpenAPI.
```

**Check yourself:**
- Energy today = newest counter today − last counter before local midnight (or the first reading today) per installation, then summed (01 D10). It is never the sum of power values.
- Decommissioned sites are left out of current power, but their energy earlier today still counts (01 D12).
- The counts add up: reporting + silent + never_reported = active.

**Done when:** `L10 Summaries` passes.

**Commit:** `L10: district, province and national generation summaries`

---

## L11 — Device credential

**Sections:** guide §5.4.8 · 03 EP12, §9.1, §9.3 · **Postman:** `L11 Device credential`

```text
Phase L11: POST /installations/{installation-id}/device-credential exactly as guide §5.4.8.
scope credentials:issue; outside the area → 404; DECOMMISSIONED → 403 40304. New secret =
32 random bytes base64url; store SHA-256 hex and device_secret_issued_at (ms); return
installation_id, device_secret, issued_at with Cache-Control: no-store and Pragma: no-cache.
The old secret and every token made from it stop working at once (via ver). GET → 405.
Add to OpenAPI.
```

**Check yourself:**
- The plain secret is never stored and never logged.
- The secret is not returned by `GET /installations/{id}` or in the installation's 201 (03 EP12).

**Done when:** `L11 Device credential` passes.

**Commit:** `L11: device credential issue and revocation`

---

## L12 — Local acceptance

**Postman:** all folders · guide §6.5 acceptance checks

**You do:**
1. Reset the local database: `npm run seed` → `npm run seed:load -- --drop` (users stay).
2. `npm run test:local` — the whole collection, in order.
3. Tick every acceptance check in guide §6.5.

**Prompt — OpenAPI audit:**
```text
Compare src/openapi with guide §4.1 and §4.2. List every route, method, parameter, request
body, response code, scope or required If-Match header that is missing or wrong. Then fix
only the OpenAPI document.
```

**Prompt — code audit:**
```text
Audit the whole codebase against CLAUDE.md, guide §6.5 and the lecture checklist at the end
of docs/AI-LOG.md. Report findings only, grouped by file, most serious first.
```

**Done when:** the full collection passes against localhost. Update the Status columns in guide §4.2 and §6.1.

**Commit:** `L12: local acceptance — full collection passes`

---

## D1 — MongoDB Atlas (no agent)

Follow guide §6.4 D1:
1. Create a free cluster in Mumbai (`ap-south-1`) if it is offered.
2. Create a database user with access to `slsea` only.
3. Allow your IP for now.
4. `MONGODB_URI="<atlas>" npm run seed:load` → `MONGODB_URI="<atlas>" npm run db:check`.

## D2 — EC2 + pm2 (no agent)

Follow guide §6.4 D2:
1. **Budget alert first.**
2. Ubuntu 24.04 `t3.micro` with an Elastic IP.
3. Install Node 24 and pm2. Clone the repo, write the production `.env` with `ORIGIN_SECRET` set.
4. `pm2 start ecosystem.config.js`, then `pm2 save` and `pm2 startup`.
5. Add the Elastic IP to Atlas Network Access.

## D3 — API Gateway (no agent)

Follow guide §6.4 D3:
1. Create an HTTP API with routes `ANY /` and `ANY /{proxy+}`, overwriting the header `x-origin-secret`.
2. Set throttling to rate 50, burst 100.
3. Set `PUBLIC_BASE_URL` to the invoke URL, then `pm2 reload slsea-api`.
4. **No per-route definitions and no gateway authorizer** (04 AR14).

## D4 — Production acceptance

1. Fill `postman/production.private.postman_environment.json`, including `ec2_direct_url`.
2. Run `L5 Setup — test accounts` against production, then `npm run test:prod`.
3. Fill the README's "For the marker" section.
4. Remove your own IP from Atlas.

**Commit:** `D4: production acceptance, README for the marker`

## D5 — Simulator (decide 04 O1 first)

```text
Write scripts/simulate.js (`npm run simulate`) as guide §3.5: for each normal installation
in seed-output/device-credentials.json, get a device token (client credentials) through
API_BASE_URL, read its last-known reading with an analyst token, and post the next reading
for the current 15-minute slot (power following the diurnal shape, counter increasing).
Cache tokens until one minute before they expire. Limit concurrency to 10. Log one summary
line per run, never secrets. Then add <the hosting you chose in 04 O1: a pm2 app entry in
ecosystem.config.js with a 15-minute loop, OR a GitHub Actions workflow on a 15-minute
schedule>.
```

**Commit:** `D5: device simulator`

---

## Before submission

- [ ] `npm run seed` → `MONGODB_URI=<atlas> npm run seed:load -- --drop` → `db:check`, close to the hand-in date.
- [ ] Update the production Postman environment and the simulator with the new test-device secret.
- [ ] `npm run test:prod` passes. Swagger is live at the HTTPS URL.
- [ ] Commit history shows every phase. The module leader is a collaborator.
- [ ] `docs/AI-LOG.md` is complete. The report follows `docs/REPORT-PLAN.md`.
- [ ] You can explain every file (viva).
