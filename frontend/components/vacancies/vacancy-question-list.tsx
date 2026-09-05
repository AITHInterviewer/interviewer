import type { VacancyQuestion } from "@/lib/api";

export type QuestionDraft = {
  text: string;
  reference_answer: string;
  skill_tags: string;
  intent: string;
};

type VacancyQuestionListProps = {
  questions: VacancyQuestion[];
  drafts: Record<string, QuestionDraft>;
  canEdit: boolean;
  onChange: (questionId: string, draft: QuestionDraft) => void;
  onDelete: (questionId: string) => Promise<void>;
  newQuestionText: string;
  onNewQuestionTextChange: (value: string) => void;
  onAdd: (text: string) => Promise<void>;
};

export function VacancyQuestionList({
  questions,
  drafts,
  canEdit,
  onChange,
  onDelete,
  newQuestionText,
  onNewQuestionTextChange,
  onAdd,
}: VacancyQuestionListProps) {
  return (
    <section className="recruiter-users-panel">
      <div className="section-heading">
        <div>
          <h2>Interview pack</h2>
          <p>Questions, reference answers, and assessment notes.</p>
        </div>
      </div>
      <div className="recruiter-side-panel__body vacancy-question-stack">
        {questions.length === 0 ? (
          <div className="placeholder-card recruiter-helper-card">
            <span className="status">Questions</span>
            <strong>No questions yet.</strong>
            <p>Add manual questions now. Metadata can stay partially empty in this MVP.</p>
          </div>
        ) : null}

        {questions.map((question) => {
          const draft = drafts[question.id];
          if (!draft) {
            return null;
          }

          return (
            <article className="candidate-card vacancy-question-card" key={question.id}>
              <div className="candidate-card__top">
                <div>
                  <strong>Question {question.order + 1}</strong>
                  <p className="field-hint">{question.format} / {question.difficulty}</p>
                </div>
                {canEdit ? (
                  <div className="page-actions">
                    <button className="button button--ghost" type="button" onClick={() => void onDelete(question.id)}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="vacancy-form-grid">
                <label className="vacancy-form-grid__full">
                  Question text
                    <textarea
                      value={draft.text}
                      readOnly={!canEdit}
                      onChange={(event) => onChange(question.id, { ...draft, text: event.target.value })}
                    />
                </label>
                <label className="vacancy-form-grid__full">
                  Reference answer
                    <textarea
                      value={draft.reference_answer}
                      readOnly={!canEdit}
                      onChange={(event) => onChange(question.id, { ...draft, reference_answer: event.target.value })}
                    />
                </label>
                <label>
                  Skill tags
                    <input
                      value={draft.skill_tags}
                      readOnly={!canEdit}
                      onChange={(event) => onChange(question.id, { ...draft, skill_tags: event.target.value })}
                    />
                </label>
                <label>
                  Intent
                    <input
                      value={draft.intent}
                      readOnly={!canEdit}
                      onChange={(event) => onChange(question.id, { ...draft, intent: event.target.value })}
                    />
                </label>
              </div>
            </article>
          );
        })}

        {canEdit ? (
          <div className="placeholder-card vacancy-question-composer">
            <strong>Add question</strong>
            <textarea
              value={newQuestionText}
              onChange={(event) => onNewQuestionTextChange(event.target.value)}
              placeholder="Add a manual question"
            />
            <div className="form-actions">
              <button
                className="button button--primary"
                type="button"
                disabled={newQuestionText.trim().length === 0}
                onClick={() => void onAdd(newQuestionText)}
              >
                Add question
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
