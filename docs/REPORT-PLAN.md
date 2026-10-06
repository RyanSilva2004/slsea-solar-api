# Report Plan

> Notes for planning only. **Write the report yourself, in your own words** — Turnitin similarity and AI scores must both stay below 15%, and the viva checks that the report matches what you can explain.

## Rules from the brief (B§8, B§12)

- **2,250–2,750 words** (target 2,500). Outside the count: declaration, AI appendix, diagrams, tables, code, references.
- A **justification document, not a manual**: explain and defend decisions against the WSO2 guidelines.
- Required sections must be identifiable (headings below).
- Submit with the **signed coursework declaration** and the **AI-disclosure appendix** (`docs/AI-LOG.md`).

## Sections and word budget

| Section | Words | Draw from | Must show |
|---|---|---|---|
| Architecture and data model | 450 | 01 (D1, D2, D5–D7, D12), 04 §2–§3 | the two marked decisions (meter id as an attribute; readings as a time series); write/read split; diagram |
| API design justification | 650 | 03 §3–§8, deviation register §11 | resource types and why; URI rules; methods and idempotency; 201 + Location; headers; status codes; contested choices defended |
| Security justification | 450 | 03 §9, 02 S1–S3, S5 | device authenticates as its installation; JWT + scopes; jurisdiction area (no leakage); scopes vs attribute-based control (the installer example) |
| Deployment | 250 | 04 §1–§5 | API Gateway → EC2 (pm2) → Atlas; HTTPS; origin secret; how it is shown to work (live Swagger, Newman run, commits) |
| Richardson maturity evaluation | 250 | 03 §11 note, 04 | Level 2 with evidence (resources, methods, status codes); why not Level 3 (links in pagination and Location, but no hypermedia controls); the guideline's own G§1/G§2 inconsistency |
| Critical evaluation | 450 | 02 §7, 04 §5 | real strengths; limitations (e.g. L5, L7, L13, AL1–AL5); what you would change with more time |

## Before submitting

- [ ] Word count inside 2,250–2,750
- [ ] Every section heading present
- [ ] Diagrams: ER model, architecture, device flow
- [ ] Richardson level stated **and** defended
- [ ] Declaration signed
- [ ] AI appendix complete (prompts, tools, mistakes and fixes)
- [ ] Turnitin similarity and AI scores below 15%
- [ ] Every claim in the report matches the deployed API
