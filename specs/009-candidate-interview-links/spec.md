# Feature Specification: Candidate Interview Links

**Feature Branch**: `009-candidate-interview-links`

**Created**: 2026-09-05

**Status**: Implemented (2026-09-05) — backend API + frontend UI delivered per plan.md/tasks.md; backend pytest green (86 tests), frontend lint/build clean. Validation: quickstart.md scenarios A–E verified at API level end-to-end; the manual UI pass (dialog UX, clipboard, countdown rendering, dark mode) remains open for human check.

**Input**: `spec-candidate-interview-links.md` (product idea), depends on [[003-recruiter-vacancy-management]] (approved vacancy lifecycle) and unblocks [[004-candidate-interview-flow]] (needs a real link/token to open)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recruiter creates a unique interview link for a candidate (Priority: P1)

A recruiter opens a vacancy they own that is approved and open. In the
"Candidate links" section under the interview pack they press the paperclip (📎)
"Create link" button. A dialog asks for the candidate's first name, last name,
link or nickname to a social network, an optional email, and the date and time
when the link stops working. After confirming, the recruiter sees a unique link
address and a copy button. Pressing copy puts a ready-made invitation message
onto the clipboard — position title, candidate name, availability deadline in
Moscow time, and the link — so the recruiter can paste it into any messenger or
email and send it themselves.

**Why this priority**: this is the core of the feature — without link creation
nothing else exists. It delivers end-to-end value on its own: recruiter can
already create, copy, and share a link.

**Independent Test**: open an approved owned vacancy, press 📎, fill the dialog,
create the link, press copy, verify the clipboard contains the full invitation
text with correct position, candidate name, Moscow-time deadline, and the link.

**Acceptance Scenarios**:

1. **Given** an approved open vacancy owned by the recruiter with an interview time limit set, **When** the recruiter fills the dialog and confirms, **Then** a new unique link appears in the "Candidate links" list with status "active" and the recruiter sees it with a working copy button.
2. **Given** the link was just created, **When** the recruiter presses copy, **Then** the clipboard contains the invitation message: position title, candidate name, "Доступно до" deadline in Moscow time, and the link.
3. **Given** a vacancy that is not approved (draft, in review, changes requested) or is archived, **When** the recruiter tries to create a link, **Then** creation is refused with a clear explanation.
4. **Given** an approved vacancy whose interview time limit is not set, **When** the recruiter tries to create a link, **Then** creation is refused and the recruiter is told to set the time limit first.
5. **Given** the create dialog, **When** the recruiter leaves first name, last name, or social link empty, or picks an expiration in the past, **Then** the dialog prevents creation and points at the invalid fields.
6. **Given** any link creation attempt, **When** the acting user is not the recruiter who owns the vacancy, **Then** it is refused.

---

### User Story 2 - Candidate opens the link and starts the interview (Priority: P1)

A candidate receives the invitation and opens the link without any registration
or login. While the link is accessible they see an interview card: position
title, their name, the availability deadline, and the interview duration. A
"Start interview" button begins the interview: a countdown starts from the
time limit defined on the vacancy, and the link status becomes "in progress".
When the countdown runs out, the interview is blocked — the candidate can no
longer continue. If the link is not accessible at all, the candidate sees a
"link unavailable" screen naming the reason (expired, revoked, or the vacancy
is closed).

**Why this priority**: the link's only purpose is to let the candidate start
and pass the interview within controlled boundaries. The start + countdown +
block mechanics are the enforcement half of the feature.

**Independent Test**: open a fresh link in a browser without being logged in —
the interview card with "Start interview" appears; after starting, the deadline
is shown and the status becomes "in progress"; open the same link after its
expiration (or with a 1-minute time limit after it runs out) — the unavailable
screen with the correct reason appears.

**Acceptance Scenarios**:

1. **Given** an active link, **When** the candidate opens it, **Then** the interview card shows position, candidate name, availability deadline, and interview duration, with a visible "Start interview" button.
2. **Given** the interview card, **When** the candidate presses "Start interview", **Then** the interview begins, the countdown from the vacancy's time limit starts, the link shows "in progress" to the recruiter, and the candidate sees a simple started screen with the running countdown (the actual interview interface is delivered by the candidate interview flow slice).
3. **Given** an in-progress interview, **When** the vacancy's time limit runs out, **Then** the candidate is stopped from continuing, sees that time is up, and the link shows "completed" to the recruiter as a finished interview.
4. **Given** a link past its expiration, **When** the candidate opens it, **Then** they see "link unavailable — expired" and no start button.
5. **Given** a link revoked by the recruiter, **When** the candidate opens it (or is currently on it), **Then** they see "link unavailable — closed by recruiter".
6. **Given** a vacancy archived while its links exist, **When** a candidate opens any of its links, **Then** they see "link unavailable — vacancy closed".
7. **Given** a completed interview, **When** the candidate reopens the link, **Then** they see that the interview is completed instead of a start button.

---

### User Story 3 - Recruiter manages existing links (Priority: P2)

The "Candidate links" section on the vacancy page lists every link with the
candidate's info, creation date, expiration, status, and actions. The recruiter
can copy the invitation again for any link, revoke a link early (candidate
immediately loses access), or extend the expiration of an active link.

**Why this priority**: operational control over already-issued links — needed
in real workflows (candidate drops out, deadline negotiated) but the feature
works without it.

**Independent Test**: create two links, revoke one — its candidate sees the
unavailable screen while the other link still works; extend the expiration of
the second — it stays active past the original deadline.

**Acceptance Scenarios**:

1. **Given** the links list, **When** the recruiter views it, **Then** every row shows candidate name, social link, email if given, creation date, expiration, status badge, and actions.
2. **Given** an active link, **When** the recruiter revokes it, **Then** its status becomes "revoked" and the candidate immediately sees "closed by recruiter".
3. **Given** an active link, **When** the recruiter extends its expiration to a future date, **Then** the link stays usable until the new date.
4. **Given** a revoked or completed link, **When** the recruiter tries to extend it, **Then** the action is refused.
5. **Given** any link row, **When** the recruiter presses copy, **Then** the same invitation message as at creation lands on the clipboard.

---

### User Story 4 - Recruiter sets the interview time limit on a vacancy (Priority: P2)

While authoring or editing a vacancy, the recruiter defines how many minutes a
candidate gets to pass the interview and answer all questions once started (for
example, 45). The value has a sensible default and can be changed at any time
while the vacancy is editable. Every link of the vacancy inherits this limit.

**Why this priority**: a hard prerequisite for link creation (Story 1 refuses
without it), but a tiny flow on its own.

**Independent Test**: open a vacancy draft, set the time limit to 30 minutes,
save — the value persists and a started interview from this vacancy's link
blocks after 30 minutes.

**Acceptance Scenarios**:

1. **Given** an editable vacancy, **When** the recruiter sets the interview time limit and saves, **Then** the value is stored with the vacancy and shown on the vacancy form.
2. **Given** a vacancy without a time limit cleared/never set, **When** the recruiter tries to create a link, **Then** creation is refused with guidance to set the limit.
3. **Given** a vacancy with a time limit, **When** an interview starts from any of its links, **Then** the countdown uses exactly this limit.

---

### Edge Cases

- Vacancy edited after approval returns to draft (existing lifecycle rule) — all its links become blocked until the vacancy is approved again; they resume without recruiter action after re-approval.
- Candidate refreshes the page mid-interview — the interview continues as "in progress" with the remaining time, no second start.
- Two links for the same candidate on the same vacancy are independent — revoking one does not affect the other.
- Recruiter extends expiration of a link while the candidate is mid-interview — the running countdown (time limit) is unaffected; only future availability changes.
- Expiration and time limit are different clocks: expiration gates starting, the time limit gates finishing.
- Archived vacancy restored — its previously active links become usable again (if not expired/revoked).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow only the owning recruiter of a vacancy to create, list, revoke, and extend its candidate links.
- **FR-001a**: On the shared vacancy workspace, the expert MUST see the "Candidate links" section as strictly read-only (candidate info and statuses visible, no actions); the hiring manager MUST NOT see the section at all.
- **FR-002**: The system MUST allow creating links only while the vacancy status is approved; creation MUST be refused for any other status with a clear message.
- **FR-003**: The recruiter MUST provide candidate first name, last name, and a social media link or nickname for every link; email MUST be optional.
- **FR-004**: The recruiter MUST define an expiration date and time for every link; past dates MUST be rejected.
- **FR-005**: The system MUST generate a unique, unguessable link address for every creation; guessing another candidate's link MUST be practically impossible.
- **FR-006**: The system MUST allow multiple independent links for the same candidate on the same vacancy.
- **FR-007**: The copy action MUST produce a ready-to-send invitation message containing the position title, candidate name, expiration in Moscow time, and the link.
- **FR-008**: The links list MUST show every link with candidate info, creation date, expiration, and a status: active, in progress, completed, expired, revoked, or blocked.
- **FR-009**: The recruiter MUST be able to revoke an active or in-progress link; a revoked link MUST immediately stop working for the candidate.
- **FR-010**: The recruiter MUST be able to extend the expiration of an active link to a future date; revoked or completed links MUST NOT be extendable.
- **FR-011**: A candidate MUST be able to open a link and see its interview card without logging in or having an account.
- **FR-012**: The interview card MUST be shown only while the link is accessible; the system MUST block access when the link is expired, revoked, or the vacancy is not open, and MUST tell the candidate which reason applies.
- **FR-013**: The "Start interview" action MUST begin the interview and start a countdown equal to the vacancy's interview time limit; while the interview is in progress the link MUST show "in progress". Until the real interview interface exists, the candidate MUST see a simple started screen with the running countdown instead of interview questions.
- **FR-014**: When the countdown reaches zero, the system MUST stop the candidate from continuing; the interview MUST be treated as finished — its status becomes "completed" and the answers given count as the interview result.
- **FR-015**: The vacancy MUST have an editable interview time limit (in minutes) with a sensible default; links can be created only when it is set.
- **FR-016**: Expiration and interview time limit MUST be independent: expiration controls until when the interview can be started, the time limit controls how long the candidate has to finish once started.
- **FR-017**: The system MUST NOT send any messages to the candidate (no email, no notifications); sharing the link happens outside the system by the recruiter.
- **FR-018**: Reopening a completed interview's link MUST show a completed state instead of allowing a new start.

### Key Entities

- **Candidate Link**: represents one issued interview link for one candidate under one vacancy. Key attributes: candidate first name, last name, social media link/nickname, optional email, expiration date/time, status (active / in progress / completed / expired / revoked / blocked), start timestamp, completion timestamp, creation timestamp, and which recruiter created it. Status "expired" and "blocked" are derived from time and vacancy state, not manually set. Status "completed" covers both interviews finished by the candidate and interviews ended by the time limit running out.
- **Vacancy**: gains one new attribute — interview time limit in minutes, editable by the recruiter, inherited by all of the vacancy's links.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A recruiter can create a link and copy the invitation in under 1 minute.
- **SC-002**: A candidate can go from opening the link to a started interview in at most 2 clicks, with no login.
- **SC-003**: 100% of issued links are unique; no two candidates on the same vacancy can access each other's interview by altering the link.
- **SC-004**: Every blocked link shows the candidate the correct reason (expired / revoked / vacancy closed / time up) — verified for each of the four cases.
- **SC-005**: Recruiter actions (revoke, extend) take effect for the candidate immediately — no more than a page refresh apart.
- **SC-006**: The running interview is blocked within seconds after the vacancy's time limit expires.

## Clarifications

### Session 2026-09-05

- Q: When a candidate runs out of time mid-interview, what status should the link show to the recruiter — "blocked" (time up, interview not finished) or "completed" (interview closed, whatever was answered counts)? → A: Completed — the interview is treated as finished and answers count as the result (Option B).
- Q: The vacancy page is shared between recruiter and expert — should non-owner roles see the "Candidate links" section, and can they interact with it? → A: Expert sees it read-only (no actions); hiring manager does not see it (Option A).
- Q: What exactly should the candidate see right after pressing "Start interview" in this slice, given the real interview flow is a separate slice? → A: A simple started screen with the running countdown (placeholder); the real interview interface comes with the candidate interview flow slice (Option A).

## Assumptions

- Deadlines and durations are displayed to users in Moscow time; internally stored precisely with timezone.
- The interview time limit default is 45 minutes and can be changed per vacancy.
- The system does not integrate with email or messengers; the invitation is shared by the recruiter manually.
- How the interview is conducted, recorded, transcribed, or evaluated is out of scope (covered by [[004-candidate-interview-flow]]).
- Binding a link to a single device/session (only the person who started can continue) is explicitly deferred to later permission logic.
- Vacancy archiving and the approval lifecycle behave as defined in [[003-recruiter-vacancy-management]].
- The existing vacancy editing workspace and design system are reused; the links section follows the same page layout.
