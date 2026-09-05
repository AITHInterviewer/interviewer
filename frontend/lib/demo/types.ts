export type RequirementStatus =
  | "Подтверждено"
  | "Частично"
  | "Не подтверждено"
  | "Недостаточно данных"
  | "Не проверено"
  | "Противоречие";

export type SystemRecommendation = "Соответствует" | "Не соответствует" | "Недостаточно данных";

export type DecisionKind = "Передан менеджеру" | "Запрошен доп. ответ" | "Не продвигать";

export type VacancyStatus = "Черновик" | "На проверке" | "Утверждена" | "Активна" | "Пауза" | "Архив";

export type InterviewState =
  | "Приглашён"
  | "Открыл"
  | "Оборудование проверено"
  | "Проходит"
  | "Отправлено"
  | "Обработка"
  | "Отчёт готов"
  | "Решение принято"
  | "Прервано"
  | "Истёк срок"
  | "Нужна проверка"
  | "Запрошен доп. ответ"
  | "Удалено";

export type CheckType = "open" | "verifiable" | "code";

export type QuestionType = "open" | "verifiable" | "code" | "sql";

export type Persona = "strong" | "weak" | "ambiguous";

export type Requirement = {
  id: string;
  title: string;
  mandatory: boolean;
  checkType: CheckType;
  questionRef: string;
  structureHint: string;
  whatWeCheck: string;
  strongAnswer: string;
  weakAnswer: string;
  followUpRule: string;
  coverage: number[];
};

export type Question = {
  index: number;
  type: QuestionType;
  text: string;
  altText: string;
  prepLimitSec: number;
  answerLimitSec: number;
  requirementIds: string[];
  followUpRule: string;
  followUpText: string;
  structureHint: string;
};

export type ReportRequirement = {
  requirementId: string;
  status: RequirementStatus;
  aiSummary: string;
  whyStatus: string;
  quote: string;
  quoteFoundInTranscript: boolean;
  timecode: string | null;
  questionIndex: number | null;
  followUpText?: string;
  followUpAnswer?: string | "skipped";
  resumeConflict?: { answer: string; resume: string };
  insufficientReason?: string;
};

export type ProctoringEvent = {
  type: string;
  at: string;
  durationSec: number;
};

export type Decision = {
  kind: DecisionKind;
  author: string;
  at: string;
  comment: string;
};

export type DemoRoleId =
  | "recruiter"
  | "expert"
  | "manager"
  | "candidate-dmitry"
  | "candidate-nikita"
  | "candidate-lida"
  | "admin";

export type RoleOnboarding = {
  who: string;
  willSee: string;
  firstAction: string;
  continueLabel: string;
  backLabel: string;
};

export type DemoRole = {
  id: DemoRoleId;
  title: string;
  personName: string;
  cardLine: string;
  homePath: string;
  onboarding: RoleOnboarding;
};

export type PipelineStage = "invited" | "inProgress" | "processing" | "reportReady" | "decided";

export type PipelineCard = {
  id: string;
  name: string;
  stage: PipelineStage;
  stageLine: string;
  reportHref?: string;
  decisionLabel?: string;
  canonical: boolean;
};

export type Vacancy = {
  id: string;
  title: string;
  grade: string;
  status: VacancyStatus;
  rubricVersion: string;
  questionSetVersion: string;
  modelTag: string;
  expertName: string;
  managerName: string;
  recruiterName: string;
  recruiterEmail: string;
  updatedAt: string;
  counts: {
    invited: number;
    inProgress: number;
    processing: number;
    reportReady: number;
    decided: number;
  };
  seniorModeDefault: boolean;
  languages: string[];
  stack: string[];
  realTasks: string[];
  stopFactors: string[];
  clarifyWithManager: string[];
};

export type Candidate = {
  id: string;
  token: string;
  name: string;
  email: string;
  persona: Persona;
  interviewState: InterviewState;
  deadline: string;
  locale: string;
  seniorMode: boolean;
  textOnly: boolean;
  currentQuestion: number;
  systemRecommendation: SystemRecommendation;
  mandatoryCovered: { confirmed: number; total: number };
  durationMin: number;
  submittedAt: string;
  strengths: string[];
  risks: string[];
  unchecked: string[];
  report: ReportRequirement[];
  proctoringEvents: ProctoringEvent[];
  humanDecision?: Decision;
  criticalError?: string;
};
