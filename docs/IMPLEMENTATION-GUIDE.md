# SLSEA Solar Generation Data API — Implementation Guide

> Used by the coding agent while building. Update the **Status** columns (4.2 and 6) as work is done.
> Design reasons live in `docs/01-data-model-design-log.md`, `docs/02-scope-decisions.md` and `docs/03-resource-model-and-uris.md`.

---

## 1. Business Context

This API serves real-time and historical generation data from rooftop solar installations across Sri Lanka for the **Sri Lanka Sustainable Energy Authority (SLSEA)**. Each installation has a smart meter or inverter that pushes a reading every 15 minutes.

The API serves two kinds of client:

- **Devices (write-clients)** — each device logs in as its installation and pushes generation readings for that installation only. It can do nothing else.
- **SLSEA users (read-clients)** — read data inside their jurisdiction (district, province or national):
  - **Analysts** — read installations, readings and summaries.
  - **Installation officers** — also register, correct, decommission and remove installations, and issue device credentials.
  - **Admins** (always national) — manage user accounts only.

Backend only. The OpenAPI (Swagger) surface is the interface.

---

## 2. Assumptions & Clarifications

| # | Assumption | Rationale |
|---|---|---|
| 1 | Stack: Node.js (24 LTS) + Express 5; `nodemon` in development, `pm2` in production | Lecture help points (keep the service alive) |
| 1c | Deployment: **AWS API Gateway (HTTP API, HTTPS) → one EC2 instance (Ubuntu 24.04) running the app under pm2** | Lecture help points: TLS at the gateway, never a plain-text URL, not everything on one exposed instance. Design reasons in `docs/04-architecture-and-deployment.md` |
| 1a | Database: **MongoDB** (document database), accessed with Mongoose — local MongoDB in development, **MongoDB Atlas** in production | Object-based storage; managed, separate from the app server |
| 1b | Seed data is generated as JSON files by `npm run seed`, then **loaded by a script** (`npm run seed:load`) into whichever database `MONGODB_URI` names | Visible and repeatable files; one command fills local or Atlas; no hidden start-up loading. The brief only requires a plausible, FK-consistent dataset (B§4), not a loading method |
| 1d | **Build and accept everything locally first**, then deploy (section 6) | Problems are found where they are cheap to fix |
| 2 | Base path is `/solar/v1.0` | Feature code + major.minor version |
| 3 | JSON only; snake_case fields. Only exception: the `/token` **request** body is form-encoded | OAuth 2.0 (RFC 6749) defines the token request that way; Swagger's Authorize button needs it |
| 4 | Geography (provinces, districts, substations) is read-only reference data | Loaded by the seeder; never written through the API |
| 5 | Readings are append-only | Never updated or deleted |
| 6 | The meter id is an attribute of the installation; there is no device table | Device credentials are columns on the installation |
| 7 | Users are **not** seed data | `hq.admin` is created at start-up if no user exists; every other account, including test accounts, through `POST /users` (3.4) |
| 8 | An ADMIN is always at level NATIONAL | Enforced by the store on every write |
| 9 | "Today" is the calendar day in `Asia/Colombo`; all timestamps are stored and returned in UTC | No daylight saving in Sri Lanka |
| 10 | A device reports every 15 minutes, including 0 kW at night | Lets "silent" be told apart from "no sun" |
| 11 | The **test device** is a normal (not edge-case) Colombo installation | Visible to `colombo.analyst` and `colombo.officer`; used by the Postman collection |

**Open questions**

- Where the device simulator runs (04 O1) — decided at D5, not needed before.
- *(Resolved)* Meter swap: the replacement meter continues the old counter (commissioning rule, DM-A3), so the counter check has no special case.

---

## 3. Data Model

### 3.1 Entity-Relationship Overview

```
Province (1) ──< (1..N) District (1) ──< (0..N) Substation (1) ──< (0..N) Installation (1) ──< (0..N) Reading
                            │
                            └──< (0..N) User   (posting district)
```

### 3.2 Database Collections (MongoDB)

- **Database:** MongoDB — local MongoDB 8 in development, **MongoDB Atlas** in production. Connection string in `MONGODB_URI`.
- **Access:** Mongoose, **one model per entity** in `src/models/` (`Province`, `District`, `Substation`, `Installation`, `Reading`, `User`), mirroring the data model.
- **Ids:** every document carries its own domain id (`province_id`, `installation_id`, …). MongoDB's `_id` is internal: never returned, never in a URI. Schemas use `versionKey: false`; responses are built from explicit field lists.
- **Times:** stored as BSON dates; returned as ISO strings in UTC with `Z`.
- **Indexes** are created by the app at start-up (Mongoose `syncIndexes`). Rules marked **(code)** are checked in code before writing.

#### provinces
| Field | Type | Description |
|---|---|---|
| `province_id` | String | Unique, readable code (`western`) |
| `name` | String | Display name |
| `updated_at` | Date | Seed time |

#### districts
| Field | Type | Description |
|---|---|---|
| `district_id` | String | Unique, readable code (`nuwara-eliya`) |
| `name` | String | Display name |
| `province_id` | String | → provinces (indexed) |
| `updated_at` | Date | Seed time |

#### substations
| Field | Type | Description |
|---|---|---|
| `substation_id` | String | Unique, readable code (`kotugoda`) |
| `name` | String | Display name |
| `district_id` | String | → districts (indexed) |
| `updated_at` | Date | Seed time |

#### installations
| Field | Type | Description |
|---|---|---|
| `installation_id` | String (UUID) | Unique |
| `meter_id` | String | **Unique index**; 3–32 characters of `A–Z 0–9 -` |
| `capacity_kw` | Number | > 0 and ≤ 1000 |
| `status` | String | `ACTIVE` or `DECOMMISSIONED` (indexed) |
| `substation_id` | String | → substations (indexed) |
| `device_secret_hash` | String \| null | SHA-256 hex of the device secret |
| `device_secret_issued_at` | Date \| null | millisecond precision; becomes the device token's `ver` |
| `created_at` | Date | |
| `updated_at` | Date | Changes on every PUT |

- Cannot be deleted while it has readings **(code)**.
- Setting `status` to `DECOMMISSIONED` clears `device_secret_hash` and `device_secret_issued_at` **(code)**.

#### readings
| Field | Type | Description |
|---|---|---|
| `reading_id` | String (UUID) | Unique |
| `installation_id` | String | → installations |
| `recorded_at` | Date | When the device measured |
| `received_at` | Date | When the API received it |
| `power_kw` | Number | ≥ 0, 3 decimals |
| `energy_kwh` | Number | ≥ 0, 3 decimals, lifetime counter |
| `voltage` | Number | > 0, 1 decimal |

- **Unique index** (`installation_id`, `recorded_at`): one reading per installation per time.
- Index (`installation_id`, `received_at`).

#### users
| Field | Type | Description |
|---|---|---|
| `user_id` | String (UUID) | Unique |
| `name` | String | |
| `username` | String | **Unique index**, lower case |
| `password_hash` | String | bcryptjs |
| `role` | String | `ANALYST`, `INSTALLATION_OFFICER`, `ADMIN` |
| `jurisdiction_level` | String | `NATIONAL`, `PROVINCIAL`, `DISTRICT` |
| `district_id` | String | → districts (posting) |
| `password_changed_at` | Date | set at creation and on every password change; millisecond precision; becomes the user token's `ver` |
| `created_at`, `updated_at` | Date | |

- `role = ADMIN` ⇒ `jurisdiction_level = NATIONAL` **(code)**.
- References between collections are checked in code on every write (MongoDB has no foreign keys).

### 3.3 Seed Data

**What the generator produces** (`scripts/generate-seed.js`, `npm run seed`)

| File | Content | Commit? |
|---|---|---|
| `data/seed/provinces.json` | 9 documents | yes |
| `data/seed/districts.json` | 25 documents | yes |
| `data/seed/substations.json` | 42 documents | yes |
| `data/seed/installations.json` | 240 documents | yes |
| `data/seed/readings.json` | ≈ 160,000 documents (≈ 40 MB) | **no** (git-ignored: large, and it changes with the generation time; `npm run seed` recreates it) |
| `seed-output/device-credentials.json` | 236 plain device secrets `[{ "installation_id", "device_secret" }]` | **no** (git-ignored) |
| `seed-output/test-device.json` | the test device (first normal Colombo installation by `meter_id`): `{ "installation_id", "device_secret" }` | **no** (git-ignored) |

- Each file is a JSON **array** of documents with exactly the fields in 3.2 (including `updated_at`, `created_at`, `received_at`). Dates are MongoDB Extended JSON: `{ "$date": "2026-10-04T08:15:00Z" }`.
- **Every foreign key points at a document that exists. No orphans.** No users.
- Every data value is plausible and repeatable: one seeded pseudo-random generator (no `faker`, no new dependency), so ids and values are the same on every run for the same end time. Only device secrets are truly random (`node:crypto`).
- `npm run seed -- --end 2026-10-20T06:00:00Z` sets the end of the week explicitly; default = now, rounded down to 15 minutes.
- Files are compact (no indentation) to keep them small.

**Loading (`scripts/load-seed.js`, `npm run seed:load`)**
1. Reads the five files in `data/seed/` (Extended JSON, parsed with the BSON `EJSON` parser that ships with Mongoose — no new dependency).
2. Connects to `MONGODB_URI`. If any of the five seed collections already has documents, it **stops** unless `--drop` is given; with `--drop` it empties those five collections first. It **never touches `users`**.
3. Inserts in batches of 5,000, in FK order: provinces → districts → substations → installations → readings.
4. Builds the indexes from the Mongoose models (`syncIndexes`) — a duplicate would fail here, not hide.
5. Prints the count per collection. Then run `npm run db:check`.
- Atlas: run it from your machine while your IP is allowed in Atlas Network Access (6.4 D1), then remove your IP.
- MongoDB Compass is optional — useful to look at the data, not needed to load it.
- **Re-seeding:** `npm run seed`, then `npm run seed:load -- --drop`. New device secrets are generated, so update the Postman environment (`device_secret`) and the simulator afterwards.

**Provinces** (id: name)
`western`: Western · `central`: Central · `southern`: Southern · `northern`: Northern · `eastern`: Eastern · `north-western`: North Western · `north-central`: North Central · `uva`: Uva · `sabaragamuwa`: Sabaragamuwa

**Districts**

| Province | Districts (id · name) |
|---|---|
| western | `colombo` Colombo · `gampaha` Gampaha · `kalutara` Kalutara |
| central | `kandy` Kandy · `matale` Matale · `nuwara-eliya` Nuwara Eliya |
| southern | `galle` Galle · `matara` Matara · `hambantota` Hambantota |
| northern | `jaffna` Jaffna · `kilinochchi` Kilinochchi · `mannar` Mannar · `vavuniya` Vavuniya · `mullaitivu` Mullaitivu |
| eastern | `batticaloa` Batticaloa · `ampara` Ampara · `trincomalee` Trincomalee |
| north-western | `kurunegala` Kurunegala · `puttalam` Puttalam |
| north-central | `anuradhapura` Anuradhapura · `polonnaruwa` Polonnaruwa |
| uva | `badulla` Badulla · `monaragala` Monaragala |
| sabaragamuwa | `ratnapura` Ratnapura · `kegalle` Kegalle |

**Substations** (42; id = name in lower case with hyphens)

| District | Substations |
|---|---|
| colombo | Kolonnawa, Pannipitiya, Dehiwala |
| gampaha | Kotugoda, Biyagama |
| kalutara | Panadura, Horana |
| kandy | Kiribathkumbura, Peradeniya |
| matale | Ukuwela, Dambulla |
| nuwara-eliya | Nuwara Eliya, Hatton |
| galle | Galle, Ambalangoda |
| matara | Matara, Akuressa |
| hambantota | Hambantota, Tissamaharama |
| jaffna | Chunnakam |
| kilinochchi | Kilinochchi |
| mannar | Mannar |
| vavuniya | Vavuniya |
| mullaitivu | Mullaitivu |
| batticaloa | Valaichchenai |
| ampara | Ampara, Kalmunai |
| trincomalee | Trincomalee |
| kurunegala | Kurunegala, Kuliyapitiya |
| puttalam | Puttalam, Chilaw |
| anuradhapura | Anuradhapura, Habarana |
| polonnaruwa | Polonnaruwa |
| badulla | Badulla, Bandarawela |
| monaragala | Monaragala |
| ratnapura | Ratnapura, Balangoda, Embilipitiya |
| kegalle | Kegalle |

**Installations** (240)

| District | Count | District | Count | District | Count |
|---|---|---|---|---|---|
| colombo | 27 | hambantota | 8 | trincomalee | 6 |
| gampaha | 24 | jaffna | 8 | kurunegala | 18 |
| kalutara | 12 | kilinochchi | 4 | puttalam | 9 |
| kandy | 16 | mannar | 4 | anuradhapura | 10 |
| matale | 6 | vavuniya | 4 | polonnaruwa | 6 |
| nuwara-eliya | 6 | mullaitivu | 4 | badulla | 8 |
| galle | 12 | batticaloa | 7 | monaragala | 5 |
| matara | 9 | ampara | 8 | ratnapura | 11 |
| | | | | kegalle | 8 |

- Within a district, installations go to its substations round-robin.
- `installation_id`: UUID. `meter_id`: `SLM-` + 8 digits, sequential from `10000001`.
- `capacity_kw`: one of 1.5, 3.0, 5.0, 10.0, 20.0 (mostly 3.0–10.0).

**Readings**
- Every 15 minutes for the **7 days** ending at the generation time (rounded down to 15 minutes) → 672 per installation.
- `power_kw`: 0 from 18:15 to 06:00 Sri Lanka time (UTC+05:30); rises to a midday peak; never above `capacity_kw`; varies by day (weather) and a little by slot.
- `energy_kwh`: starts at a random lifetime value (500–20,000) and increases by `power_kw × 0.25` each slot; never decreases.
- `voltage`: 215–250, 1 decimal.
- `received_at` = `recorded_at` + a few seconds (5–60).
- `reading_id`: UUID.

**Edge cases** — the first installations by `meter_id` in each district named:

| District | Kind | Status | Readings | Credential |
|---|---|---|---|---|
| colombo, kandy | never reported | ACTIVE | none | none |
| colombo, kandy | silent | ACTIVE | stop 6 hours before the end | yes |
| colombo, kandy | decommissioned | DECOMMISSIONED | stop 3 days before the end | none (decommissioning removes it) |
| all others | normal | ACTIVE | every slot | yes |

**Device credentials**
- Every **normal** and **silent** installation gets a secret (32 random bytes, base64url) — 236 in total. Never-reported and decommissioned installations get none (`device_secret_hash` and `device_secret_issued_at` are `null`).
- `installations.json` stores only `device_secret_hash` (SHA-256 hex).
- Plain secrets go to `seed-output/device-credentials.json` (git-ignored): `[{ "installation_id", "device_secret" }]`.

**The generator checks its files and prints a summary; `npm run db:check` runs the same checks against the database after loading**

| Check | Expected |
|---|---|
| provinces / districts / substations / installations | 9 / 25 / 42 / 240 |
| every foreign key valid | yes |
| every district has a substation and an installation | yes |
| `meter_id` unique | yes |
| `power_kw` > `capacity_kw` | 0 |
| `power_kw` > 0 at night | 0 |
| energy decreasing within an installation | 0 |
| status counts | ACTIVE 238, DECOMMISSIONED 2 |
| installations without readings | 2 |
| installations with a credential | 236 (none on never-reported or decommissioned) |
| readings per installation | 672 (silent 648, decommissioned 384) |

**Before submission:** run `npm run seed`, then `MONGODB_URI=<atlas> npm run seed:load -- --drop`, so the readings end close to marking time. Commit the (small) changed seed files; update the Postman production environment with the new test-device secret.

### 3.4 Accounts (not seed data)

- **Bootstrap:** at start-up, if the `users` collection is empty, the app creates **`hq.admin`** (ADMIN, NATIONAL, posting `colombo`) from `BOOTSTRAP_ADMIN_USERNAME` (default `hq.admin`), `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`. Otherwise it does nothing.
- **Test accounts:** created **once per database through the API** (`POST /users` as `hq.admin`) by the Postman folder **"L5 Setup — test accounts"**, after phase L5. They persist in the database. Password = the Postman environment's `test_password`.

| Username | Role | Level | Posting |
|---|---|---|---|
| `nat.analyst` | ANALYST | NATIONAL | colombo |
| `west.analyst` | ANALYST | PROVINCIAL | colombo |
| `colombo.analyst` | ANALYST | DISTRICT | colombo |
| `kandy.analyst` | ANALYST | DISTRICT | kandy |
| `colombo.officer` | INSTALLATION_OFFICER | DISTRICT | colombo |

- The README lists `hq.admin`, these accounts and the test device (a normal Colombo installation id + its secret, from `seed-output/`). Repository private.

### 3.5 Device Simulator (recommended, phase D5)

- `npm run simulate`: for each normal installation, gets a token (`POST /token`, client credentials) and posts the next reading through the public API.
- To continue the energy counter it first reads the installation's last-known reading with an analyst token.
- Runs every 15 minutes from a GitHub Actions schedule while the work is being marked, so "now" views stay current. Inputs (`API_BASE_URL`, test-account password, device credentials) are repository secrets.

---

## 4. API Routes

### 4.1 Route Map

```
# ── Authentication ─────────────────────────────────────
POST   /solar/v1.0/token                                             # Token for a user or a device

# ── Geography (read-only) ──────────────────────────────
GET    /solar/v1.0/provinces                                         # List provinces
GET    /solar/v1.0/provinces/:provinceId                             # One province
GET    /solar/v1.0/provinces/:provinceId/generation-summary          # Province summary
GET    /solar/v1.0/districts                                         # List districts
GET    /solar/v1.0/districts/:districtId                             # One district
GET    /solar/v1.0/districts/:districtId/generation-summary          # District summary
GET    /solar/v1.0/generation-summary                                # National summary
GET    /solar/v1.0/substations                                       # List substations
GET    /solar/v1.0/substations/:substationId                         # One substation

# ── Installations ──────────────────────────────────────
GET    /solar/v1.0/installations                                     # List installations
POST   /solar/v1.0/installations                                     # Register an installation
GET    /solar/v1.0/installations/:installationId                     # One installation
PUT    /solar/v1.0/installations/:installationId                     # Replace (incl. status)
DELETE /solar/v1.0/installations/:installationId                     # Remove (no readings only)
GET    /solar/v1.0/installations/:installationId/overview            # Installation + context + latest reading
GET    /solar/v1.0/installations/:installationId/last-known-reading  # Latest reading
POST   /solar/v1.0/installations/:installationId/device-credential   # Issue a new device secret

# ── Readings (scoped to an installation) ───────────────
GET    /solar/v1.0/installations/:installationId/readings            # History
POST   /solar/v1.0/installations/:installationId/readings            # Device pushes a reading
GET    /solar/v1.0/installations/:installationId/readings/:readingId # One reading

# ── Readings by region (read-only) ─────────────────────
GET    /solar/v1.0/districts/:districtId/readings                    # All readings of a district's installations
GET    /solar/v1.0/provinces/:provinceId/readings                    # All readings of a province's installations

# ── Users (ADMIN) ──────────────────────────────────────
GET    /solar/v1.0/users                                             # List users
POST   /solar/v1.0/users                                             # Create a user
GET    /solar/v1.0/users/:userId                                     # One user
PUT    /solar/v1.0/users/:userId                                     # Replace a user
DELETE /solar/v1.0/users/:userId                                     # Remove a user
POST   /solar/v1.0/users/:userId/password                            # Change own / reset another's password

# ── Documentation and health (public) ──────────────────
GET    /                                                             # Health: { "status": "ok", "service": "slsea-solar-api" }
GET    /solar/v1.0/docs                                              # Swagger UI
GET    /solar/v1.0/openapi                                           # OpenAPI document (JSON)
```

- No other routes. No global `/readings`. No trailing slashes (→ 404). Other methods on these paths → 405.

### 4.2 Endpoint Status

Status: ❌ not started · 🔨 in progress · ✅ done and checked.

| Endpoint | Scope | Success | Errors | Status |
|---|---|---|---|---|
| `POST /token` | none | 200 | 400 · 401 · 415 | ❌ |
| `GET /provinces`, `/districts` | `geography:read` | 200 / 304 | 400 · 401 · 403 | ❌ |
| `GET /provinces/:id`, `/districts/:id` | `geography:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `GET /…/generation-summary` (3 routes) | `generation:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `GET /substations` | `geography:read` | 200 / 304 | 400 · 401 · 403 | ❌ |
| `GET /substations/:id` | `geography:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `GET /installations` | `generation:read` | 200 / 304 | 400 · 401 · 403 | ❌ |
| `POST /installations` | `installations:write` | 201 | 400 · 401 · 403 · 409 · 415 | ❌ |
| `GET /installations/:id` | `generation:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `PUT /installations/:id` | `installations:write` | 200 | 400 · 401 · 403 · 404 · 409 · 412 · 415 | ❌ |
| `DELETE /installations/:id` | `installations:write` | 200 | 401 · 403 · 404 · 409 · 412 | ❌ |
| `GET /installations/:id/overview` | `generation:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `GET /installations/:id/last-known-reading` | `generation:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `POST /installations/:id/device-credential` | `credentials:issue` | 200 | 401 · 403 · 404 | ❌ |
| `GET /installations/:id/readings` | `generation:read` | 200 / 304 | 400 · 401 · 403 · 404 | ❌ |
| `POST /installations/:id/readings` | `readings:write` | 201 (200 identical retry) | 400 · 401 · 403 · 409 · 415 | ❌ |
| `GET /installations/:id/readings/:readingId` | `generation:read` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `GET /districts/:id/readings`, `/provinces/:id/readings` | `generation:read` | 200 / 304 | 400 · 401 · 403 · 404 | ❌ |
| `GET /users` | `users:manage` | 200 / 304 | 400 · 401 · 403 | ❌ |
| `POST /users` | `users:manage` | 201 | 400 · 401 · 403 · 409 · 415 | ❌ |
| `GET /users/:id` | `users:manage` | 200 / 304 | 401 · 403 · 404 | ❌ |
| `PUT /users/:id` | `users:manage` | 200 | 400 · 401 · 403 · 404 · 409 · 412 · 415 | ❌ |
| `DELETE /users/:id` | `users:manage` | 200 | 401 · 403 · 404 · 412 | ❌ |
| `POST /users/:id/password` | `account:write` (own) or `users:manage` | 200 | 400 · 401 · 403 · 404 · 415 | ❌ |
| `GET /` (health), `/docs`, `/openapi` | none | 200 | — | ❌ |

- Every route can also return 405, 406 and 500.

### 4.3 Query Parameters

| Parameter | Type | Applies to | Example |
|---|---|---|---|
| `offset` | int ≥ 0 (default 0) | every collection | `?offset=40` |
| `limit` | int 1–100 (default 20) | every collection | `?limit=50` |
| `province-id` | text | districts, substations, installations | `/installations?province-id=western` |
| `district-id` | text | substations, installations, users, province readings | `/installations?district-id=colombo` |
| `substation-id` | text | installations, district and province readings | `/installations?substation-id=kotugoda` |
| `status` | `ACTIVE` / `DECOMMISSIONED` | installations | `/installations?status=ACTIVE` |
| `reporting-status` | `REPORTING` / `SILENT` / `NEVER_REPORTED` | installations (ACTIVE only) | `/installations?reporting-status=SILENT` |
| `role` | role | users | `/users?role=ANALYST` |
| `jurisdiction-level` | level | users | `/users?jurisdiction-level=DISTRICT` |
| `from` | timestamp with offset (inclusive) | readings (installation and region) | `?from=2026-10-01T00:00:00%2B05:30` |
| `to` | timestamp with offset (exclusive) | readings (installation and region) | `?to=2026-10-02T00:00:00Z` |
| `sort` | `recorded-at:desc` (default) / `recorded-at:asc` | readings (installation and region) | `?sort=recorded-at:asc` |

- Rule: a parameter name is the attribute name written with URI rules (lower case, hyphens). No URI contains an underscore.

- Default order: geography by id, installations by `meter_id`, users by `username`.
- Unknown parameter or invalid value → 400 `40002`. `from` ≥ `to` or a timestamp without offset → 400 `40003`.

### 4.4 Authentication and Access

**Token endpoint (OAuth 2.0, RFC 6749)** — `POST /solar/v1.0/token`, body `application/x-www-form-urlencoded`:
- Users: `grant_type=password&username=…&password=…`
- Devices: `grant_type=client_credentials` with `Authorization: Basic base64(installation_id:device_secret)` (also accepted: `client_id` and `client_secret` form fields).
- Use `express.urlencoded()` on this route only; everywhere else `express.json()`.

**Access tokens** — JWT (HS256), `Authorization: Bearer <token>`, lifetime `JWT_TTL_MINUTES` (default 60).

| Claim | User token | Device token |
|---|---|---|
| `iss` | `{PUBLIC_BASE_URL}/solar/v1.0` | same |
| `aud` | `slsea-solar-api` | same |
| `sub` | user id | installation id |
| `typ` | `user` | `device` |
| `ver` | `password_changed_at` (ms since epoch) | `device_secret_issued_at` (ms since epoch) |
| `scope` | by role (below) | `readings:write` |
| `iat`, `exp`, `jti` | yes | yes |

- Verify signature, `iss`, `aud`, `exp` on every request.

**Scopes**

| Client | Scopes |
|---|---|
| Device | `readings:write` |
| ANALYST | `geography:read generation:read account:write` |
| INSTALLATION_OFFICER | `geography:read generation:read installations:write credentials:issue account:write` |
| ADMIN | `geography:read users:manage account:write` |

**Every request re-checks the database (immediate revocation)**
- User token: the user must still exist and the token's `ver` must equal the user's current `password_changed_at` (ms). Role, level and posting are read **from the database** (one indexed lookup), not from the token.
- Device token, in this order: installation missing → 401 `40102`; `DECOMMISSIONED` → 403 `40304`; no credential, or `ver` ≠ `device_secret_issued_at` (ms) → 401 `40102`.
- Every 401 here carries `WWW-Authenticate: Bearer realm="solar", error="invalid_token"`.
- Why `ver` and not `iat`: `iat` is in whole seconds, so a token fetched in the same second as a password change or re-issue would be judged wrongly (03 A7).

**Check order (every request):**
0. origin: when `ORIGIN_SECRET` is set, the `X-Origin-Secret` header must match (else 403 `40309`) — blocks direct requests to the EC2 instance
1. `Accept` (else 406)
2. valid token (else 401 + `WWW-Authenticate: Bearer realm="solar"`)
3. scope (else 403 `40301`)
4. body `Content-Type` (else 415), then syntax and fields (else 400)
5. target exists and is inside the area (else 404); an **area** outside the caller's area (403 `40302`); a device writing another installation (403 `40306`)
6. preconditions: `If-Match` missing (403 `40303`), stale (412)
7. business rules (409; 403 `40304`, `40305`, `40307`, `40308`)

- "Exists" (5) is checked before `If-Match` (6), so a repeated DELETE gives 404, not 412.

**Area** = set of district ids:
- `DISTRICT` → the posting district
- `PROVINCIAL` → every district in the posting district's province
- `NATIONAL` → all districts

**Outside the area**

| Request | Response |
|---|---|
| A single asset (installation, overview, last-known reading, readings, device credential) | 404 `40401` |
| An area: `province-id` / `district-id` / `substation-id` filter, a summary or region-readings path, `substation_id` in a body | 403 `40302` |
| A collection without an area filter | narrowed to the area (200) |

- Provinces, districts and **substations**: public reference data, readable by every user token (scope `geography:read`).
- `/users`: ADMIN only, not narrowed.

**Secrets** — passwords: bcryptjs, min length 10, never returned. Device secrets: 32 random bytes base64url, stored as SHA-256, shown once.

**Accounts** — `hq.admin` at start-up; test accounts through the API (3.4).

**Environment variables:** `PORT`, `MONGODB_URI`, `PUBLIC_BASE_URL`, `JWT_SECRET`, `JWT_TTL_MINUTES`, `BOOTSTRAP_ADMIN_USERNAME` (default `hq.admin`), `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`, `ORIGIN_SECRET` (production only; the same value is added as a header by API Gateway). Only `.env.example` is committed.

**OpenAPI security** — one `oauth2` scheme with two flows, both with `tokenUrl: /solar/v1.0/token`: `password` and `clientCredentials`, listing every scope. Each operation lists the scope it needs. This makes Swagger's **Authorize** button fetch tokens itself.

---

## 5. Request / Response Representations

### 5.1 Conventions and Envelope

- `Content-Type: application/json; charset=utf-8` on every body, via `res.json()`.
- `Accept` must allow `application/json` (or `application/*`, `*/*`, absent), else 406. POST/PUT bodies must be `application/json` (except `/token`: `application/x-www-form-urlencoded`), else 415. Malformed JSON → 400.
- Fields snake_case. Unknown body fields → 400.
- Timestamps ISO 8601, returned in UTC (`Z`); input must carry an offset.
- `power_kw`, `energy_kwh`, `capacity_kw`: up to 3 decimals. `voltage`: 1 decimal.
- Every URL in headers and bodies is absolute (`PUBLIC_BASE_URL`).
- **Every collection** uses this envelope:

```json
{
  "count": 672,
  "next": "https://<host>/solar/v1.0/installations/3f0c…/readings?offset=20&limit=20",
  "previous": null,
  "items": [ ]
}
```

- `count` = total matches. `next`/`previous` keep all other parameters; `null` at the ends. No matches → 200 with `"items": []`.

### 5.2 Error Response

Every 4xx and 5xx:

```json
{
  "code": 40001,
  "message": "The request body has invalid fields.",
  "description": "Validation failed",
  "more_info": "https://<host>/solar/v1.0/docs#errors",
  "error": [ { "code": 40001, "message": "capacity_kw must be greater than 0" } ]
}
```

- `code` and `message` always present; `error` only for several field problems. 500 → `code` 50001, no stack trace.

| Code | HTTP | Meaning |
|---|---|---|
| 40001 | 400 | Invalid request body or field values |
| 40002 | 400 | Invalid or unknown query parameter |
| 40003 | 400 | Invalid time value or window |
| 40004 | 400 | Reading value out of range |
| 40005 | 400 | Energy counter out of order |
| 40101 | 401 | Missing token |
| 40102 | 401 | Invalid, expired or revoked token |
| 40103 | 401 | Wrong credentials |
| 40301 | 403 | Token lacks the required scope |
| 40302 | 403 | Area outside your jurisdiction |
| 40303 | 403 | `If-Match` required |
| 40304 | 403 | Installation is decommissioned |
| 40305 | 403 | An ADMIN cannot change or delete their own account |
| 40306 | 403 | A device may write only its own installation |
| 40307 | 403 | Current password is wrong |
| 40308 | 403 | You can only change your own password |
| 40309 | 403 | Direct access not allowed; use the HTTPS URL |
| 40401 | 404 | Resource not found |
| 40402 | 404 | Installation has no readings yet |
| 40501 | 405 | Method not allowed |
| 40601 | 406 | Requested media type not supported |
| 40901 | 409 | A different reading exists for this time |
| 40902 | 409 | `meter_id` already in use |
| 40903 | 409 | Installation has readings; decommission it instead |
| 40904 | 409 | `username` already in use |
| 41201 | 412 | `If-Match` does not match |
| 41501 | 415 | Request body must be `application/json` |
| 50001 | 500 | Unexpected server error |

### 5.3 Headers and Conditional Requests

| Header | When |
|---|---|
| `ETag` | every successful GET, every 201 and PUT, every 304 — strong: `"` + first 32 hex of SHA-256(body) + `"`. **Generation summaries: hash the body without `computed_at`** |
| `Last-Modified` | every successful GET, every 201 and PUT (values below) |
| `Location` + `Content-Location` | every 201 |
| `Content-Location` | last-known reading; identical reading retry |
| `WWW-Authenticate` | every 401: `Bearer realm="solar"` (bad or expired token adds `error="invalid_token"`); on `/token`: `Basic realm="solar"` |
| `Cache-Control: no-store` + `Pragma: no-cache` | `/token`, device credential, password |
| `Allow` | every 405 — the methods the path supports (e.g. `GET, PUT, DELETE`) |

| Resource | Last-Modified value |
|---|---|
| Province, district, substation (+ their collections) | `updated_at` (seed time) |
| Installation, user | `updated_at` |
| Reading, last-known reading | `received_at` |
| Readings collection | newest `received_at` of the installation |
| Installations list, users list, overview, summaries, region readings | time the response is built |

- **Conditional GET:** `If-None-Match` matches → 304, empty body, `ETag` header. Else `If-Modified-Since` not older than `Last-Modified` → 304. `If-None-Match` wins.
- **Time precision:** `Last-Modified` is an HTTP date (`toUTCString()`, whole seconds). Compare `If-Modified-Since` with the stored time rounded down to the second.
- **Conditional writes:** PUT and DELETE on installations and users require `If-Match`. Missing → 403 `40303`; not matching → 412 `41201`.

### 5.4 Endpoints

#### 5.4.1 `POST /token`

**Request (user)** — `Content-Type: application/x-www-form-urlencoded`
```
grant_type=password&username=colombo.analyst&password=…
```
**Request (device)** — plus `Authorization: Basic base64(installation_id:device_secret)`
```
grant_type=client_credentials
```
**Response (200)**, `Cache-Control: no-store`, `Pragma: no-cache`:
```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 3600, "scope": "geography:read generation:read account:write" }
```
- Missing/unknown `grant_type` or fields → 400 `40001`. Body not form-encoded → 415.
- Wrong credentials or no credential issued → 401 `40103`, `WWW-Authenticate: Basic realm="solar"` (one message for every case).
- Device of a DECOMMISSIONED installation → 401 `40103`, like every other credential failure: decommissioning removed its credential, so it cannot be authenticated (03 E4, EP1).
- Errors use the 5.2 body (not RFC 6749's `error` field).

#### 5.4.2 Geography

**Response (200)** — `GET /solar/v1.0/districts/colombo`
```json
{ "district_id": "colombo", "name": "Colombo", "province_id": "western" }
```
- Province: `{ "province_id", "name" }`. Substation: `{ "substation_id", "name", "district_id" }`.
- Unknown id → 404 `40401`. Filter value that does not exist → 400 `40002`.
- All three are public reference data: no area narrowing, no area errors.

#### 5.4.3 Installations

**Response (200)** — `GET /solar/v1.0/installations/3f0c…`
```json
{ "installation_id": "3f0c…", "meter_id": "SLM-10002345", "capacity_kw": 5.0, "status": "ACTIVE", "substation_id": "kotugoda" }
```
- **POST** body `{ "meter_id", "capacity_kw", "substation_id" }` (all required; `status` not accepted, set to ACTIVE) → 201 + `Location` + `Content-Location` + `ETag` + `Last-Modified`, body = representation. Invalid fields (`meter_id` 3–32 of `A–Z 0–9 -`; `capacity_kw` > 0 and ≤ 1000) or unknown `substation_id` → 400 `40001`; substation outside area → 403 `40302`; `meter_id` taken (by any installation) → 409 `40902`.
- **PUT** body `{ "meter_id", "capacity_kw", "status", "substation_id" }` (all required) + `If-Match` → 200. Changing `substation_id` needs both substations in area (else 403 `40302`). `status` ACTIVE ↔ DECOMMISSIONED. Decommissioning clears the device credential; reactivating needs a new one (5.4.8).
- **DELETE** + `If-Match` → 200 with the deleted representation. Has readings → 409 `40903`. Second DELETE → 404.

#### 5.4.4 `GET /installations/:id/overview`

**Response (200):**
```json
{
  "installation": { "installation_id": "3f0c…", "meter_id": "SLM-10002345", "capacity_kw": 5.0, "status": "ACTIVE", "substation_id": "kotugoda" },
  "substation":   { "substation_id": "kotugoda", "name": "Kotugoda" },
  "district":     { "district_id": "gampaha", "name": "Gampaha" },
  "province":     { "province_id": "western", "name": "Western" },
  "reporting_status": "REPORTING",
  "last_known_reading": { "reading_id": "…", "installation_id": "3f0c…", "recorded_at": "2026-10-04T08:15:00Z", "power_kw": 3.412, "energy_kwh": 10234.551, "voltage": 236.4 }
}
```
- `reporting_status` null when DECOMMISSIONED; `last_known_reading` null when no readings.

#### 5.4.5 `GET /installations/:id/last-known-reading`

- 200: the reading (5.4.6) with the newest `recorded_at`; `Content-Location` = that reading's URI.
- No readings → 404 `40402`.

#### 5.4.6 Readings

**Response (200)** — `GET /solar/v1.0/installations/3f0c…/readings/9a1b…`
```json
{ "reading_id": "9a1b…", "installation_id": "3f0c…", "recorded_at": "2026-10-04T06:15:00Z", "power_kw": 3.412, "energy_kwh": 10234.551, "voltage": 236.4 }
```

**POST (device token)** — body `{ "recorded_at", "power_kw", "energy_kwh", "voltage" }`; `installation_id` not accepted.
- Path id ≠ token `sub` → 403 `40306`. DECOMMISSIONED → 403 `40304` (from the token check). A deleted installation fails the token check → 401 `40102`.
- 400 `40003`: `recorded_at` without offset, > 2 minutes in the future, or > 7 days old.
- 400 `40004`: `power_kw` < 0 or > `capacity_kw` × 1.05; `voltage` outside 180–270; `energy_kwh` < 0.
- 400 `40005`: `energy_kwh` below the reading just before, or above the reading just after, in `recorded_at` order.
- Same `recorded_at` exists: identical values → 200 (existing reading, `Content-Location`); different → 409 `40901`.
- Success → 201 + `Location` + `Content-Location` + `ETag` + `Last-Modified` (= `received_at`).

**GET collection** — envelope; `from`, `to`, `sort`, `offset`, `limit` (4.3). No readings → 200, `count: 0`.
**GET member** — must belong to the installation in the path, else 404.

#### 5.4.7 Generation Summaries

| Path | Allowed callers |
|---|---|
| `/districts/:districtId/generation-summary` | area contains the district |
| `/provinces/:provinceId/generation-summary` | area contains the whole province |
| `/generation-summary` | NATIONAL only |

**Response (200):**
```json
{
  "area": { "level": "DISTRICT", "id": "colombo", "name": "Colombo" },
  "day": "2026-10-04",
  "computed_at": "2026-10-04T08:20:11Z",
  "current_power_kw": 412.338,
  "energy_today_kwh": 1820.104,
  "installations": { "active": 22, "reporting": 20, "silent": 1, "never_reported": 1, "decommissioned": 1 }
}
```
- National: `"area": { "level": "NATIONAL", "id": null, "name": "Sri Lanka" }`. Unknown id → 404; not allowed → 403 `40302`.

#### 5.4.8 `POST /installations/:id/device-credential`

- No body. Not found / outside area → 404. DECOMMISSIONED → 403 `40304`.
- **Response (200)**, `Cache-Control: no-store`:
```json
{ "installation_id": "3f0c…", "device_secret": "…", "issued_at": "2026-10-04T08:20:11Z" }
```
- The old secret, and every token made from it, stops working immediately.

#### 5.4.9 Users

**Response (200)** — `GET /solar/v1.0/users/7c2d…`
```json
{ "user_id": "7c2d…", "name": "Nimali Perera", "username": "nimali.p", "role": "ANALYST", "jurisdiction_level": "DISTRICT", "district_id": "kandy" }
```
- **POST** `{ "name", "username", "password", "role", "jurisdiction_level", "district_id" }` → 201.
- **PUT** `{ "name", "username", "role", "jurisdiction_level", "district_id" }` + `If-Match` → 200; `password` field → 400.
- **DELETE** + `If-Match` → 200.
- Role `ADMIN` with a level other than NATIONAL → 400 `40001`. Changing or deleting your own account → 403 `40305`. Username taken → 409 `40904`. Password never returned.
- The password is not part of the representation, so PUT neither sends nor changes it (use 5.4.10).
- Changes take effect on the user's next request (4.4 re-check); a deleted user's tokens stop working at once.

#### 5.4.10 `POST /users/:id/password`

**Own password** (any user token, `account:write`, `:id` = own id):
```json
{ "current_password": "…", "new_password": "…" }
```
**Reset another user's** (ADMIN, `users:manage`, `:id` ≠ own id):
```json
{ "new_password": "…" }
```
**Response (200)**, `Cache-Control: no-store`:
```json
{ "user_id": "7c2d…", "password_changed_at": "2026-10-04T08:20:11Z" }
```
- Missing field, new password under 10 characters or equal to the current one → 400 `40001`.
- Current password wrong → 403 `40307`. Another user's id without `users:manage` → 403 `40308`. Unknown user → 404.
- Sets `password_changed_at`; every older token of that user stops working.
- GET, PUT, DELETE on this path → 405.

#### 5.4.11 `GET /districts/:id/readings` · `GET /provinces/:id/readings`

- Read-only. Readings of every installation inside the region (any status), as the readings collection envelope.
- Query: district — `substation-id`; province — `district-id`, `substation-id`; both — `from`, `to`, `sort`, `offset`, `limit` (4.3).
- Order: `recorded_at` (per `sort`), then `installation_id`, so pages never shift.
- Region outside the caller's area → 403 `40302`; unknown region → 404 `40401`; filter value not in the region → 400 `40002`.
- `Last-Modified` = time the response is built. POST → 405 (`Allow: GET`): readings are created only under their installation.

### 5.5 Derived Values

- **Shared helper:** `getLastReading(installationId)` = newest by `recorded_at`. Used by overview, last-known reading, reporting status, summaries.
- **Reporting status** (ACTIVE only): `NEVER_REPORTED` (no readings) · `SILENT` (newest `recorded_at` older than 30 minutes) · `REPORTING` (otherwise). DECOMMISSIONED → null.
- **Current power:** sum of the newest `power_kw` of every ACTIVE, REPORTING installation in the area.
- **Energy today:** for each installation in the area with a reading today (local): newest `energy_kwh` today − (last `energy_kwh` before local midnight, or else first today). Sum.
- **Counts:** `active`, `decommissioned` by status; `reporting`, `silent`, `never_reported` by reporting status.

---

## 6. Implementation Order

**Rule: everything is built and accepted locally (L0–L12) before anything is deployed (D1–D5).** Each phase is one or more commits. Every prompt, every generator mistake found and every fix is logged in `docs/AI-LOG.md` **while the phase is built** — it becomes the report's AI-disclosure appendix and the rubric D4 evidence. A prompt for every phase: `docs/BUILD-PROMPTS.md`; standing rules for the coding agent: `CLAUDE.md`. Status: ❌ · 🔨 · ✅.

**Code layout** (04 §3.2): `routes/` wiring only (path, method, middleware, handler) · `controllers/` read the request and send the response · `lib/` shared logic (area, derived values, ETag, pagination, validation, representations) · `middleware/` · `models/` one per entity. Every path uses `router.route(path)…all(methodNotAllowed(...))` so the 405 and `Allow` sit next to the methods.

### 6.1 Local build

| Phase | Work Items | Done when | Depends On | Postman folder | Status |
|---|---|---|---|---|---|
| **L0 — Local setup** | Node 24, local MongoDB 8 (MongoDB Compass optional); repo with README, `.gitignore`, `.env.example`, `nodemon.json`, `ecosystem.config.js`; docs and `postman/` committed; health `GET /` runs with `npm run dev` | `localhost:3000/` returns `{"status":"ok","service":"slsea-solar-api"}`; docs committed before feature code | — | L0 Health | ❌ |
| **L1 — Seed files** | `scripts/generate-seed.js` → `data/seed/*.json` + `seed-output/` (3.3) | generator prints every check as passed; the four small seed files committed (`readings.json` git-ignored) | L0 | — | ❌ |
| **L2 — Database** | Mongoose connection (`MONGODB_URI`), one model per entity with indexes (3.2), `scripts/load-seed.js`, `scripts/db-check.js` (3.3) | `npm run seed:load` fills the local database; `npm run db:check` passes every "Expected result" row | L1 | — | ❌ |
| **L3 — Skeleton** | Express app (`app.set('etag', false)`; strict and case-sensitive routing on every router), base path, origin guard, 5.1 rules, error handler (5.2), 404/405 with `Allow`, Swagger UI + OpenAPI | `GET /solar/v1.0/nothing` → 404 error body; `Accept: application/xml` → 406 | L2 | L3 Skeleton | ❌ |
| **L4 — Auth** | `POST /token` (form-encoded, Basic for devices), JWT with `iss`/`aud`/`jti`/`ver`, auth middleware with the database re-check, scopes, area helper, out-of-area rules, bootstrap `hq.admin` (4.4, 3.4) | `hq.admin` and the test device get tokens with the right claims; wrong credentials → 401 + `WWW-Authenticate: Basic`; Swagger **Authorize** works (the first protected route arrives in L5, so the 401/403 checks on protected routes run there) | L3 | L4 Auth | ❌ |
| **L5 — Users** | 5.4.9, 5.4.10 | no token → 401 + `WWW-Authenticate: Bearer`; device token → 403 `40301`; ADMIN with level DISTRICT → 400; ADMIN deleting self → 403 `40305`; password change → old token 401; deleted user's token → 401. **Then run folder L5 Setup** | L4 | L5 Users, then L5 Setup | ❌ |
| **L6 — Geography** | 5.4.2 + envelope, pagination, filters, ETag/Last-Modified, 304 | `If-None-Match` → 304 empty body; `count` is the total | L5 | L6 Geography | ❌ |
| **L7 — Installations** | 5.4.3 + `If-Match` | DELETE with readings → 409; PUT without `If-Match` → 403; stale → 412; POST → 201 + Location | L6 | L7 Installations | ❌ |
| **L8 — Readings** | 5.4.6, 5.4.11 | device POST → 201 and Location returns it; identical retry → 200; window and both sorts work; region readings work | L7 | L8 Readings | ❌ |
| **L9 — Derived reads** | 5.4.4, 5.4.5, 5.5, `reporting-status` filter | never-reported site → last-known 404, overview `last_known_reading: null` | L8 | L9 Derived reads | ❌ |
| **L10 — Summaries** | 5.4.7 | 3 routes return; other district → 403; non-national → national 403; "today" in `Asia/Colombo` | L9 | L10 Summaries | ❌ |
| **L11 — Device credential** | 5.4.8 | new secret → old secret and old device token → 401; decommission → that device's unexpired token gets 403 `40304` on write and a new token request gets 401 `40103` | L7 | L11 Device credential | ❌ |
| **L12 — Local acceptance** | Whole Postman collection (Newman) against `localhost` + the acceptance checks below; Swagger complete | every test passes locally | L0–L11 | all | ❌ |

### 6.2 Deployment (only after L12 is ✅)

| Phase | Work Items | Done when | Status |
|---|---|---|---|
| **D1 — Atlas** | Atlas M0 cluster; database user; network access = EC2 Elastic IP only (temporarily your IP for loading); `npm run seed:load` against Atlas (3.3) | `MONGODB_URI=<atlas> npm run db:check` passes from your machine | ❌ |
| **D2 — EC2 + pm2** | Instance, Node 24, repo clone, production `.env`, `pm2 start ecosystem.config.js`, `pm2 save` + `pm2 startup` | `curl http://<elastic-ip>:3000/` with the origin header → `{"status":"ok"}`; without it → 403 `40309` | ❌ |
| **D3 — API Gateway** | HTTP API, routes `ANY /` and `ANY /{proxy+}`, origin-secret header mapping, throttling; `PUBLIC_BASE_URL` = invoke URL; `pm2 reload` | `https://<api-id>.execute-api.<region>.amazonaws.com/` → 200; `/solar/v1.0/docs` live | ❌ |
| **D4 — Production acceptance** | Folder L5 Setup against production; whole collection (Newman) against the gateway URL; README (URL, accounts, test device); repo shared with the module leader | every test passes in production | ❌ |
| **D5 — Simulator** | 3.5; GitHub Actions schedule every 15 min during marking | normal sites show REPORTING; summaries show current power | ❌ |

### 6.3 Local setup (L0)

```bash
node -v                                          # 24.x (≥ 22.12)
docker run -d --name slsea-mongo -p 27017:27017 mongo:8   # or install MongoDB Community Server 8
npm install
cp .env.example .env                             # MONGODB_URI=mongodb://localhost:27017/slsea, secrets
npm run dev                                      # nodemon → http://localhost:3000/
```
- **MongoDB Compass** is optional: handy for looking at the data (3.3).

### 6.4 Deployment runbook (D1–D3)

**D1 — MongoDB Atlas**
1. Create a free **M0** cluster in the region closest to your EC2 region.
2. Database Access: a user with read/write on `slsea` only.
3. Network Access: add your own IP (for loading), later the EC2 Elastic IP; remove your IP after D4.
4. From your machine: `MONGODB_URI="<atlas connection string>" npm run seed:load`, then `MONGODB_URI="<atlas>" npm run db:check` (3.3).

**D2 — EC2 + pm2**
1. Set an AWS **budget alert** first. Launch Ubuntu 24.04, `t3.micro`; key pair; security group: SSH 22 from your IP, TCP 3000 from anywhere (`ORIGIN_SECRET` blocks direct use); allocate an **Elastic IP**.
2. On the instance:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs git
   sudo npm install -g pm2
   git clone <your private repo URL> slsea-solar-api && cd slsea-solar-api
   npm ci --omit=dev
   nano .env                      # MONGODB_URI (Atlas), JWT_SECRET, BOOTSTRAP_*, ORIGIN_SECRET, PUBLIC_BASE_URL
   pm2 start ecosystem.config.js
   pm2 save && pm2 startup        # run the printed command
   ```

**D3 — API Gateway (HTTP API)**
1. Integration: HTTP URL `http://<elastic-ip>:3000/{proxy}`; routes `ANY /{proxy+}` and `ANY /` (root → `http://<elastic-ip>:3000/`).
2. Parameter mapping on the integration: **overwrite header** `x-origin-secret` = your `ORIGIN_SECRET`.
3. Stage `$default`, auto-deploy; throttling rate 50, burst 100.
4. Put the invoke URL in `PUBLIC_BASE_URL` (then `pm2 reload slsea-api`), the README and the Postman production environment.

**Every later deploy:** `git pull && npm ci --omit=dev && pm2 reload slsea-api`.

### 6.5 Testing with Postman

- Collection `postman/slsea-solar-api.postman_collection.json`; environment templates `postman/local.postman_environment.json` and `postman/production.postman_environment.json` (committed, secrets empty).
- Copy a template to `postman/local.private.postman_environment.json` (git-ignored) and fill: `admin_password` (= `BOOTSTRAP_ADMIN_PASSWORD`), `test_password`, `device_installation_id`, `device_secret` (the test device, from `seed-output/`). Production also needs `ec2_direct_url`.
- Folder names show their phase (`L0 Health` … `L11 Device credential`, `D4 Production only`). A phase is ✅ only when its folder passes.
- **Tokens are automatic:** a request with `Authorization: Bearer {{tok_<name>}}` gets a fresh token from the collection's pre-request script (`tok_admin`, `tok_device`, `tok_colombo_analyst`, …).
- **Contract checks run on every response** (collection test script, tests named `[contract]`): JSON content type, snake_case keys, no `_id`/secret fields, the 5.2 error body with a code matching the status, `WWW-Authenticate` on 401, `Allow` on 405, Location/Content-Location/ETag/Last-Modified on 201, ETag/Last-Modified on GET 200, empty body on 304.
- Later folders use ids saved by earlier ones (e.g. the Kandy installation from L7). Run a phase together with the folders before it: `npm run test:local -- --folder "L7 Installations" --folder "L8 Readings"`, or the whole collection (L12 / D4).
- Newman: `npm run test:local` (L12) or `npm run test:prod` (D4).

**Checks for every phase** (coding agent)
- Paths: lower case, hyphens, nouns only, no trailing slash; no global `/readings`. `/Provinces` and `/provinces/` → 404.
- Every path has a 405 handler for other methods, with the `Allow` header.
- OpenAPI: `If-Match` declared as a required header on every PUT and DELETE; every scope listed per operation.
- Bodies: snake_case, `res.json()`, FK id fields present, no extra wrapper.
- POST that creates → 201 + Location that resolves; PUT replaces (never merges); no PATCH; second DELETE → 404.
- 401 always with `WWW-Authenticate`; 401 and 403 never swapped; secrets and tokens never logged.
- Device installation taken from the token, never the body; counter checked in `recorded_at` order.

**Acceptance checks (L12 locally, D4 in production)**
- [ ] Every collection returns `count`, `next`, `previous`.
- [ ] Readings: time window, sort both ways, pagination.
- [ ] Conditional GET → 304 with empty body (member, collection, last-known reading).
- [ ] POST reading → 201 + Location that returns the reading; identical retry → 200; conflicting → 409.
- [ ] `colombo.analyst`: Kandy installation → 404; `?district-id=kandy` → 403.
- [ ] Device token: reading anything → 403 `40301`; writing another installation → 403 `40306`.
- [ ] `colombo.officer`: create → PUT with If-Match → decommission → that device's writes refused.
- [ ] DELETE with readings → 409; DELETE NEVER_REPORTED site → 200; again → 404.
- [ ] ADMIN with non-NATIONAL level → 400; `hq.admin` deleting itself → 403.
- [ ] A user changes their password → their old token gets 401, and a token requested straight afterwards works; a deleted user's token gets 401.
- [ ] Swagger **Authorize** (password and client-credentials flows) obtains tokens.
- [ ] `colombo.analyst`: `/districts/colombo/readings?from=…&to=…` → 200; `/districts/kandy/readings` → 403.
- [ ] (D4 only) A request straight to the EC2 instance (no gateway) → 403 `40309`.
- [ ] `Accept: application/xml` → 406; `Content-Type: text/plain` body → 415.
- [ ] District, province and national summaries; national refused for non-national users.
- [ ] Every error uses the 5.2 body.

---

## 7. Future Considerations

- National-level readings collection (all regions in one call)
- Password reset by email (self-service)
- Meter swap where the new meter cannot continue the old counter (readings would record their `meter_id`; 02 L6)
- Audit log of who changed installations and users
- Refresh tokens; a full OAuth authorization server (authorization-code flow with a login UI)
- Cursor-based pagination for the growing readings history
- Retention policy for old readings
- Several EC2 instances behind the gateway (the database is already shared)
- Batch upload of buffered readings
- Rate limiting and monitoring
