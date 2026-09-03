# Data model (demo module)

Все сущности — TypeScript-типы и JSON в `frontend/lib/demo/`. Не база данных.

## Vacancy

- `id`, `title`, `grade`, `status` (Черновик | На проверке | Утверждена | Активна | Пауза | Архив)
- `rubricVersion`, `questionSetVersion`, `modelTag`
- `expertName`, `managerName`, `recruiterName`, `recruiterEmail`
- `updatedAt`
- `counts`: invited / inProgress / reportReady / decided
- `seniorModeDefault`, `languages[]`
- `requirements[]`, `questions[]`, `realTasks[]`, `stack[]`, `stopFactors[]`

Seed: одна активная вакансия «Middle+ Python Developer».

## Requirement

- `id`, `title`, `mandatory` (boolean)
- `checkType`: open | verifiable | code
- `status` на отчёте: Подтверждено | Частично | Не подтверждено | Недостаточно данных | Не проверено | Противоречие
- `questionRef` (например `В3`, `В4 + У`)
- `aiSummary`, `whyStatus`, `quote`, `quoteFoundInTranscript`, `timecode`, `questionIndex`
- `followUpText`, `followUpAnswer` | skipped
- `resumeConflict` optional `{ answer, resume }`
- `insufficientReason` optional (фиксированные формулировки)
- `structureHint` (поле «Что раскрыть» для C6)

## Question

- `index` 1..5
- `type`: open | verifiable | code | sql
- `text`, `altText` (переформулировка)
- `prepLimitSec`, `answerLimitSec`
- `requirementIds[]`
- `followUpRule`

## Candidate / InterviewSession

- `id`, `token`, `name`, `email`
- `persona`: strong | weak | ambiguous
- `interviewState` (словарь из спецификации)
- `deadline`, `locale`, `seniorMode`, `textOnly`
- `currentQuestion`, `answers[]`, `followUps[]`
- `proctoringEvents[]`
- `systemRecommendation`: Соответствует | Не соответствует | Недостаточно данных
- `mandatoryCovered` `{ confirmed, total }`
- `humanDecision` optional

Seed:

1. Дмитрий Козлов — strong, Соответствует, 6/6
2. Никита Белов — weak, Не соответствует, 2/6, критическая ошибка
3. Лидия Орлова — ambiguous, Недостаточно данных, 4/6, цитата не найдена, 1 событие прокторинга

Демо-ссылка кандидата: `/i/lida` → Лидия (главный демо-путь). Также `/i/dmitry`, `/i/nikita`.

## Decision

- `kind`: Передан менеджеру | Запрошен доп. ответ | Не продвигать
- `author`, `at`, `comment`
- append-only history

## ProctoringEvent

- `type` (переключение вкладки, потеря камеры, …)
- `at`, `durationSec`
- never included in recommendation
