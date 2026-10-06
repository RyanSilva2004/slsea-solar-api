# SLSEA Solar Generation API

JSON REST API for the Sri Lanka Sustainable Energy Authority (SLSEA) solar generation data.
Base path: `/solar/v1.0`. The full specification is in `docs/IMPLEMENTATION-GUIDE.md`.

## Requirements

- Node.js 24
- A seeded MongoDB Atlas database

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env` and set `MONGODB_URI`, `PUBLIC_BASE_URL`, `JWT_SECRET` (at least 32 characters)
and `BOOTSTRAP_ADMIN_PASSWORD`. Never commit `.env`.

## Run

```bash
npm run dev     # restarts on file changes
npm start       # plain start
```

Health check:

```bash
curl http://localhost:3000/
# {"status":"ok","service":"slsea-solar-api"}
```
