# AI Log — prompts, generator mistakes and fixes

> Brief §10 and rubric D4: disclosure must be **complete and specific**, and generator mistakes must be **found and repaired**. This log becomes the report's AI-disclosure appendix and your viva evidence.

## Rules

- **Log while you build**, not afterwards. One entry per prompt (or per batch of small prompts).
- **Prompt:** copy it exactly, or link to it (e.g. `prompts/L6-geography.md`).
- **Mistakes:** say what was wrong and **which rule it broke** (G§x, L-Sx, guide §x, brief B§x).
- **Fix:** what you changed, and the commit hash.
- Write "none found" only after checking against the phase's checklist (below and guide §6.5).
- Never paste secrets (passwords, device secrets, tokens, connection strings).

## AI aids used

| Tool | Version / model | Used for |
|---|---|---|
| Claude (Anthropic), claude.ai Project chat | Claude Opus 5.5 | design logs 01–04, implementation guide, design review, starter scaffold, Postman collection, `CLAUDE.md`, `docs/BUILD-PROMPTS.md` |
| *(your coding agent)* | | |

## Log

| # | Date | Phase | Tool | Prompt (short or link) | What it produced | Mistakes found (rule broken) | Fix | Commit |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-06 | Design | Claude | "Evaluate the design docs against the lecture guidelines and the WSO2 guidelines; update if there is an issue" | Review of 01–04 and the guide | Revocation by `iat` breaks within one second (RFC 7519 §4.1.6 — whole seconds); 403 at `/token` for a decommissioned device contradicts 03 E4; origin guard missing from 03 M2; `If-Modified-Since` precision; handover missing the installation id; deviation for area-denial codes (G§12.3) not logged | `ver` claim; 401 `40103`; docs 01 v5.7, 02 v2.8, 03 v6.4, 04 v2.1, guide updated | |
| 2 | 2026-10-06 | L0 | Claude | "Provide a starter zip (latest Node.js LTS, features used, .env git-ignored with example in README) and the Postman collection" | `package.json`, `src/app.js`, `src/server.js`, `src/config.js`, `nodemon.json`, `ecosystem.config.js`, `.gitignore`, `.env.example`, README, Postman collection + environments | *(review it yourself and record what you find)* | | |
| 3 | 2026-10-06 | Design | Claude | Student questioned a deviation Claude had added | — | **Claude's mistake:** it logged "MongoDB instead of the lectures' in-memory seed" as a deviation, from an S4 checklist item about unrequested database code. The module's lectures use MongoDB Atlas, so it was not a deviation | Deviation withdrawn; 03 v6.5, 04 v2.2 | |
| 4 | 2026-10-06 | Design | Claude | "Can't we make the seed data with a script and upload it to our DB?" + "give a guide with prompts for each stage" | Seed loading by script (`npm run seed:load`), `readings.json` git-ignored; `CLAUDE.md` agent rules; `docs/BUILD-PROMPTS.md` | *(your review)* | docs 02 v2.9, 04 v2.3, guide | |
| 5 | 2026-10-06 | L0 | Claude | `npm install` reported 22 vulnerabilities | Audit of the dependency tree | All 22 came from `newman` (a dev-only test runner) and one from `nodemon`; production dependencies had 0. `npm audit fix --force` would have downgraded newman to 4.6.1 | newman removed from devDependencies and run through `npx newman@6`; nodemon kept (lecture help point), its 3 dev-only findings have no fix yet | |

## Generator-mistake checklist (from the lecture notes — scan every phase)

- **Data model (S1):** a Device entity; format names in the model; `last_*` fields on the installation; CamelCase fields; users as data producers.
- **Seed (S2):** foreign keys pointing at ids that don't exist; identical or unordered timestamps.
- **Routes (S3–S4):** verbs or camelCase in paths (`/getInstallations`); singular collections; a global `/readings`; `/readings?installation-id=`; literal `id` instead of a template; trailing slashes accepted.
- **Representations (S5–S6):** camelCase fields; a `{ data, status }` wrapper; missing FK fields; `res.send()` instead of `res.json()`; flat `last_power` fields; full history inside the overview; "latest" found without sorting by time.
- **Methods and status (S7–S8):** 200 instead of 201; Location missing or not resolving; ETag / Last-Modified missing; 401 and 403 swapped; `WWW-Authenticate` missing; installation id taken from the body; auth middleware registered after the routes; PUT that merges; second DELETE returning 200; PUT/DELETE generated for readings; delete cascading to readings; empty collection returning 404; `res.json(undefined)` after a failed find.
- **This design (guide §6.5):** `_id` or secrets in a response; no `If-Match` on PUT/DELETE; unknown query parameters ignored instead of 400; timestamps without offset accepted; device reading anything.
