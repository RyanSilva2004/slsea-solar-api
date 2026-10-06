# Rules for the coding agent

This repository is the SLSEA Solar Generation Data API (NB6007CEM coursework). The student must be able to explain every line at a viva, so **clarity beats cleverness**.

Claude Code reads this file automatically. With any other agent, paste it as the first message of the session.

## Where the truth is

1. `docs/IMPLEMENTATION-GUIDE.md` — what to build: collections (§3.2), seed (§3.3), routes (§4.1), query parameters (§4.3), auth (§4.4), bodies, errors and headers (§5), build phases (§6).
2. `docs/03-resource-model-and-uris.md` — why it is built that way (decision IDs such as M2, A7, S7).
3. `docs/01`, `docs/02`, `docs/04` — data model, scope, architecture.
- If the docs are unclear or contradict each other: **stop and ask**. Never guess, and never "improve" the design on your own.

## Scope

- Work on **one phase only** — the one named in the prompt. Do not build ahead.
- Add no route, field, query parameter, status code or error code that is not in the guide.
- Add **no new npm dependency** without asking first. Available: express 5, mongoose 9, jsonwebtoken, bcryptjs, swagger-ui-express; Node 24 built-ins (`node:crypto` for UUIDs, hashes and random bytes).
- Do not touch `docs/` except to update the **Status** columns in guide §4.2 and §6.1 when asked.
- Do not commit. The student reviews and commits.

## Code layout (04 §3.2)

- `src/routes/` — wiring only: path, method, middleware chain, controller function. No logic.
- `src/controllers/` — read the request, call `lib/` or models, send the response.
- `src/lib/` — shared logic: errors, area, derived values, ETag, conditional requests, pagination, query parameters, validation, representations, tokens.
- `src/middleware/` — origin guard, content negotiation, auth, scope, JSON body, If-Match, errors.
- `src/models/` — one Mongoose model per entity, fields and indexes exactly as guide §3.2.
- CommonJS (`require`), `'use strict'`, async/await. Express 5 passes rejected promises to the error handler — no try/catch just to call `next(err)`.
- Short functions. Comment **why**, citing the design ID: `// 03 M6: identical resend returns the existing reading`.

## Routing rules

- Every router: `express.Router({ strict: true, caseSensitive: true })`.
- Every path is declared once with `router.route(path)`, methods chained, and `.all(methodNotAllowed('GET, POST'))` last (405 + `Allow`).
- Paths: lower case, hyphens, plural nouns, no trailing slash, no verbs. Express params in camelCase (`:installationId`), URI templates in docs as `{installation-id}`.
- Middleware order per route (03 M2): `auth` → `scope(...)` → `jsonBody` (POST/PUT only) → controller. **Never** use an app-level `express.json()`: the body must not be parsed before the token and scope are checked. `express.urlencoded()` only on `POST /token`.

## Responses

- Always `res.json()` (Content-Type `application/json; charset=utf-8`). Never `res.send()` for data.
- Build every representation explicitly from a field list (`lib/representations`). Never return `_id`, `__v`, `password_hash`, `device_secret_hash`, `received_at`, `created_at`, `updated_at`.
- snake_case fields; timestamps as ISO 8601 UTC strings with `Z`.
- Every URL in a header or body is absolute, built from `config.publicBaseUrl` + `config.basePath`.
- Errors: throw `new ApiError(status, code, message, details?)`; one error handler renders the guide §5.2 body. 500 → code 50001, no stack trace in the body.

## Security

- Never log passwords, secrets, tokens or connection strings.
- A device's installation always comes from the token (`sub`), never from the body or the path alone.
- Outside the caller's area: a single asset → 404 `40401`; an area (filter, summary, region readings, `substation_id` in a body) → 403 `40302` (guide §4.4).

## OpenAPI

- Every route added in a phase is added to the OpenAPI document in the same phase: parameters, request body, every response code, the scope it needs, and `If-Match` as a **required** header on PUT and DELETE.

## When you finish a phase, reply with

1. Files created or changed.
2. How to test it: commands and the Postman folder.
3. Anything you were unsure about, and any place you departed from the docs (there should be none).
