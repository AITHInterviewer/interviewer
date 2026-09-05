<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and what to look up in the library's documentation, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and what to look up in the library's documentation (not single words), scoped to a single concept. If the question spans multiple distinct concepts (e.g. routing and auth and caching), make a separate `query-docs` call per concept with the same library ID, unless the question is about how the concepts interact — combined queries dilute ranking and return shallow results for each topic
4. Answer using the fetched docs
<!-- context7 -->

## Deploying this project

Single source of truth: `.github/workflows/deploy-full.yml` — everything else in
`.github/workflows/` is CI (tests/lint) or one-off maintenance jobs (`reset-data.yml`), not
deploy.

- Push to `main` — the CI workflows run automatically, deploy does not.
- To actually deploy (self-hosted Windows runner): `gh workflow run deploy-full.yml`, then
  watch it with `gh run watch <run-id> --exit-status` (get the id from
  `gh run list --workflow=deploy-full.yml --limit 1`).
- `deploy-full.yml` brings up the whole stack in one job: postgres/redis/minio/livekit-server
  (`infra/docker-compose.yml` + `docker-compose.dev.yml`), backend, frontend, nginx
  (single external entry point — see `infra/nginx/nginx.conf`), live-agent + its stt/tts, and
  evaluation-agent's stt-accurate.
- It writes `backend/.env`, `frontend/.env`, `live-agent/.env`, and `infra/livekit.yaml`
  fresh on every run (values baked in near the top of the workflow) — don't hand-edit those
  `.env` files on the runner, edit the workflow instead.
- External access is via `https://ainterviewer.duckdns.org:12345` (DuckDNS domain pointed at
  the runner's tunnel IP, currently `89.149.199.118` — update the DuckDNS A record if that
  tunnel IP changes again), proxied by nginx to `/` (frontend), `/api/` (backend),
  `/docs`/`/redoc`/`/openapi.json` (FastAPI docs), `/rtc/` (livekit signaling). The frontend
  calls its backend via the page's own origin (`frontend/lib/api.ts`,
  `window.location.origin` fallback) precisely so it works through both the VPN address and
  the tunnel without editing `NEXT_PUBLIC_BACKEND_URL`.
- TLS is real (Let's Encrypt via DuckDNS DNS-01 — see the `acme` service in
  `infra/docker-compose.yml`), not self-signed: needed both for camera/mic `getUserMedia`
  and because it's the same cert livekit-server's built-in TURN/TLS uses (`infra/livekit.yaml`,
  `turn:` block) for candidates without Radmin VPN — browsers validate TURN/TLS certs like any
  other TLS connection, so self-signed doesn't work there. No inbound port 80/443 needed
  (this tunnel can't open ports <1000) since DNS-01 doesn't require one; `acme.sh` handles
  the DuckDNS TXT record itself via `DUCKDNS_TOKEN` (GitHub Actions secret).
- `reset-data.yml` wipes postgres/minio volumes (+ frontend cache) and stops the stack —
  run it manually only when you actually want a clean slate; the next `deploy-full.yml` run
  brings everything back up empty.
