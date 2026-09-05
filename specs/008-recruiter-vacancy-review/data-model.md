# Data Model: Recruiter Vacancy Review Workflow

## Entity: Vacancy

**Purpose**: Represents one recruiter-owned hiring request and its assessment authoring lifecycle from first draft through expert approval and archival.

**Fields**:
- `id`: Unique vacancy identifier.
- `title`: Vacancy title.
- `grade`: Seniority level: `intern`, `junior`, `middle`, `senior`, `lead`.
- `job_description`: Long-form role description.
- `ideal_candidate_profile`: Long-form description of the target candidate.
- `required_skills`: Ordered list of mandatory skills.
- `nice_to_have_skills`: Ordered list of optional skills.
- `status`: Lifecycle state: `draft`, `submitted_for_review`, `changes_requested`, `approved`, `archived`.
- `status_before_archive`: Last non-archived status used to restore an archived vacancy to the correct working state.
- `created_by_recruiter_id`: Recruiter who owns the vacancy.
- `created_by_user_id`: Internal user who directly created the vacancy.
- `managing_recruiter_id`: Recruiter who has recruiter workflow access to the vacancy; for direct recruiter-created vacancies this matches the creator, and for managed-user-created vacancies it points to the recruiter who created that internal user account.
- `submitted_at`: Most recent submission timestamp.
- `approved_at`: Most recent approval timestamp.
- `approved_by_user_id`: Expert who most recently approved the vacancy.
- `archived_at`: Archive timestamp when archived.
- `archived_by_user_id`: User who archived the vacancy.
- `created_at`: Creation timestamp.
- `updated_at`: Last mutation timestamp used for stale-write detection and UI refresh.

**Validation Rules**:
- `created_by_user_id` is required and never changes.
- `managing_recruiter_id` is required and never changes after creation.
- `status` must be one of the defined lifecycle states.
- `status_before_archive` is empty unless the current status is `archived` or the record has previously been archived.
- Only the owning recruiter may mutate recruiter-managed fields.
- A vacancy in `approved` or `archived` cannot be modified by the expert review editor.

**Relationships**:
- One vacancy belongs to one direct creator.
- One vacancy belongs to one managing recruiter for recruiter workflow access.
- One vacancy has many vacancy questions.
- One vacancy has many review decisions.

**State Transitions**:
- Create -> `draft`
- Recruiter edits while in `draft` -> `draft`
- Recruiter submits -> `submitted_for_review`
- Expert requests changes -> `changes_requested`
- Recruiter edits after changes requested -> `draft`
- Expert approves -> `approved`
- Recruiter makes significant change to approved content -> `draft`
- Any active state -> `archived`
- `archived` -> restore to `status_before_archive`

## Entity: Vacancy Question

**Purpose**: Represents one ordered interview prompt belonging to a vacancy, including optional assessment metadata used by recruiter and expert editing.

**Fields**:
- `id`: Unique question identifier.
- `vacancy_id`: Parent vacancy identifier.
- `text`: Question text.
- `order`: Display order within the vacancy.
- `skill_tags`: Optional ordered list of related skill labels.
- `intent`: Optional explanation of what the question is meant to assess.
- `reference_answer`: Optional reference answer.
- `format`: Question format, default `voice`.
- `role`: Question role, default `assessment`.
- `difficulty`: Question difficulty, default `baseline`.
- `estimated_duration_sec`: Optional expected duration in seconds.
- `stimulus`: Optional supporting prompt or scenario text.
- `source`: Question source, default `base_manual`.
- `created_at`: Creation timestamp.
- `updated_at`: Last mutation timestamp.

**Validation Rules**:
- `text` is required.
- `order` must be unique within one vacancy.
- Optional metadata may be empty.
- Default values are applied on create for `format`, `role`, `difficulty`, and `source` when omitted.
- Recruiters may edit questions on their own editable vacancies.
- Experts may edit questions only while the vacancy is in `submitted_for_review`.

**Relationships**:
- Many questions belong to one vacancy.

## Entity: Vacancy Review Decision

**Purpose**: Captures one expert review outcome without full version tracking.

**Fields**:
- `id`: Unique decision identifier.
- `vacancy_id`: Reviewed vacancy.
- `expert_user_id`: Expert who made the decision.
- `decision`: `approved` or `changes_requested`.
- `comment`: Optional decision comment; empty string allowed.
- `created_at`: Decision timestamp.

**Validation Rules**:
- `decision` must be one of the supported review outcomes.
- `comment` may be empty.
- Decisions may only be recorded while the vacancy is in `submitted_for_review`.

**Relationships**:
- Many review decisions belong to one vacancy.
- Many review decisions may be authored by one expert.

## Derived View: Vacancy Review State

**Purpose**: Gives the UI a direct, current summary of review outcome without recomputing it client-side.

**Fields**:
- `status`: Current vacancy status.
- `latest_review_decision`: Latest review decision when one exists.
- `latest_review_comment`: Latest review comment, including empty string when explicitly provided.
- `latest_reviewed_at`: Time of latest review decision.
- `approved_at`: Current approval time when approved.
- `approved_by_user_id`: Current approver when approved.

## Derived View: Vacancy Viewer Permissions

**Purpose**: Tells the shared vacancy workspace which controls and sections are interactive for the current viewer.

**Fields**:
- `can_edit_body`
- `can_edit_questions`
- `can_submit_for_review`
- `can_approve`
- `can_request_changes`
- `can_archive`
- `can_restore`
- `can_view_review_history`

**Rules**:
- Derived from actor role capabilities, recruiter ownership, and current vacancy status.
- Returned by both recruiter and expert detail endpoints.
- UI uses these flags for presentation only; backend authorization remains authoritative.

## Identity and Uniqueness Rules

- One internal user directly creates a vacancy.
- One managing recruiter owns recruiter workflow access to a vacancy for its full lifetime.
- If a managed internal user creates a vacancy, the managing recruiter is the recruiter who created that internal user account.
- Vacancy titles are not globally unique.
- One question id belongs to one vacancy only.
- Question order is unique within a vacancy and normalized after add, update, reorder, or delete operations.
- One review decision is immutable after creation.

## Conflict Handling

- All mutating vacancy and question operations include the client’s last known `updated_at` value as `expected_updated_at`.
- If the stored vacancy has a different `updated_at`, the mutation is rejected as a stale write.
- Conflict rejection never partially applies question or status updates.

## Significant Change Detection

The following recruiter-originated changes on an approved vacancy reset it to `draft`:

- `title`
- `grade`
- `job_description`
- `ideal_candidate_profile`
- `required_skills`
- `nice_to_have_skills`
- question `text`
- question `reference_answer`
- any question metadata field

The reset clears current approval markers but preserves review decision history.

## Scale Assumptions

- Typical recruiter workload: tens of owned vacancies, not thousands.
- Typical vacancy size: 0-50 questions.
- Concurrent editing is uncommon but possible, especially recruiter/expert overlap on the same vacancy.
