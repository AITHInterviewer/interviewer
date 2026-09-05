# Feature Specification: Recruiter Vacancy Review Workflow

**Feature Branch**: `[008-recruiter-vacancy-review]`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Build a recruiter vacancy authoring and expert review workflow before implementing AI generation and candidate link creation. This slice covers vacancy creation and editing, question authoring, reference answers and assessment metadata, expert review and approval, and approved/archive lifecycle."

## Clarifications

### Session 2026-09-04

- Q: Should the recruiter who created a managed internal user get full recruiter control over that user's vacancies, or only limited access? → A: Full recruiter control: view, edit, submit, archive, and restore inherited-access vacancies.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recruiter authors a vacancy draft and question pack (Priority: P1)

A recruiter can create a vacancy as a draft, fill in the role context, add and edit interview questions, and save reference answers and question metadata without needing expert involvement first. This access also extends to vacancies created by internal users whose accounts were created and managed by that recruiter.

**Why this priority**: This is the entry point for the whole workflow. Without recruiter authoring, there is nothing meaningful to review, approve, or use later.

**Independent Test**: Create a new vacancy, fill in role and candidate profile fields, add multiple questions with optional metadata, save the draft, reopen it, and confirm all entered content is preserved.

**Acceptance Scenarios**:

1. **Given** a recruiter wants to open a new role, **When** they create a vacancy, **Then** the vacancy starts in `draft` status and is owned by that recruiter.
2. **Given** a recruiter owns a draft vacancy, **When** they edit the vacancy body fields, **Then** the updated role information is saved on the same vacancy.
3. **Given** a recruiter owns a draft vacancy, **When** they add, edit, reorder, or delete questions, **Then** the question pack is saved with the intended order and optional metadata.
4. **Given** a recruiter creates a question without a reference answer or full metadata, **When** they save the vacancy, **Then** the draft remains valid and the missing optional fields do not block saving.
5. **Given** a managed internal user creates a vacancy, **When** the recruiter who created that internal user account opens it, **Then** that recruiter gets full recruiter workflow control over that vacancy, including view, edit, submit, archive, and restore actions when the vacancy state allows them.
6. **Given** one recruiter owns or manages a vacancy, **When** an unrelated recruiter tries to open or edit it, **Then** access is denied.

---

### User Story 2 - Recruiter submits a vacancy for expert review (Priority: P1)

After drafting the vacancy, the recruiter can submit it for expert review without needing to satisfy strict completeness checks in this MVP.

**Why this priority**: Submission creates the handoff from authoring to quality review. It is the domain boundary that turns a private draft into a reviewable assessment pack.

**Independent Test**: Submit a vacancy that has incomplete optional metadata and confirm the status changes to `submitted_for_review` while preserving all saved content.

**Acceptance Scenarios**:

1. **Given** a recruiter owns a vacancy in `draft` or `changes_requested`, **When** they submit it for review, **Then** the vacancy moves to `submitted_for_review` and the submission time is recorded.
2. **Given** a recruiter has a vacancy with no required skills, no questions, or partial question metadata, **When** they submit it for review, **Then** the system accepts the submission for this MVP.
3. **Given** a vacancy is already `approved` or `archived`, **When** the recruiter tries to submit it for review again without first returning it to an editable state, **Then** the system rejects the action.

---

### User Story 3 - Expert reviews and decides on the assessment pack (Priority: P1)

An expert can open submitted vacancies, review the interview pack on the same vacancy page used by recruiters, edit only the questions and assessment metadata, and either approve the vacancy or request changes.

**Why this priority**: Expert review is the quality gate that gives approval meaning and protects downstream candidate flows from weak or incomplete assessments.

**Independent Test**: Open a submitted vacancy as an expert, change question-level content only, approve one vacancy, request changes on another, and confirm that body fields remain protected.

**Acceptance Scenarios**:

1. **Given** a vacancy is in `submitted_for_review`, **When** an expert opens it, **Then** the expert can view the full vacancy and edit only questions and assessment metadata.
2. **Given** an expert is reviewing a submitted vacancy, **When** they try to edit title, grade, job description, candidate profile, or skills lists, **Then** the system rejects those edits.
3. **Given** an expert finishes review and approves the vacancy, **When** the approval is saved, **Then** the vacancy moves to `approved` and the approver and approval time are recorded.
4. **Given** an expert wants recruiter updates, **When** they request changes with or without a comment, **Then** the vacancy moves to `changes_requested` and the decision is recorded.
5. **Given** a vacancy is already `approved` or `archived`, **When** an expert tries to edit or review it, **Then** the system prevents further expert editing.

---

### User Story 4 - Recruiter revises approved or returned vacancies and manages archive state (Priority: P2)

The recruiter can revise a vacancy after requested changes, and any significant recruiter change to an approved vacancy automatically returns it to draft. The recruiter can also archive a vacancy to disable further use and restore it later if needed.

**Why this priority**: This preserves approval as a meaningful quality boundary while giving recruiters a controlled way to continue working on real vacancies over time.

**Independent Test**: Update a vacancy after changes are requested, confirm it returns to `draft`, update an approved vacancy and confirm significant changes reset approval, then archive and restore it.

**Acceptance Scenarios**:

1. **Given** a vacancy is in `changes_requested`, **When** the recruiter edits it, **Then** the vacancy returns to `draft` so it can be resubmitted later.
2. **Given** a vacancy is `approved`, **When** the recruiter changes a significant vacancy field, question text, reference answer, or question metadata, **Then** the vacancy automatically returns to `draft`.
3. **Given** a vacancy is `approved`, **When** the recruiter archives it, **Then** the vacancy moves to `archived`, is marked closed for further use, and the archive actor and time are recorded.
4. **Given** a vacancy is `archived`, **When** the recruiter restores it, **Then** the vacancy returns to an editable non-archived state and becomes available for continued workflow.

---

### Edge Cases

- A recruiter submits a vacancy with zero questions, zero required skills, or empty optional question metadata; submission still succeeds in this MVP.
- An expert requests changes and leaves the comment empty; the decision is still valid.
- A recruiter edits an approved vacancy by changing only question metadata or a reference answer; the vacancy still resets to `draft` because those are significant changes.
- An expert tries to review a vacancy that is no longer in `submitted_for_review` because the recruiter updated it first; the expert action is rejected.
- A recruiter tries to archive a vacancy that is already archived; the system prevents a duplicate state change.
- A recruiter restores an archived vacancy and must not lose the previously approved or reviewed content.
- An expert can view vacancy body fields while reviewing but cannot alter them.
- Archived vacancies cannot be edited or reviewed until restored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a recruiter to create a vacancy owned by that recruiter with initial status `draft`.
- **FR-002**: System MUST allow a recruiter to view a list of vacancies they can control directly or through the managing recruiter ownership chain and open the full details of those vacancies.
- **FR-003**: System MUST allow a recruiter to edit vacancy body fields while the vacancy is in an editable recruiter state when that recruiter has direct or inherited recruiter control.
- **FR-004**: System MUST store for each vacancy at least: title, grade, job description, ideal candidate profile, required skills, nice-to-have skills, status, creator, submission details, approval details, archive details, creation time, and update time.
- **FR-005**: System MUST support the vacancy lifecycle states `draft`, `submitted_for_review`, `changes_requested`, `approved`, and `archived`.
- **FR-006**: System MUST allow a recruiter to create, edit, reorder, and delete questions within a vacancy they control directly or through the managing recruiter ownership chain.
- **FR-007**: System MUST store for each question at least its vacancy, text, and display order.
- **FR-008**: System MUST support optional question attributes for skill tags, intent, reference answer, format, role, difficulty, estimated duration, stimulus, and source.
- **FR-009**: System MUST permit questions to be saved even when optional metadata fields are empty.
- **FR-010**: System MUST allow a recruiter to submit a vacancy in `draft` or `changes_requested` for expert review without enforcing completeness requirements for skills, question count, or question metadata in this MVP.
- **FR-011**: System MUST record the submission timestamp when a vacancy is submitted for review.
- **FR-012**: System MUST allow experts to view vacancies that are currently awaiting review.
- **FR-013**: System MUST present the vacancy details through a shared vacancy workspace while enforcing expert-specific permissions on allowed actions.
- **FR-014**: System MUST allow an expert to edit only questions and question-related assessment metadata while a vacancy is in `submitted_for_review`.
- **FR-015**: System MUST prevent an expert from changing vacancy body fields, recruiter ownership fields, approval fields, or archive fields.
- **FR-016**: System MUST allow an expert to approve a vacancy in `submitted_for_review`.
- **FR-017**: System MUST record the approver and approval timestamp when a vacancy is approved.
- **FR-018**: System MUST allow an expert to request changes on a vacancy in `submitted_for_review`.
- **FR-019**: System MUST allow the expert's change-request comment to be empty.
- **FR-020**: System MUST record each review decision as part of the vacancy's visible review state, including the latest decision and latest comment.
- **FR-021**: System MUST preserve lightweight review decision history for approvals and change requests.
- **FR-022**: System MUST return a vacancy in `changes_requested` to `draft` when the recruiter makes further edits.
- **FR-023**: System MUST automatically reset an `approved` vacancy to `draft` when a recruiter changes any significant approved content.
- **FR-024**: Significant recruiter changes MUST include changes to title, grade, job description, ideal candidate profile, required skills, nice-to-have skills, question text, reference answer, and question metadata.
- **FR-025**: The approval reset rule MUST be enforced consistently regardless of which client interface initiated the change.
- **FR-026**: System MUST allow a recruiter to archive a vacancy they control directly or through the managing recruiter ownership chain to disable further operational use.
- **FR-027**: System MUST record who archived the vacancy and when it was archived.
- **FR-028**: System MUST allow a recruiter to restore an archived vacancy they control directly or through the managing recruiter ownership chain.
- **FR-029**: System MUST prevent experts from editing approved vacancies.
- **FR-030**: System MUST prevent experts from editing archived vacancies.
- **FR-031**: System MUST prevent recruiters from viewing or editing vacancies outside their direct creator or managing recruiter ownership chain.
- **FR-032**: System MUST prevent candidate-link creation and downstream candidate use for vacancies unless they are in `approved` status.
- **FR-033**: System MUST preserve vacancy and question content when a vacancy changes status so that review and archive actions do not remove authored data.
- **FR-034**: System MUST treat future candidate-flow content as dependent on an approved vacancy snapshot rather than on live vacancy edits made afterward.
- **FR-035**: System MUST allow a recruiter to access vacancies they created directly.
- **FR-036**: System MUST allow a recruiter to fully control vacancies created by internal users whose accounts were created by that recruiter, including viewing, editing, submitting, archiving, and restoring them when the vacancy state allows those actions.
- **FR-037**: System MUST deny recruiter vacancy access outside the direct creator or managing recruiter ownership chain.
- **FR-038**: System MUST enforce inherited recruiter vacancy access in backend authorization logic regardless of client behavior.

### Key Entities *(include if feature involves data)*

- **Vacancy**: The recruiter-owned hiring object containing role context, candidate profile, lifecycle status, and operational audit fields.
- **Managed Recruiter Ownership**: The access relationship that gives a recruiter control over vacancies they created directly and vacancies created by internal users whose accounts were created by that recruiter.
- **Vacancy Question**: An ordered interview question belonging to one vacancy, with question text and optional assessment metadata such as skill tags, intent, reference answer, duration, and source.
- **Vacancy Review Decision**: A lightweight record of one expert decision on a vacancy, including the expert, the decision type, the optional comment, and the decision time.
- **Recruiter**: The internal user who creates, owns, edits, submits, archives, and restores their vacancies.
- **Expert**: The internal user who reviews submitted vacancies, edits only the assessment pack, and approves or requests changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In validation runs, 100% of recruiters can create a vacancy draft, save body fields and questions, close the page, and reopen the same content without data loss.
- **SC-002**: In validation runs, 100% of eligible vacancies can be submitted for review even when they have zero required skills, zero questions, or incomplete optional question metadata.
- **SC-003**: In validation runs, 100% of expert review attempts on submitted vacancies allow question-pack updates while rejecting body-field edits.
- **SC-004**: In validation runs, 100% of approval actions record both approval timestamp and approver identity, and 100% of change-request actions record the latest decision state even when the comment is empty.
- **SC-005**: In validation runs, 100% of significant recruiter edits to approved vacancies reset the vacancy to `draft` before further downstream use.
- **SC-006**: Recruiters can move a vacancy from creation to review submission in under 10 minutes for a typical manually authored vacancy in usability testing.
- **SC-007**: Recruiters can identify the current review state and latest decision outcome for 100% of tested vacancies without opening separate audit tooling.
- **SC-008**: In validation runs, 100% of archived vacancies are blocked from further operational use until restored.

## Assumptions

- Internal authentication and user identity already exist; this feature defines vacancy permissions and workflow boundaries, not sign-in.
- Recruiter and expert are distinct roles for permission purposes even if the same person may later hold both roles through a separate access model.
- A recruiter may manage other internal users through the existing internal user creation flow, and that management relationship can be reused for inherited vacancy access.
- Restoring an archived vacancy returns it to the last non-archived working state rather than creating a new vacancy.
- The same vacancy workspace can adapt available actions by role and status, while permission enforcement remains role-specific and independent of the user interface.
- Approval is meaningful only for the assessment pack in this slice; downstream candidate operations are intentionally out of scope here.
- AI-generated questions, candidate links, link expiry, and interview execution remain out of scope for this feature even if some data fields are designed to support them later.
- Review history is lightweight decision logging rather than full version tracking.
