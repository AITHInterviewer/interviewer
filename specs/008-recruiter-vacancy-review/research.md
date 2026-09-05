# Research: Recruiter Vacancy Review Workflow

## Decision 1: Use one explicit vacancy lifecycle with archive restore returning the last active state

- **Decision**: Keep the vacancy state machine explicit and closed: `draft -> submitted_for_review -> changes_requested -> draft`, `submitted_for_review -> approved`, and any non-archived state may move to `archived`; restoring an archived vacancy returns it to the last non-archived state it held before archival.
- **Rationale**: This matches the business workflow, keeps approval meaningful, and avoids ambiguous restore behavior for the shared vacancy workspace.
- **Alternatives considered**:
  - Always restore to `draft`. Rejected: loses useful state and weakens archive as a temporary operational pause.
  - Allow experts to edit approved vacancies. Rejected: breaks the approval boundary.

## Decision 2: Extend the existing capability system with vacancy-specific actions instead of special-casing roles

- **Decision**: Add vacancy-specific capabilities to the existing role registry. Recruiter capabilities cover own-vacancy creation, body editing, question editing, submission, archive, and restore. Expert capabilities cover review queue access, question-pack editing during review, approval, and change requests. Backend APIs stay role-separated, but both APIs may return the same detail view model with per-viewer action hints.
- **Rationale**: The repo already has a working capability system. Extending it is the smallest correct change and keeps permissions adjustable without hardcoding role checks into the new vacancy logic.
- **Alternatives considered**:
  - Hardcode recruiter and expert checks inside each vacancy route. Rejected: duplicates policy and fights the existing architecture.
  - Put all vacancy actions behind a single generic edit capability. Rejected: too coarse for the authoring vs review boundary.

## Decision 3: Power the shared vacancy page with backend-provided viewer permissions

- **Decision**: The vacancy detail response includes a small `viewer_permissions` set derived from actor role, ownership, and vacancy status. The shared frontend route uses those permissions to decide which fields are editable, which sections are read-only, and which actions are visible.
- **Rationale**: The same vacancy route for recruiter and expert only stays reliable if the backend tells the client what is allowed. This reduces frontend policy duplication and makes the flow deterministic.
- **Alternatives considered**:
  - Infer allowed actions entirely from role and status in the frontend. Rejected: brittle and can drift from backend policy.
  - Split recruiter and expert into separate detail pages. Rejected: contradicts the shared-page product direction.

## Decision 4: Enforce approved-to-draft reset through service-side significant-change detection

- **Decision**: When a recruiter mutates an approved vacancy, the backend compares the persisted approved content against the incoming recruiter change. Any change to the significant fields listed in the spec resets the vacancy to `draft` and clears approval state while preserving review history.
- **Rationale**: This keeps the approval boundary trustworthy and ensures every client path obeys the same rule.
- **Alternatives considered**:
  - Reset only on vacancy body changes. Rejected: the spec explicitly includes question content and metadata.
  - Let the frontend decide when to reset. Rejected: not authoritative enough.

## Decision 5: Use lightweight optimistic concurrency for the shared workspace

- **Decision**: Mutation requests carry `expected_updated_at`; if the stored vacancy has changed since the client loaded it, the backend returns `409 Conflict` with the latest server timestamp and message prompting reload.
- **Rationale**: Recruiter and expert may open the same vacancy route concurrently. This is a minimal protection against silent overwrite without building real-time collaboration.
- **Alternatives considered**:
  - Last-write-wins. Rejected: too risky for questions, review decisions, and approval resets.
  - Full live collaboration. Rejected: far beyond slice scope.

## Decision 6: Keep question metadata nullable with stable defaults on creation

- **Decision**: Persist question text and order as required fields. Treat `skill_tags`, `intent`, `reference_answer`, `format`, `role`, `difficulty`, `estimated_duration_sec`, `stimulus`, and `source` as optional for storage, but apply default values for `format`, `role`, `difficulty`, and `source` when a new question is created without them.
- **Rationale**: This preserves permissive manual authoring while keeping downstream data shape predictable for later AI and candidate-flow work.
- **Alternatives considered**:
  - Require all metadata before save or submit. Rejected: conflicts with MVP validation philosophy.
  - Store metadata as an opaque blob. Rejected: weakens validation and future reuse.

## Decision 7: Use lightweight review history plus denormalized latest review state on vacancy responses

- **Decision**: Store each expert decision as its own review history record and expose the latest decision, latest comment, and latest decision time directly on vacancy responses for fast UI rendering.
- **Rationale**: This satisfies the product need for visible review state without introducing full revision history.
- **Alternatives considered**:
  - No review history at all. Rejected: loses auditability for approve vs request-changes flow.
  - Full version snapshots of each vacancy edit. Rejected: unnecessary complexity in this slice.

## Decision 8: Organize the internal web UX around lists plus one focused workspace

- **Decision**: Replace placeholders with three purposeful UI surfaces: a recruiter vacancy list, an expert review queue, and a shared vacancy workspace. The workspace is sectioned into `Role brief`, `Candidate profile`, `Interview pack`, and `Review state`, with a clear primary action area, sticky status/actions on desktop, stacked sections on mobile, and explicit empty/loading/error states.
- **Rationale**: This is the most useful internal UX pattern for repeated authoring and review work. It aligns with the repo design system and makes the workflow readable in one screen hierarchy instead of splitting content across many modal-heavy steps.
- **Alternatives considered**:
  - Put the entire flow inside recruiter workspace tabs only. Rejected: weak review ergonomics and poor route clarity.
  - Separate each section into a wizard. Rejected: too rigid for iterative editing and review.

## Decision 9: Keep candidate-facing features out of this slice but enforce the future dependency now

- **Decision**: This slice does not create candidate links or interviews, but the vacancy contract and service rules will block downstream candidate use unless a vacancy is `approved`.
- **Rationale**: This keeps the current slice focused while protecting future integration points.
- **Alternatives considered**:
  - Leave downstream eligibility unspecified until a later feature. Rejected: allows future ambiguity and inconsistent gating.

## Decision 10: Inherited recruiter access follows the existing managed-user chain

- **Decision**: A recruiter can access vacancies they created directly and vacancies created by internal users whose accounts were created by that recruiter. The backend enforces this through the existing managed-user relationship rather than through frontend filtering alone.
- **Rationale**: This matches the existing internal user administration model and gives recruiters operational access to work produced by accounts they created without expanding access to unrelated recruiters.
- **Alternatives considered**:
  - Direct creator only. Rejected: blocks the delegated-authoring workflow the user asked for.
  - All recruiters can access all recruiter-area vacancies. Rejected: too broad and breaks ownership boundaries.

## Resolved Planning Unknowns

- Workflow is now explicit, including archive restore behavior.
- Permissions are defined as capability extensions plus per-viewer workspace permissions.
- Shared-route concurrency is resolved with optimistic conflict handling.
- UI/UX direction is defined around a shared workspace and role-specific lists.
- Inherited recruiter vacancy access is resolved through the existing managed-user chain.
- No `NEEDS CLARIFICATION` items remain for planning.
