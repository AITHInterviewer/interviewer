---
name: live-view
description: Looks at the running local UI with Playwright Chrome (not Cursor MCP browser). Use when the user asks to look live, open the app, click through screens, take screenshots, verify layout, or mentions Playwright / просмотр / вживую / localhost UI.
---

# Live view — Playwright, not MCP browser

This project’s Next.js app hangs Cursor’s IDE browser MCP and hangs `npx -p playwright-core`. View the **running** app with the isolated runner.

## Forbidden

- `cursor-ide-browser` MCP on localhost (`browser_navigate`, `browser_lock`, screenshots via MCP)
- `npx -p playwright-core` / `npx playwright-core` from `/tmp`
- `waitUntil: "networkidle"` (Next HMR never goes idle)
- Headless Chrome `--screenshot` waiting for network idle
- Adding Playwright to `frontend/package.json`

## Required recipe

```bash
cd /Users/krivoy/Vibe/hakaton/tools/live-view
test -d node_modules/playwright-core || npm install --no-audit --no-fund --loglevel=error
node smoke.mjs
# or: node run.mjs /login /vacancies/python-middle
```

- Package: `playwright-core` **only** in `tools/live-view`
- Browser: system Chrome `channel: "chrome"`
- Navigation: `waitUntil: "domcontentloaded"`, nav timeout 8s, step timeout 12s, process hard-kill 50s
- Login popup: click `.login-card` (filter by person name), wait `.modal-overlay` — not a generic `getByRole('button')` before hydration
- Screenshots: `tools/live-view/out/*.png`
- Live window (optional): `PW_HEADED=1 node smoke.mjs`
- Host: always `http://localhost:PORT`, never `http://127.0.0.1` — Turbopack HMR/hydration breaks on 127.0.0.1
- Port: probe 3001, then 3000. Do not assume 3000.

## How to launch a subagent

Cursor Task types may not include `live-view`. Use `shell` or `generalPurpose` and paste this recipe. If `~/.cursor/agents/live-view.md` is available as a type, use that.

The subagent may use Shell, Read, Write. It must not call browser MCP tools even if they are listed.

## Report

Return what the **page text and screenshots** show, not what the code should show. Name failed steps and screenshot paths.
