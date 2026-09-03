---
name: grill-me
description: Help developers using coding agents retain solution knowledge by quizzing them on the current codebase one question at a time, grading each response against the implementation, and explaining incorrect answers. Use when a user asks "Do I know this codebase?", "quiz me on this codebase", "grill me", wants to verify or refresh their mental model of a repository, or wants to catch knowledge drift after delegating implementation work to coding agents.
---

# Grill Me

Test the developer's working mental model of the codebase. Prefer questions about behavior, control flow, data flow, state, boundaries, tradeoffs, and failure handling over syntax or trivia.

## Run the quiz

1. Treat the current worktree as authoritative and keep the quiz read-only.
2. Locate this skill's directory and select its native `bin/pick-quiz-file-<os>-<arch>` executable, adding `.exe` on Windows. Use `windows`, `darwin`, or `linux` for the OS and map `x86_64` to `amd64` and `aarch64` to `arm64`. Run it with the current repository root. It prints one random repository-relative path and requires no language runtime. For later questions, pass every previously selected path as a separate `--exclude-path` argument. Do not enumerate the repository in model-visible output before running the helper.
3. Read the selected file or a relevant bounded section. Choose a substantive behavior or symbol, then use exact-symbol searches to inspect only the callers, callees, tests, configuration, and downstream effects needed to establish the answer. Treat the selected file as a starting point, not the complete source of truth.
4. Rerun the helper when a selected file cannot support a useful question. After three unproductive selections—or when the current platform is unsupported, executable permission is denied, or no viable candidates are available—fall back to inspecting enough of the repository to build a private pool of viable subjects from distinct components. Exclude generated code, vendored dependencies, and facts that amount only to recalling a name or line number.
5. Track selected paths and question subjects in the current conversation. Sample without replacement until the available subjects are exhausted.
6. Form one focused, self-contained question about how that part of the code works. Ask for the mechanism, consequence, or rationale encoded in the implementation. Keep the answer and supporting evidence private. Do not ask multiple independent questions in one turn.
7. Wait for the user's response. Do not provide hints unless the user explicitly asks for one; a hint does not resolve the question.
8. Grade the response semantically against the inspected code. Accept different terminology when the explanation preserves the actual behavior and important consequences. Do not require details the question did not ask for.
9. Resolve the question using exactly one of these outcomes:
   - If correct, reply `Correct. Would you like another question?`
   - If incorrect, begin with `Incorrect.` Then concisely explain the actual behavior and cite the relevant local files or symbols. End with `Would you like another question?`
10. If the user continues, repeat from file selection and ask exactly one new question. If the user challenges the grade, re-open the relevant implementation, address the challenge, and correct the grade when warranted before offering to continue.

## Question quality

- Ask questions a maintainer may need to answer during debugging or an incident.
- Favor cross-component relationships and observable behavior over isolated implementation details.
- Match difficulty to the repository's size and available evidence, but do not fabricate behavior when the code is incomplete.
- Keep each question narrow enough to grade as correct or incorrect.
- Mention the relevant feature or component, but avoid source citations or wording that reveals the answer before grading.
- When the repository has too little substantive code for a grounded question, say so instead of inventing one.
