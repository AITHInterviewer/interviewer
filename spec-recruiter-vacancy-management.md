## Recruiter Vacancy Management Idea

### Goal

Build a recruiter vacancy authoring and expert review workflow before implementing AI generation and candidate link creation.

This slice should cover:
- vacancy creation
- vacancy editing
- question authoring
- saving reference answers and related metadata
- expert review and approval flow
- approved/archive lifecycle

This slice should not yet cover:
- AI question generation
- candidate link generation
- expiring candidate links
- interview execution flow

### Product Summary

A recruiter creates a vacancy as a working draft, fills in the role context and question pack, then submits it for expert review. The expert reviews and edits only the question pack and assessment metadata, not the vacancy body itself. After expert approval, the vacancy becomes approved and can later be used for downstream candidate flows. Once a strong candidate is found, the recruiter can archive the vacancy to disable further use.

### Vacancy Lifecycle

Statuses:
1. `draft`
2. `submitted_for_review`
3. `changes_requested`
4. `approved`
5. `archived`

Meaning:
- `draft`: recruiter is creating or editing the vacancy
- `submitted_for_review`: recruiter sent the vacancy to expert review
- `changes_requested`: expert returned it for recruiter updates
- `approved`: expert approved the assessment pack
- `archived`: vacancy is closed/disabled, for example after finding a strong candidate

### Core Workflow

```text
Recruiter creates vacancy
  -> draft

Recruiter edits vacancy body and question pack
  -> draft

Recruiter submits for review
  -> submitted_for_review

Expert opens the vacancy
  -> edits questions / skill tags / intent / reference answers / duration / related assessment fields

Expert either:
  -> approve => approved
  -> request changes => changes_requested

Recruiter updates the vacancy again
  -> draft

Recruiter can later archive the vacancy
  -> archived
```

### Ownership And Edit Boundaries

Recruiter:
- can create vacancies
- can view and edit only their own vacancies
- can edit vacancy body fields
- can edit question pack
- can submit for review
- can archive and restore vacancies
- if recruiter changes an approved vacancy, the status resets to `draft`

Expert:
- can view vacancies that are submitted for review
- can review using the same frontend vacancy page as recruiter
- can edit only questions and assessment metadata before approval
- cannot edit vacancy body fields
- can approve a vacancy
- can request changes
- cannot edit approved vacancies
- cannot edit archived vacancies

Shared frontend UX:
- recruiter and expert may open the same vacancy route
- backend API should still be role-separated

### Approved Vacancy Reset Rule

If a recruiter changes any significant approved content, the vacancy must automatically return to `draft`.

Significant recruiter changes include:
- title
- grade
- job description
- ideal candidate profile
- required skills
- nice-to-have skills
- any question text
- any reference answer
- any question metadata

This rule should live in backend service logic, not only in frontend behavior.

### Vacancy Fields

Core fields:
- `title`
- `grade`
- `job_description`
- `ideal_candidate_profile`
- `required_skills`
- `nice_to_have_skills`
- `status`

Operational fields:
- `created_by_recruiter_id`
- `submitted_at`
- `approved_at`
- `approved_by_user_id`
- `archived_at`
- `archived_by_user_id`
- `created_at`
- `updated_at`

### Field Semantics

`grade`
- position seniority level
- suggested MVP enum:
  - `intern`
  - `junior`
  - `middle`
  - `senior`
  - `lead`

`required_skills`
- mandatory skills expected from the candidate
- later used for question generation and evaluation logic
- examples: `Python`, `FastAPI`, `PostgreSQL`

`nice_to_have_skills`
- desirable but not mandatory skills
- later used for richer profiling and evaluation context
- examples: `Docker`, `Redis`, `AWS`

`job_description`
- detailed description of the role, responsibilities, team, and stack

`ideal_candidate_profile`
- narrative description of the desired candidate profile
- later useful for both question generation and candidate analysis

### Question Model Direction

Minimum fields:
- `id`
- `vacancy_id`
- `text`
- `order`

Additional fields, preferably nullable in MVP:
- `skill_tags`
- `intent`
- `reference_answer`
- `format`
- `role`
- `difficulty`
- `estimated_duration_sec`
- `stimulus`
- `source`

Recommended defaults:
- `format = voice`
- `role = assessment`
- `difficulty = baseline`
- `source = base_manual`

Why nullable:
- AI generation is not implemented yet
- recruiter may create questions manually
- not every question needs a reference answer
- a valid question may be open-ended, for example: `Tell me about yourself`

### Validation Philosophy For MVP

Do not block `submit for review` with strict completeness validations yet.

For this slice:
- no requirement for at least one required skill
- no requirement for at least one assessment question
- no requirement for full question metadata

The workflow should remain permissive at this stage.

### Review Comments

Expert comments on `request changes` may be empty.
An empty string is acceptable for MVP.

### Review History

Full versioning is not required for MVP.

Optional lightweight history entity:

`VacancyReviewDecision`
- `id`
- `vacancy_id`
- `expert_user_id`
- `decision`
- `comment`
- `created_at`

This would preserve approval/change-request history without introducing full revision tracking.

### Candidate Flow Dependency

Later candidate link generation should depend only on `approved` vacancies.

Important forward-looking rule:
- when a candidate flow is later created from an approved vacancy, the approved question pack should be snapshotted into the interview context
- future vacancy edits must not mutate historical interview content

### API Direction
#### I am not sure but believe it might help
Recruiter API:
1. `POST /api/v1/vacancies`
2. `GET /api/v1/vacancies`
3. `GET /api/v1/vacancies/{id}`
4. `PATCH /api/v1/vacancies/{id}`
5. `POST /api/v1/vacancies/{id}/questions`
6. `PATCH /api/v1/vacancies/{id}/questions/{question_id}`
7. `DELETE /api/v1/vacancies/{id}/questions/{question_id}`
8. `POST /api/v1/vacancies/{id}/submit-for-review`
9. `POST /api/v1/vacancies/{id}/archive`
10. `POST /api/v1/vacancies/{id}/restore`

Expert API:
1. `GET /api/v1/expert/vacancies?status=submitted_for_review`
2. `GET /api/v1/expert/vacancies/{id}`
3. `PATCH /api/v1/expert/vacancies/{id}/questions/{question_id}`
4. `POST /api/v1/expert/vacancies/{id}/approve`
5. `POST /api/v1/expert/vacancies/{id}/request-changes`

Frontend routing direction:
- recruiter and expert can use the same vacancy page route
- action availability should depend on role and vacancy status
- backend permission boundaries remain separate

### UI Outline

Vacancy page sections:
1. `Role brief`
   - title
   - grade
   - job description
2. `Candidate profile`
   - ideal candidate profile
   - required skills
   - nice-to-have skills
3. `Interview pack`
   - questions
   - reference answers
   - tags
   - intent
   - duration
4. `Review state`
   - status
   - latest review decision
   - latest comment
   - submit / approve / request changes / archive / restore actions depending on role and state

### Product Rationale

This flow deliberately treats the vacancy as more than a simple HR card. It is the source object for later assessment quality.

The workflow ensures:
- recruiter can author the hiring context manually from day one
- expert acts as a quality gate on the assessment pack
- approval becomes a meaningful domain boundary before downstream candidate operations
- future AI generation can be inserted into an already stable authoring model instead of defining the model itself

### Recommended Future Follow-Up

After this authoring/review slice is implemented, the next natural slice is:
- AI generation of vacancy questions and metadata into the same `Question` model
- candidate link generation for approved vacancies only
- expiring access links per candidate
