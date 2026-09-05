# Quickstart: Candidate Interview Links (validation guide)

Manual end-to-end validation. Prerequisites: backend + frontend running (`specs/002-docker-dev-baseline` or local `uv run uvicorn` / `npm run dev`), one recruiter account, one expert account, one hiring manager account.

## A. Vacancy time limit (Story 4)

1. Log in as recruiter → open an owned vacancy draft.
2. Set "Interview time limit" to **30** minutes → Save. Reopen: value persists.
3. Clear the field → Save → open the vacancy's Candidate links section: create is refused with "set the time limit first" guidance (backend 409).

## B. Create + copy link (Story 1)

1. Submit the vacancy for review, approve it (or use an existing approved vacancy) with time limit 30.
2. In "Candidate links" section press 📎 Create link. Dialog blocks confirm until first name, last name, social are filled and expiration is in the future.
3. Confirm → new row appears with status `active`; press Copy → clipboard contains invitation text with position, candidate name, `Доступно до` in Moscow time, and the `/interview/{token}` URL (paste anywhere to verify).
4. Try creating on a draft/archived vacancy or as non-owner → clear refusal.

## C. Candidate flow (Story 2) — do this in an incognito window

1. Open `/interview/{token}` → interview card shows position, name, Moscow-time availability deadline, 30 min duration, one primary **Start interview** button. No login anywhere.
2. Press Start → started screen shows the running countdown (~30:00 ticking down); in the recruiter window the link flips to `in progress` within a refresh (SC-005).
3. Refresh the candidate page mid-interview → countdown resumes from the correct remaining time; no second start (SC-002/edge case).
4. Wait for the countdown to reach 0 (or set limit to 5 min for a faster check) → "time is up" screen; recruiter side shows `completed`.
5. Reopen the link → completed screen, no start button (FR-018).

## D. Unavailable reasons (FR-012 / SC-004)

For a fresh link, verify each case shows the named reason and no start button:
1. **Expired** — set expiration to the past (or wait) → "expired".
2. **Revoked** — recruiter presses Revoke while candidate page is open → candidate refresh shows "closed by recruiter".
3. **Vacancy closed** — archive the vacancy (or edit it so it returns to draft) → "vacancy closed"; re-approve → link works again.
4. **Gibberish token** → generic unavailable / not-found screen (no token probing info).

## E. Manage links (Story 3)

1. Create two links for the same candidate → independent rows (FR-006); revoke one → only that one dies.
2. Extend the other past its original deadline → stays `active` and startable until the new date.
3. Revoke/complete a link → its Extend action is refused/disabled (FR-010).
4. Expert account: opens the same vacancy → sees the links list read-only, no action buttons (FR-001a).
5. Hiring manager account: opens the vacancy → no Candidate links section at all (FR-001a).

## F. Backend regression (automated)

```bash
cd backend && uv run pytest tests/api tests/services -q
```
Covers: status derivation/lazy finalization, permission refusals, expiration/extend/revoke rules, public start idempotency. No frontend tests are added for this feature (manual scenarios A–E are the FE verification).

## Expected outcomes mapping

| Scenario | Success criteria |
|----------|-----------------|
| B | SC-001 (create+copy < 1 min), SC-003 (unique unguessable links) |
| C | SC-002 (≤2 clicks, no login), SC-006 (blocked within seconds of limit) |
| D | SC-004 (correct reason in all four cases) |
| E | SC-005 (revoke/extend effective within one refresh) |
