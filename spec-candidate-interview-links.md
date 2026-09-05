# Candidate Interview Links — Idea

## Goal

Let a recruiter generate a unique personal interview link for each candidate
from an approved vacancy, share it over any channel (email, messenger — outside
the system), and control exactly how long the link stays usable and how much
time the candidate gets to actually pass the interview.

The candidate opens the link without any registration or login.

## Who Does What

**Recruiter:**
- creates a unique link per candidate from a vacancy they own
- defines the candidate's contact info and the link's lifetime
- copies a ready-made invitation message and sends it to the candidate
- sees all created links with their statuses on the vacancy page
- can revoke a link early or extend its expiration
- defines (on the vacancy) how much time the candidate has to pass the
  interview once started

**Candidate:**
- opens the link without an account
- sees what the interview is, who it is for, and until when it is available
- starts the interview with a single button while the link is accessible
- gets blocked when the link expires, the time to pass runs out, or the
  vacancy is closed

## Creating a Link

On the vacancy page there is a "Candidate links" section placed under the
interview pack (questions). It has a button with a paperclip (📎) icon —
"Create link".

Pressing it opens a dialog where the recruiter defines:
- candidate's first name (required)
- candidate's last name (required)
- link or nickname to the candidate's social media (required)
- candidate's email (optional — stored as contact info only; the system does
  not send anything in this slice)
- link expiration date and time (required, must be in the future)

The recruiter can create several links for the same candidate on the same
vacancy (for example, to resend or to restart the process).

The link can only be created while the vacancy is approved and open. If the
vacancy was archived, creating new links is impossible.

A vacancy must have a defined interview time limit before links can be
created (see "Interview time limit" below).

## After Creation

The recruiter immediately sees the unique link address. Next to it — a copy
button. Pressing it copies a ready-made invitation message to the clipboard,
in a human-friendly form, for example:

```
Собеседование на позицию: <название вакансии>
Кандидат: <имя и фамилия>
Доступно до: <дата и время по московскому времени>

Ссылка: <уникальная ссылка>
```

The recruiter sends this message to the candidate through any convenient
channel — the system does not deliver anything itself.

## Links List and Statuses

All created links live in the "Candidate links" section on the vacancy page
as a list. Each row shows:
- candidate (name, social link, email if given)
- when the link was created
- until when it is valid
- status
- actions: copy invitation, revoke, extend expiration

Statuses a recruiter can see:
- **active** — the link works, the candidate can start
- **in progress** — the candidate has started, the timer is running
- **completed** — the candidate finished
- **expired** — the expiration date has passed
- **revoked** — the recruiter closed the link early
- **blocked** — the vacancy is no longer open (archived)

## When the Link Works and When It Is Blocked

The link is usable only while all of the following hold:
- the recruiter has not revoked it
- the expiration date has not passed
- the vacancy is still open (not archived)

Otherwise the candidate sees a "link unavailable" screen with a clear reason:
expired, closed by recruiter, or the vacancy is closed.

## Interview Time Limit

On the vacancy itself the recruiter defines how much time the candidate has
to pass the interview and answer all questions (for example, 45 minutes).

This limit applies to every link of the vacancy:
- before the start it does not count — only the link expiration matters
- once the candidate presses "Start interview", the countdown begins
- when the time runs out, the interview is blocked — the candidate can no
  longer continue or answer questions

## Candidate Experience

Opening the link (no login):
- if the link is accessible — the candidate sees the interview card:
  position, their name, availability deadline, and the interview duration,
  plus the "Start interview" button
- pressing "Start interview" begins the interview and starts the countdown
- if the link is not accessible — a screen explaining why and what to do
  (contact the recruiter)

How the interview itself is conducted, recorded, and evaluated is a separate
slice and is not part of this idea.

## Lifecycle Example

1. Recruiter authors a vacancy, expert approves it
2. Recruiter sets the interview time limit on the vacancy
3. Recruiter presses 📎, fills in the candidate's info and expiration,
   gets a unique link
4. Recruiter copies the invitation and sends it to the candidate
5. Candidate opens the link, sees the card, presses "Start interview"
6. Candidate answers questions within the time limit
7. Link row on the vacancy page shows "completed"; recruiter opens the
   report (separate slice)

## Explicitly Out of Scope

- how the interview is conducted, recorded, transcribed, or evaluated
- binding a link to one device/session (only the person who started can
  continue) — later permission logic
- emailing or messaging candidates from the system
- what happens on the candidate's side after the interview is finished
