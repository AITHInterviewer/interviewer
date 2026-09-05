import type { PipelineCard, PipelineStage } from "./types";

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  invited: "Приглашены",
  inProgress: "Проходят",
  processing: "Обработка",
  reportReady: "Отчёт готов",
  decided: "Решено",
};

export const PIPELINE_COLUMNS: Array<{ stage: PipelineStage; columnId: "invited" | "progress" | "processing" | "ready" | "decided"; title: string }> =
  [
    { stage: "invited", columnId: "invited", title: PIPELINE_STAGE_LABELS.invited },
    { stage: "inProgress", columnId: "progress", title: PIPELINE_STAGE_LABELS.inProgress },
    { stage: "processing", columnId: "processing", title: PIPELINE_STAGE_LABELS.processing },
    { stage: "reportReady", columnId: "ready", title: PIPELINE_STAGE_LABELS.reportReady },
    { stage: "decided", columnId: "decided", title: PIPELINE_STAGE_LABELS.decided },
  ];

export const pipelineCards: PipelineCard[] = [
  {
    id: "marina",
    name: "Марина Соколова",
    stage: "invited",
    stageLine: "Письмо имитировано, ссылку ещё не открывала",
    canonical: false,
  },
  {
    id: "pavel",
    name: "Павел Юрьев",
    stage: "inProgress",
    stageLine: "Отвечает, вопрос 3 из 5",
    canonical: false,
  },
  {
    id: "elena",
    name: "Елена Волкова",
    stage: "processing",
    stageLine: "Ответы отправлены, отчёт готовится",
    canonical: false,
  },
  {
    id: "dmitry",
    name: "Дмитрий Козлов",
    stage: "reportReady",
    stageLine: "Соответствует",
    reportHref: "/vacancies/python-middle/candidates/dmitry",
    canonical: true,
  },
  {
    id: "nikita",
    name: "Никита Белов",
    stage: "reportReady",
    stageLine: "Не соответствует",
    reportHref: "/vacancies/python-middle/candidates/nikita",
    canonical: true,
  },
  {
    id: "lida",
    name: "Лидия Орлова",
    stage: "reportReady",
    stageLine: "Недостаточно данных",
    reportHref: "/vacancies/python-middle/candidates/lida",
    canonical: true,
  },
  {
    id: "oleg",
    name: "Олег Новиков",
    stage: "decided",
    stageLine: "Решение: передан менеджеру",
    decisionLabel: "Передан менеджеру",
    canonical: false,
  },
];

export function listPipelineCards(): PipelineCard[] {
  return pipelineCards.map((card) => ({ ...card }));
}

export function cardsForStage(stage: PipelineStage, cards: PipelineCard[] = pipelineCards): PipelineCard[] {
  return cards.filter((card) => card.stage === stage).map((card) => ({ ...card }));
}
