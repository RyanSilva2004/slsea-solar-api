# 02 — Domain Model and Scope Decisions

**Project:** NB6007CEM — SLSEA Real-Time Solar Generation Data API
**Status:** v2.9 — seed files loaded by a script (`npm run seed:load`) instead of a manual Compass import; `readings.json` not committed (S6, UC-S2). v2.8 — O2 resolved: a replacement meter continues the old counter (commissioning rule, DM-A3); simulator hosting deferred to D5 (04 O1). v2.7 — review against WSO2 and lecture notes: credential handover is installation id + secret (S8); Postman folders named by phase. v2.6 — MongoDB storage; seed files imported manually; test accounts through the API (S6, UC-S, L11/L12 resolved). v2.5 — region readings collections (UC-A7b; L10 resolved); AWS deployment (S6, L11). v2.4 — password change in scope; immediate token revocation; decommissioning revokes the credential; bootstrap ADMIN is `hq.admin`. v2.3 substations public (S5); filter names; OAuth password grant listed (L15). v2.2 simple static seed file (S6, G1, L13). v2.1 in-memory object store. v2.0 rewritten for clarity.
**Matches:** 01 data model v5.7 · 03 API design v6.5 · 04 architecture v2.3 · Implementation guide

> Working notes, not report text. Write the report in your own words.

### Reference keys

| Key | Source |
|---|---|
| **B§x** | Coursework brief |
| **G§x** | WSO2 REST API Design Guidelines (the design standard, B§13) |
| **L-Sx** | Lecture notes, session x (tuk-tuk teaching system) |
| **R-Dx** | Rubric dimension x |
| **DM-x** | 01 data model log (D = decision, R = rule, A = assumption) |

### How this log is laid out
1. **Section 0** — the test used to decide what is in scope.
2. **Section 1** — the domain model, step by step: each entity, its relationships, its attributes, and why.
3. **Section 2** — the main scope decisions (S1–S9).
4. **Section 3** — every actor and use case. This is the bridge to the resource model (03).
5. **Sections 4–9** — edge-case rules, coverage, additions, limitations, open items, out of scope.

---

## 0. The scope test

Something is **in scope** only if it passes at least one test:

| Test | Meaning |
|---|---|
| **1. Required** | The brief or rubric asks for it, or a guideline the rubric marks requires it |
| **2. Needed to make a requirement work** | Without it, a required feature cannot be built or shown working |
| **3. Prevents a real fault** | Without it, the API gives wrong data or leaks data across jurisdictions |
| **4. Completes the business case** | SLSEA needs it day to day, it comes from the data model, and it adds no new kind of client and no new subsystem (no email, messaging, second server) |

- Everything else is out of scope (section 9). Writing it down still matters: it feeds the report's critical evaluation.

---

## 1. The domain model, step by step

### 1.0 The shape at a glance

```
Province 1 ──< 1..* District 1 ──< 0..* GridSubstation 1 ──< 0..* SolarInstallation 1 ──< 0..* GenerationReading
                     │
                     └──< 0..* User   (posting)
```

- **Five entities form one strict tree**, from province down to reading. Every reading has exactly one path to exactly one province.
- **User hangs off the same tree** at district level. So "may this user see this reading?" is answered by comparing two positions in one tree.
- **Why a tree:** B§3 defines the model as "a five-entity geographic-and-asset hierarchy plus a user entity". A strict tree keeps every jurisdiction check simple and leak-free (DM-D4).
- **Data model before design:** this model is stated without tables, URLs or JSON (B§3: "model the domain in an implementation-independent form first"; G§3; L-S3).

---

### Step 1 — Province

- **Why it exists:** B§3 — "top-level jurisdiction scope". National users see all provinces; provincial users see one.
- **Relationship:** 1 province has **1..\*** districts.
  - Fixed national geography: every province has districts (B§3: "1 Province has many Districts").

| Attribute | Why |
|---|---|
| `province_id` | Identifier. A readable code from the official name (`western`). Reference data never changes, so a readable code is safe and makes URIs and filters self-explaining (DM-D15). |
| `name` | Display name (`North Western`). |

---

### Step 2 — District

- **Why it exists:** B§3 — "mid-level jurisdiction scope". District users are bounded by it, and it is where SLSEA staff are posted (Step 6).
- **Relationships:**
  - each district is in **exactly 1** province — a district can never sit in two provinces;
  - 1 district has **0..\*** substations — the brief's seed (20+ substations for 25 districts) means a district *may* have none, so the model allows it. Our seed gives every district at least one (S6).

| Attribute | Why |
|---|---|
| `district_id` | Identifier. Readable code (`nuwara-eliya`) (DM-D15). |
| `name` | Display name. |
| `province_id` | The one province it belongs to. |

---

### Step 3 — GridSubstation

- **Why it exists:** B§3 — "the grid node installations connect to". It groups sites by the piece of grid they feed.
- **Relationships:**
  - each substation is in **exactly 1** district;
  - 1 substation has **0..\*** installations — a substation may have no rooftop sites yet (B§3: "1 Substation has many Installations").

| Attribute | Why |
|---|---|
| `substation_id` | Identifier. Readable code (`kotugoda`) (DM-D15). |
| `name` | The name analysts recognise. |
| `district_id` | The one district it is in. |

- **Kept small on purpose:** voltage class or transformer rating have no consumer in the brief (DM-D17).

---

### Step 4 — SolarInstallation

- **Why it exists:** B§3 — "a rooftop solar site (the asset)". It is what devices report for, and what dashboards show.
- **Relationships:**
  - each installation connects to **exactly 1** substation — a rooftop site feeds one grid node;
  - 1 installation has **0..\*** readings — a newly registered site has none until its device first reports (B§3: "1 Installation has many Readings").

| Attribute | Why |
|---|---|
| `installation_id` | Its own identifier, **not** the meter id. A meter can be replaced; the site stays the same site with the same history (DM-D3). |
| `meter_id` | The smart meter or inverter that reports for the site. **An attribute, not a Device entity** (B§3: "introducing a needless Device entity is a modelling flaw"). Unique. |
| `capacity_kw` | Rated output. Lets the API reject impossible readings (power above capacity) and lets dashboards compare output with size (DM-R5). |
| `status` | `ACTIVE` or `DECOMMISSIONED`. A shut-down site keeps its history but stops writing and stops counting as live (S8; DM-D12). |
| `substation_id` | The one substation it connects to. District and province are reached **through this**, never stored again, so they can never disagree (DM-D4). |

- **Deliberately not stored:**
  - `last_power`, `last_reading_time`, `today_energy` — the brief calls last-value fields "the single most common modelling mistake" (B§3); these are derived (S9).
  - `district`, `province` — reached through the substation (DM-D4).
  - Owner name, address, GPS — no consumer, and personal data (data minimisation, DM-D14).

---

### Step 5 — GenerationReading

- **Why it exists:** B§3 — "its own append-only time series, not a set of last-value fields". It holds the history that the analytical view needs.
- **Relationship:** each reading comes from **exactly 1** installation.
- **Append-only:** never changed, never deleted (DM-R3). Readings are evidence of what was generated.

| Attribute | Why |
|---|---|
| `reading_id` | Its own identifier. A created reading must "report where it now lives" (B§5), so it must be addressable (G§7.3; L-S8) (DM-D8). |
| `installation_id` | The owning installation (B§3 minimum). Always the authenticated device's own installation (DM-R10). |
| `recorded_at` | The timestamp (B§3 minimum): when the device **took the measurement**, not when it arrived. Sorting, time windows and "latest" all use it (DM-D9). |
| `power_kw` | Instantaneous power (B§3 minimum). Drives the operational "now" view. |
| `energy_kwh` | Cumulative energy (B§3 minimum): the meter's **lifetime** counter. "Energy today" is a difference of two counter values, so missed readings never lose energy (DM-D10). |
| `voltage` | Voltage (B§3 minimum). Grid health at the connection point. |

- **Unique:** one reading per installation per `recorded_at` (DM-D8). A resent reading can never be stored twice.
- **Only the brief's five properties plus an identifier.** B§3 allows extra fields if justified; none has a consumer (DM-D9).
- **Arrival time** (`received_at`) is kept by the implementation for conditional GET, not in the model: it describes the system, not the domain (DM-D16).

---

### Step 6 — User

- **Why it exists:** B§3 — "an SLSEA person with a role and a jurisdiction". B§2: users are the read-clients; some roles also look after installations or accounts (S1, S7).
- **Relationship:** each user is **posted to exactly 1** district; 1 district has **0..\*** users.
  - Every SLSEA person works from an office, and every office is in one district (DM-A11).
  - This is the lecture pattern (every officer is stationed at a station) translated to our lowest staffed level, the district (L-S1; S2).

| Attribute | Why |
|---|---|
| `user_id` | Identifier. |
| `name` | The person's name. |
| `role` | **What** the person may do: `ANALYST`, `INSTALLATION_OFFICER`, `ADMIN`. B§3 "a role"; "analyst" is B§2's own word (S3). |
| `jurisdiction_level` | **How far** they see from their posting: `NATIONAL`, `PROVINCIAL`, `DISTRICT`. B§3 "a jurisdiction"; B§2 "national, provincial, and district users" (S2). |
| `district_id` | The posting district. The visible area is derived from it plus the level (S2). |

- **Not in the model:** login name and password. They exist only so the system can log people in, so they belong to the security design (DM-D16).
- **No link from User to Installation** ("registered by"): permissions come from area, not ownership, so nothing would use it (DM-D18).

---

### 1.7 What is deliberately **not** an entity

| Candidate | Why not |
|---|---|
| Device / Meter | B§3: the meter id is an attribute of the installation; a Device entity is "a modelling flaw" |
| Owner / Household | The owner never acts in the system (B§2) and is personal data (DM-D14) |
| Jurisdiction / Area | Derived from posting + level, never stored (S2) |
| Last-known reading, summaries, reporting status | Derived on request; storing them would go stale (DM-D13) |
| Device credential | A security detail of the installation, kept by the implementation (S8) |
| Assignment (cover another province) | Not needed by the brief; noted as a limitation (S2) |

---

## 2. Main scope decisions

### S1 — Installations are registered by SLSEA staff (INSTALLATION_OFFICER)

- **Problem:** a device can only log in *as* an installation that already exists. Someone must create installations.
- **Options:** (a) installer companies as clients · (b) an SLSEA staff role · (c) devices register themselves · (d) seed only.
- **Chosen: (b).**
- **Why:**
  - B§2 allows exactly two kinds of client (devices write, SLSEA users read). (a) adds a third, outside party.
  - Recording a grid-connected site is an authority act. The installer does the physical work; SLSEA records it.
  - (a) needs "edit only what you registered", which is per-record ownership (attribute-based control, G§12.3) — scope creep.
  - (c) lets any device invent installations; B§2 says a device "can write nothing else".
  - (d) leaves no full CRUD on the write path (B§5; R-D3).
- **Name:** "installation officer", not "installer". The installer is the outside company in option (a). "Officer" is the usual title for authority staff.
- **Report use:** the rejected installer option is the textbook example of where scopes stop being enough (R-D7). It costs nothing to build.

### S2 — Jurisdiction = one posting district + a level

- **Options:** (a) level + an optional link to a province *or* a district · (b) **a posting district (always one) + a level** · (c) link users to a substation.
- **Chosen: (b).**
- **Why:**
  - It cannot hold a wrong combination: there is always exactly one link, always to a district. (a) could say "provincial" while linking to a district.
  - It follows the taught pattern (one mandatory posting + a level, L-S1) at the right level for this domain.
  - A promotion is one change: only the level moves.
  - (c) copies the lecture's word "station" without its meaning: a substation is grid equipment, not an office.

| Level | Typically posted at | Sees |
|---|---|---|
| DISTRICT | a district office | the posting district |
| PROVINCIAL | a provincial office | every district in the posting district's province |
| NATIONAL | head office, Colombo | everything |

- **Assumptions:** DM-A11 (every office is in one district), DM-A12 (a provincial user covers the province they are posted in), DM-A13 (national users are posted in Colombo).

### S3 — Role is separate from level; three roles

- **Why two attributes:** "what you may do" and "how far you see" are independent questions. A district analyst and a district officer see the same area with different powers. B§3 names both: "a role **and** a jurisdiction".
- **Rejected: one combined list** (NATIONAL, PROVINCIAL, DISTRICT, INSTALLATION_OFFICER, ADMIN).
  - It mixes breadth values and duty values in one field.
  - It moves officers' and admins' reach out of the data into hard-coded rules.
  - It cannot store a provincial officer (DM-D7).

| Can… | ANALYST | INSTALLATION_OFFICER | ADMIN |
|---|---|---|---|
| see provinces and districts | ✓ | ✓ | ✓ |
| see substations (public reference data) | ✓ | ✓ | ✓ |
| read installations, readings, summaries in their area | ✓ | ✓ | — |
| register, correct, decommission, remove installations in their area | — | ✓ | — |
| issue a device credential in their area | — | ✓ | — |
| create, change, remove user accounts; reset a password | — | — | ✓ |
| change their own password | ✓ | ✓ | ✓ |
| write generation readings | never | never | never |

- **ANALYST:** B§2's "analysts and regional operators". The brief gives them no different powers (DM-A7).
- **INSTALLATION_OFFICER reads data too:** after registering a site they must confirm the device has started reporting, and they chase silent devices.
- **ADMIN is always NATIONAL** (DM-R13): account management is a head-office job. It reads no generation data (least privilege) and cannot change its own account.

### S4 — Geography and substations are reference data

- **Decision:** provinces, districts and substations are read-only through the API.
- **Why:**
  - Grid substations belong to the electricity utility, not to SLSEA, and change rarely.
  - B§5 asks for CRUD on "the **writable** resources". Installations (full CRUD), users (full CRUD) and readings (create) already show every method correctly.
  - L-S7 also keeps the tuk-tuk geography read-only.

### S5 — Visibility: geography is open, assets are scoped

- **Provinces and districts:** any logged-in user. Public national geography; dashboards need it for menus.
- **Substations:** any logged-in user. They are utility-owned reference data (S4), and officers need the full list to choose a connection point. (Until v2.2 they were scoped; that let a caller tell "hidden" from "does not exist" through different error codes.)
- **Installations, readings, summaries:** only inside the user's area (S2). These are SLSEA's assets; hiding them is what R-D7's "no cross-jurisdiction leakage" protects.
- **User accounts:** ADMIN only.
- **Out-of-area answers** (decided in 03 A6): a single asset → 404 (hide it); an area → 403 (geography is public, so refusing reveals nothing).

### S6 — Seed data

| Element | Seed | Why |
|---|---|---|
| Provinces | 9 | B§4 |
| Districts | 25 | B§4 |
| Substations | 42, at least one per district, named after towns in the district | B§4 says 20+; one per district lets every district user see real data (R-D5) |
| Installations | 240 in every district, weighted to populous ones | B§4 says 200+ |
| Readings | 7 days at 15 minutes = 672 per site, ≈ 160,000, ending when the seed files are generated | B§4 says "1 week or more"; pagination must matter |
| Daily shape | zero at night, midday peak | B§4 "realistic diurnal shape" |
| Users | none in the seed | `hq.admin` is created at start-up when no user exists; test accounts are created through the API (S7) |
| Freshness | regenerate and reload the seed just before submission; a device simulator keeps posting during marking | Data should look current when marked (G1, L13) |

- **Edge cases built into the seed** (R-D5 marks "empty result sets, not-found"):
  - an installation with **no readings** (last-known reading → 404; it can be deleted);
  - a **SILENT** installation (readings stop hours before deployment);
  - a **DECOMMISSIONED** installation with history (writes refused, history readable);
  - deleting an installation **with** readings is refused.
- **Test accounts** for every role and level, including two different districts, are created once per database through `POST /users` by `hq.admin` (Postman "L5 Setup"). The database keeps them (G14).
- **Storage:** MongoDB — local in development, **MongoDB Atlas** in production. Data created through the API persists.
- **How it is produced:** one generator script writes one JSON file per collection (lecture S2 approach: every foreign key valid, no orphans). A loader script then fills whichever database `MONGODB_URI` names — local first, later Atlas — and never touches `users`.
- **Why a script, not a manual import:** the brief asks for a plausible, FK-consistent dataset (B§4), not a loading method. One command is repeatable, can't miss a file, and builds the indexes straight after loading, so a duplicate shows up at once. The four small files are committed; `readings.json` (≈ 40 MB, different on every generation) is recreated by the generator instead.
- Full specification: Implementation guide §3.3–3.5.

### S7 — Users are created through the API by an ADMIN

- **Why (test 4):** staff join, get promoted, change posting and leave. User is in the brief's model (B§3).
- **Who:** ADMIN only. Not installation officers (different duty). Not self sign-up (anyone could claim any area).
- **Rules (DM-R13):** an ADMIN is always NATIONAL; an ADMIN never changes or removes their own account (stops the last ADMIN locking everyone out).
- **Bootstrap:** `hq.admin` (national ADMIN) is created at start-up from secret settings, never committed. Not seed data. The marker's test accounts are created the same way (S6).
- **Passwords:** the ADMIN sets the first one; the user then changes it with the current password; an ADMIN can reset a forgotten one. Stored hashed, never returned. Without this, the ADMIN would know everyone's password (03 A10).
- **Revocation:** every request re-checks the store, so a deleted user, a changed role or a changed password takes effect immediately (03 A7).

### S8 — Installation lifecycle and device credentials

- **Lifecycle (`status`):**
  - **Why (tests 3 and 4):** without it, a shut-down site shows as silent for ever and inflates district counts. Its history must stay (B§3).
  - **Rules:** set by an installation officer; DECOMMISSIONED accepts no readings; it is left out of "current" figures; it can be set back to ACTIVE.
  - **Delete** stays only for registrations made by mistake, before any reading arrived (DM-D12).
- **Device credential:**
  - **Why (test 2):** without it, an installation registered through the API could never send a reading. Only seeded sites would work.
  - **One operation, "issue a credential":** at commissioning, after a meter swap, or after a leak. A new secret makes the old one stop working.
  - **No separate revoke operation:** decommissioning **removes** the credential; DELETE removes it with the site; re-issue replaces it. Tokens made from an old credential stop working at once (03 A7, A11).
  - Shown once, stored only hashed.
  - **The credential is a pair:** the installation id (the public client id) and the secret (private). Both go into the meter at commissioning; `meter_id` is never used to log in.
  - **How the device then connects:** it exchanges the credential for a short-lived token at `/token` (OAuth client credentials) and posts readings on its own — full flow in 03 §9.1.

### S9 — Derived values: computed on request, never stored

| Value | Rule | Used by |
|---|---|---|
| Last-known reading | the reading with the newest `recorded_at` | the "now" view (B§5) |
| Reporting status (ACTIVE only) | `NEVER_REPORTED` (no readings) · `SILENT` (newest reading older than ~30 min) · `REPORTING` (otherwise; 0 kW at night still counts) | overview, installation filter, summary counts |
| Current power of an area | sum of the newest power of REPORTING sites | generation summary |
| Energy today | per site: newest counter today − last counter before Sri Lanka midnight (or first today) | generation summary |
| Generation summary | district, province **and** national — one per jurisdiction level (DM-D6) | operational dashboards (B§5 stretch) |

- **Why not stored:** stored copies go stale and become a second source of truth (DM-D13). The brief warns against last-value fields (B§3).
- **"Today"** is the Sri Lanka calendar day; times are stored as absolute instants (DM-D11).

---

## 3. Actors and use cases (the bridge to the resource model)

### 3.1 Actors

| Actor | Kind of client | Authenticates as | Area |
|---|---|---|---|
| **Device** (smart meter / inverter) | write-client (B§2) | its installation | its own installation only |
| **ANALYST** — district, provincial or national | read-client (B§2) | a user | from posting + level (S2) |
| **INSTALLATION_OFFICER** — district, provincial or national | read-client + registry keeper (S1) | a user | from posting + level |
| **ADMIN** (always national) | account manager (S7) | a user | everything (accounts only) |
| **System** (deployment, seed generator, optional simulator) | not an API client, except the optional simulator, which acts as devices | — | — |

### 3.2 Device

| ID | Use case | Rules | → Resource (03) |
|---|---|---|---|
| UC-D1 | Log in as its installation | needs a credential; refused if DECOMMISSIONED | `POST /token` |
| UC-D2 | Send a reading every 15 minutes | own installation only; validated; never reads anything (B§2) | `POST /installations/{installation-id}/readings` |
| UC-D3 | Resend after a timeout | identical resend is harmless; a different value at the same time is a conflict (G5) | same as UC-D2 |
| UC-D4 | Send a late reading after being offline | accepted up to 7 days old; counter checked against neighbours in time (G6, G7) | same as UC-D2 |

### 3.3 ANALYST (and the read side of every officer)

| ID | Use case | Rules | → Resource (03) |
|---|---|---|---|
| UC-A1 | Log in | — | `POST /token` |
| UC-A2 | Build region menus | geography is open (S5) | `/provinces`, `/districts` (+ members) |
| UC-A3 | List substations | public; filter by province / district | `/substations` |
| UC-A4 | List installations in my area | filter by province / district / substation / status / reporting status | `/installations` |
| UC-A5 | See one site with its context and latest reading | one call for a dashboard tile | `/installations/{installation-id}/overview` |
| UC-A6 | "What is this site generating now?" | operational view (B§6) | `/installations/{installation-id}/last-known-reading` |
| UC-A7 | Browse a site's history | time window, sort by time, pages (B§5) | `/installations/{installation-id}/readings` |
| UC-A7b | Browse a region's history | district or province, filter by substation, time window, sort, pages (B§5, B§6) | `/districts/{district-id}/readings`, `/provinces/{province-id}/readings` |
| UC-A8 | Open one reading | e.g. following a Location link | `/installations/{installation-id}/readings/{reading-id}` |
| UC-A9 | "What is my district / province / country generating now and today?" | only areas inside my own | `…/generation-summary` (3 routes) |
| UC-A10 | Refresh a dashboard cheaply | conditional GET → 304 (B§5) | every GET above |
| UC-A11 | Ask about another district | refused / hidden (S5) | 403 or 404 |
| UC-A12 | Change my own password | current password required; older tokens stop working | `POST /users/{user-id}/password` |

### 3.4 INSTALLATION_OFFICER (in addition to UC-A1 – UC-A11)

| ID | Use case | Rules | → Resource (03) |
|---|---|---|---|
| UC-O1 | Register a newly commissioned site | substation must be in my area; meter id unique | `POST /installations` |
| UC-O2 | Issue the site's device credential | ACTIVE sites in my area; shown once | `POST /installations/{installation-id}/device-credential` |
| UC-O3 | Confirm the device started reporting | reporting status moves from NEVER_REPORTED to REPORTING | overview / `?reporting-status=` filter |
| UC-O4 | Correct a site's details | full replacement; If-Match protects against two officers editing at once | `PUT /installations/{installation-id}` |
| UC-O5 | Move a site to another substation | both old and new substation in my area (G4) | `PUT /installations/{installation-id}` |
| UC-O6 | Replace a meter | update `meter_id`, then issue a new credential; the installer sets the new meter to continue the old counter (G12, DM-A3) | `PUT …` + `POST …/device-credential` |
| UC-O7 | Find silent devices | reporting status filter | `/installations?reporting-status=SILENT` |
| UC-O8 | Shut a site down / bring it back | status DECOMMISSIONED / ACTIVE (S8) | `PUT /installations/{installation-id}` |
| UC-O9 | Remove a registration made by mistake | only if it has no readings (S8) | `DELETE /installations/{installation-id}` |

### 3.5 ADMIN

| ID | Use case | Rules | → Resource (03) |
|---|---|---|---|
| UC-M1 | Log in | — | `POST /token` |
| UC-M2 | List staff accounts | filter by district, role, jurisdiction level | `GET /users` |
| UC-M3 | Add a new member of staff | ADMIN accounts must be NATIONAL; username unique | `POST /users` |
| UC-M4 | Promote or transfer someone | full replacement; If-Match; never own account | `PUT /users/{user-id}` |
| UC-M5 | Remove a leaver | never own account | `DELETE /users/{user-id}` |
| UC-M6 | See geography to choose a posting | geography is open | `/provinces`, `/districts` |
| UC-M7 | Reset a forgotten password | not for own account (use UC-A12) | `POST /users/{user-id}/password` |

### 3.6 System and marking day

| ID | Use case | How |
|---|---|---|
| UC-S1 | First start: someone must be able to log in | `hq.admin` created from secret settings when no user exists (S7) |
| UC-S2 | Fill the database | `npm run seed` generates the files; `npm run seed:load` loads them (S6) |
| UC-S3 | Keep data current on marking day | regenerate and reload the seed before submission; the simulator posts readings through the public API (G1) |
| UC-S4 | Let the marker test every role and area | test accounts created once through `POST /users` (G14) |

### 3.7 Use cases → resource types (summary for 03)

| Resource type (G§4) | Comes from use cases |
|---|---|
| Collections | UC-A2, A3, A4, A7, M2 (catalogue) · UC-O1, D2, M3 (creation) |
| Atomic resources | UC-A2, A8, O4, O5, O8, O9, M4, M5 |
| Scoped collection | UC-A7, D2 — readings only make sense per installation |
| Composite | UC-A5 |
| Processing functions | UC-A6 (last-known reading), UC-A9 (summaries), UC-O2 (credential), UC-D1/A1/M1 (token) |
| Controllers | none — no use case changes two resources at once |

---

## 4. Edge-case rules (found by walking a reading's full life)

| # | Case | Rule |
|---|---|---|
| G1 | Seed is a fixed week; marking is later | Regenerate and reload the seed just before submission; simulator during marking (S6, L13) |
| G2 | A silent device still has a noon reading at night | Only REPORTING sites count in "current power" (S9) |
| G3 | No reading before midnight (new site, offline overnight) | Baseline = first reading today; energy before it is not counted (limitation) |
| G4 | An officer moves a site to another substation | Both substations must be in the officer's area; history moves with the site (limitation G17) |
| G5 | A reading is resent | Same values → harmless; different values at the same time → conflict |
| G6 | A very late or wrongly-dated reading | Accepted up to 7 days old; older or more than 2 minutes in the future → rejected |
| G7 | A late 10:00 reading arrives after the 11:00 one | Counter checked against the neighbouring readings **in time**, not the last one received |
| G8 | Empty results | Collections → empty list; no readings → last-known reading not found; empty district → summary of zeros |
| G9 | Huge page requests | Page size capped at 100 |
| G10 | Time without a time zone | Rejected; never guessed |
| G11 | Can a device read? | No. B§2: it "can write nothing else" |
| G12 | Meter swap | Update `meter_id`, then issue a new credential; the new meter continues the old counter (commissioning rule, DM-A3) (UC-O6) |
| G13 | Delete or decommission | Delete removes the credential with the site; decommissioning removes it too, and refuses writes and tokens even from an unexpired token |
| G14 | The marker must be able to test areas and roles | Test accounts at every role and level, in two districts, documented in the README |

---

## 5. Requirement coverage

| Requirement | Source | Covered by |
|---|---|---|
| Five entities + User; cardinalities; time series; meter as attribute | B§3, R-D1 | Section 1 |
| Collections and members: provinces, districts, substations, installations | B§5 | UC-A2–A4 |
| Scoped collection where it only makes sense under a parent | B§5, G§4.6 | Readings under an installation |
| Installation composite | B§5, G§4.3 | UC-A5 |
| Last-known reading, derived | B§5, B§6 | UC-A6, S9 |
| Ingestion: correct method, status, headers, Location | B§5, G§7.3 | UC-D2 |
| CRUD with correct methods and idempotency | B§5, R-D3 | Installations (UC-O1, O4, O9), users (UC-M3–M5) |
| Pagination with count, next, previous | B§5, G§10.3 | UC-A7 and every collection |
| Filtering by jurisdiction and time window | B§5, G§10.2 | UC-A4, UC-A7 |
| Sorting by timestamp, both directions | B§5 | UC-A7 |
| Conditional GET → 304, empty body | B§5, G§10.4 | UC-A10 |
| One error schema | B§5, G§11 | Every error |
| Device authenticates as its installation; jurisdiction-scoped reads | B§5, B§2, R-D7 | UC-D1, S2, S5 |
| District generation summary (stretch) | B§5 | UC-A9, S9 |
| Seed at scale | B§4 | S6 |
| Public HTTPS deployment, live Swagger, shared repo | B§7 | Implementation guide §6 (phase 12) |

---

## 6. Additions beyond the brief

| Addition | Test | Why |
|---|---|---|
| INSTALLATION_OFFICER role | 2 | Someone must register installations (S1) |
| ADMIN role + user management | 4 | Staff join, move and leave (S7) |
| Bootstrap ADMIN | 2 | Someone must create the first account (S7) |
| Posting district + level on User | 1 | This *is* the brief's "role and a jurisdiction" (S2) |
| `capacity_kw` | 3 | Rejects impossible power values |
| `status` on installations | 3, 4 | Shut-down sites must stop writing and stop counting as live (S8) |
| Device credential | 2 | API-registered sites could otherwise never write (S8) |
| Reporting status (derived) | 3, 4 | Correct current totals; officers find silent devices (S9) |
| Summaries at province and national level | 4 | Matches the three jurisdiction levels (S9) |
| One reading per installation per time | 3 | A resent reading can never be stored twice |
| Reading validation | 3 | Impossible data is rejected |
| Token endpoint (OAuth 2.0, RFC 6749) | 2 | Tokens cannot be shown working without a way to get one |
| Password change and reset | 3 | Otherwise the ADMIN knows every password (03 A10) |
| Seed edge cases (+ optional simulator) | 2 | Edge behaviour and a current "now" view can be shown, not just claimed |

---

## 7. Known limitations (for the critical evaluation)

- L3 (token after delete) and L14 (no password change) were resolved in v2.4, L10 (region history) in v2.5, and L11–L12 (in-memory store) in v2.6; they are removed.

| # | Limitation |
|---|---|
| L1 | Someone posted in one province cannot be asked to cover another (needs an assignment entity) (S2) |
| L2 | One role per person; a person with two jobs needs two accounts (S3) |
| L4 | We know a site *is* decommissioned, not *when* (S8) |
| L5 | Energy before a site's first reading of the day is not counted (G3) |
| L6 | Meter swaps rely on a commissioning rule: the new meter must continue the old counter. A replacement meter that cannot be set this way would have every reading refused (`40005`) until its counter passes the old value (DM-A3, DM-D10) |
| L7 | Offset paging on a growing, newest-first list can repeat or skip items between page requests (G§10.3's own method) |
| L8 | Readings grow without limit (~23,000 a day at seed scale); no retention policy |
| L9 | A moved installation carries its history to the new district (G4) |
| L13 | Without the simulator, the newest reading is from when the seed was generated, so later on every site shows SILENT and current power is 0 |
| L15 | Users log in with the OAuth `password` grant, which current OAuth security advice discourages; a real system would use a proper login flow (03 A3) |

---

## 8. Open items

| # | Item |
|---|---|
| O2 | ~~How a meter swap should treat the energy counter~~ — resolved in v2.8: commissioning rule (DM-A3); limitation L6 |

---

## 9. Out of scope

| Not built | Why |
|---|---|
| Installer companies as API clients | Third kind of client; needs ownership-based control (S1) |
| Self sign-up, password reset by email | Anyone could claim an area; email needs a mail system (S7) |
| Writing provinces, districts, substations | Reference data (S4) |
| Changing or deleting readings | Append-only (Step 5) |
| Batch upload of readings | An optimisation, not a requirement |
| Owner personal data, home GPS | Data minimisation (DM-D14) |
| "Registered by" link, audit log | Permissions are area-based; audit is future work (DM-D18) |
| XML or other formats | JSON only (B§5) |
| Hypermedia links (Richardson Level 3) | Out of scope by the brief (B§ cover table) and G§1 |
| Full OAuth server, refresh tokens, token revocation | Not needed (R-D7) |
| Long-running requests (202 + task) | Nothing here is long-running (G§10.6) |
| PATCH | Full PUT is used for every update (G§4.5) |
| A separate "revoke credential" operation | Status, delete and re-issue cover it (S8) |
| Decommission date, reason code, status history | No consumer in the brief (DM-D17) |
| Per-client rate limiting, monitoring dashboards | Not marked; basic throttling is done at API Gateway (04) |
| More than one API version live at once | Only v1.0 exists |
