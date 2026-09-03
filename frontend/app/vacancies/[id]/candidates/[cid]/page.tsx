"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CaretRight, ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { VersionTag } from "@/components/chrome/VersionTag";
import { AiNote, HumanNote } from "@/components/evidence/AiNote";
import { Modal, ToastStack } from "@/components/evidence/Drawer";
import { EvidenceLink } from "@/components/evidence/EvidenceLink";
import { StatusBadge } from "@/components/evidence/StatusBadge";
import { Button } from "@/components/ui/button";
import { getCandidateById } from "@/lib/demo/candidates";
import { getRequirement } from "@/lib/demo/rubric";
import { appendDecision, pushToast, readStore, writeStore } from "@/lib/demo/recruiter-store";
import type { DecisionKind, ReportRequirement } from "@/lib/demo/types";
import { getVacancy } from "@/lib/demo/vacancies";

export default function CandidateReportPage() {
  const params = useParams<{ id: string; cid: string }>();
  const vacancy = getVacancy(params.id);
  const candidate = getCandidateById(params.cid);
  const [mode, setMode] = useState<"generalist" | "technical">("generalist");
  const [selected, setSelected] = useState<ReportRequirement | null>(candidate?.report[0] ?? null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [toasts, setToasts] = useState<string[]>([]);
  const [selectedReqs, setSelectedReqs] = useState<string[]>([]);
  const [history, setHistory] = useState(() => {
    if (typeof window === "undefined" || !getCandidateById(params.cid)) return [];
    return readStore().decisions[params.cid] ?? [];
  });

  function refreshHistory() {
    setHistory(readStore().decisions[candidate!.id] ?? []);
  }

  if (!vacancy || !candidate) {
    return (
      <AppShell nav={recruiterNav()} title="Отчёт">
        <main className="workspace">
          <h1>Отчёт не найден</h1>
        </main>
      </AppShell>
    );
  }

  const lastDecision = history.at(-1);

  function toast(message: string) {
    pushToast(message);
    setToasts((current) => [...current, message]);
    window.setTimeout(() => setToasts((current) => current.slice(1)), 3500);
  }

  function decide(kind: DecisionKind) {
    appendDecision(candidate!.id, kind, comment);
    refreshHistory();
    toast(`Решение сохранено: ${kind}`);
  }

  return (
    <AppShell nav={recruiterNav()} title="Отчёт">
      <main className="workspace report-workspace">
        <header className="page-title">
          <div>
            <p className="path">
              Кандидаты / {candidate.name}
            </p>
            <h1>Технический отчёт</h1>
            <p className="page-title__description">
              {vacancy.title}, <VersionTag />, интервью {candidate.durationMin} минут, сессия завершена{" "}
              {candidate.submittedAt}
            </p>
          </div>
          <div className="density-switch" aria-label="Плотность отчёта">
            <button type="button" data-active={mode === "generalist"} onClick={() => setMode("generalist")}>
              Кратко
            </button>
            <button type="button" data-active={mode === "technical"} onClick={() => setMode("technical")}>
              Подробно
            </button>
          </div>
        </header>

        <AiNote label="Система предлагает" title={candidate.systemRecommendation}>
          <p style={{ color: "var(--ink-secondary)", fontSize: 13 }}>
            Обязательные требования: {candidate.mandatoryCovered.confirmed} из {candidate.mandatoryCovered.total}.
            {candidate.criticalError ? ` ${candidate.criticalError}.` : ""}
          </p>
        </AiNote>

        <section className="report-glance">
          <div>
            <h3>Сильные стороны</h3>
            <p>{candidate.strengths.join(". ") || "Нет данных"}</p>
          </div>
          <div>
            <h3>Риски</h3>
            <p>{candidate.risks.join(". ") || "Нет данных"}</p>
          </div>
          <div>
            <h3>Не проверено</h3>
            <p>{candidate.unchecked.join(", ") || "Все обязательные затронуты"}</p>
          </div>
        </section>

        <details className="proctoring-row" open={candidate.proctoringEvents.length > 0}>
          <summary>
            <ShieldCheck size={18} />
            {candidate.proctoringEvents.length
              ? `Прокторинг: ${candidate.proctoringEvents.length} событие - ${candidate.proctoringEvents[0].type}, ${candidate.proctoringEvents[0].at}. Не влияет на оценку.`
              : "Прокторинг: событий нет"}
          </summary>
          {candidate.proctoringEvents.map((event) => (
            <p key={`${event.type}-${event.at}`}>
              {event.type} в {event.at}, {event.durationSec} сек. События фиксируются автоматически и не
              входят в оценку.
            </p>
          ))}
        </details>

        <div className="report-grid">
          <section className="requirements-table">
            <div className="section-heading">
              <div>
                <h2>Карта требований</h2>
                <p>Выберите строку, чтобы увидеть основание вывода.</p>
              </div>
            </div>
            <div className="requirements-list">
              {candidate.report.map((item) => {
                const req = getRequirement(item.requirementId);
                if (!req) return null;
                return (
                  <button
                    className="requirement-row"
                    data-active={selected?.requirementId === item.requirementId}
                    key={item.requirementId}
                    type="button"
                    onClick={() => setSelected(item)}
                  >
                    <span
                      className="requirement-mark"
                      data-tone={
                        item.status === "Подтверждено"
                          ? "positive"
                          : item.status === "Не подтверждено"
                            ? "danger"
                            : item.status === "Частично" || item.status === "Противоречие"
                              ? "warning"
                              : undefined
                      }
                    />
                    <span className="requirement-main">
                      <strong>
                        {req.mandatory ? "■" : "□"} {req.title}
                      </strong>
                      <small>{req.mandatory ? "Обязательное" : "Желательное"}</small>
                    </span>
                    <StatusBadge status={item.status} />
                    <span className="source-label">{req.questionRef}</span>
                    <CaretRight size={17} />
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="evidence-drawer" aria-live="polite">
            {selected ? (
              <>
                <div className="evidence-drawer__heading">
                  <div>
                    <h2>{getRequirement(selected.requirementId)?.title}</h2>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="evidence-section">
                  <h3>Вывод</h3>
                  <AiNote>
                    <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{selected.aiSummary}</p>
                  </AiNote>
                </div>
                <div className="evidence-quote">
                  <span>Цитата из ответа</span>
                  <EvidenceLink
                    quote={selected.quote}
                    timecode={selected.timecode}
                    questionLabel={selected.questionIndex ? `В${selected.questionIndex}` : undefined}
                    found={selected.quoteFoundInTranscript}
                  />
                </div>
                <div className="evidence-section">
                  <h3>Почему такой статус</h3>
                  <p>{selected.whyStatus}</p>
                  {selected.insufficientReason ? (
                    <p style={{ marginTop: 8 }}>
                      Причина: {selected.insufficientReason}
                    </p>
                  ) : null}
                  {selected.followUpText ? (
                    <p style={{ marginTop: 10 }}>
                      Уточнение: {selected.followUpText}. Ответ:{" "}
                      {selected.followUpAnswer === "skipped" ? "пропущено" : selected.followUpAnswer}
                    </p>
                  ) : null}
                </div>
                {selected.status === "Недостаточно данных" ? (
                  <div className="evidence-actions">
                    <Button type="button" onClick={() => setFollowUpOpen(true)}>
                      Запросить доп. ответ по этому пункту
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="evidence-section">
                <p>Выберите требование слева.</p>
              </div>
            )}
          </aside>
        </div>

        {mode === "technical" ? (
          <section style={{ marginTop: 18 }}>
            <h2>Ответы по вопросам</h2>
            <p style={{ color: "var(--ink-secondary)", fontSize: 13 }}>
              В демо показаны сводки по требованиям. Полный транскрипт будет после пилота.
            </p>
          </section>
        ) : null}

        <details className="proctoring-row" style={{ marginTop: 16 }}>
          <summary>История</summary>
          {history.length === 0 ? (
            <p>Пока нет решений и комментариев.</p>
          ) : (
            history.map((item) => (
              <p key={`${item.kind}-${item.at}`}>
                {item.kind} · {item.author} · {item.at}
                {item.comment ? ` · ${item.comment}` : ""}
              </p>
            ))
          )}
        </details>

        <div className="decision-bar">
          <div>
            <span>Моё решение</span>
            {lastDecision ? (
              <HumanNote label={`Решение: ${lastDecision.author}, ${lastDecision.at}`}>
                <strong>{lastDecision.kind}</strong>
              </HumanNote>
            ) : (
              <strong>Не выбрано</strong>
            )}
            <input
              style={{ marginTop: 8, minWidth: 260 }}
              placeholder="Комментарий для менеджера"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="decision-actions">
            <Button type="button" onClick={() => decide("Передан менеджеру")}>
              Передать менеджеру
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFollowUpOpen(true)}>
              Запросить доп. ответ
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (window.confirm("Не продвигать этого кандидата?")) decide("Не продвигать");
              }}
            >
              Не продвигать
            </Button>
            <button className="text-button" type="button" onClick={() => setExportOpen(true)}>
              Экспорт в ATS
            </button>
            <Button asChild variant="text">
              <Link href={`/manager/${candidate.id}`}>Посмотреть как менеджер</Link>
            </Button>
          </div>
        </div>
      </main>

      <Modal open={followUpOpen} title="Запросить доп. ответ" onClose={() => setFollowUpOpen(false)}>
        <p style={{ marginBottom: 12, color: "var(--ink-secondary)", fontSize: 13 }}>
          Один вопрос - выше шанс ответа.
        </p>
        {candidate.report
          .filter((item) => item.status !== "Подтверждено")
          .map((item) => {
            const req = getRequirement(item.requirementId);
            if (!req) return null;
            return (
              <label key={item.requirementId} className="consent-row">
                <input
                  type="checkbox"
                  checked={selectedReqs.includes(item.requirementId)}
                  onChange={(e) => {
                    setSelectedReqs((current) =>
                      e.target.checked
                        ? [...current, item.requirementId]
                        : current.filter((id) => id !== item.requirementId),
                    );
                  }}
                />
                <span>
                  {req.title} · {item.status}
                </span>
              </label>
            );
          })}
        <label style={{ display: "grid", gap: 8, marginTop: 16 }}>
          Пояснение для кандидата
          <textarea defaultValue="Хочу лучше понять, как вы проверяли результат фикса" />
        </label>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <Button
            type="button"
            onClick={() => {
              const store = readStore();
              writeStore({
                ...store,
                followUpRequests: {
                  ...store.followUpRequests,
                  [candidate.id]: {
                    requirementIds: selectedReqs,
                    explanation: "доп. ответ",
                    at: new Date().toLocaleString("ru-RU"),
                  },
                },
              });
              appendDecision(candidate.id, "Запрошен доп. ответ", comment);
              refreshHistory();
              toast("Письмо с запросом доп. ответа отправлено");
              setFollowUpOpen(false);
            }}
          >
            Отправить
          </Button>
        </div>
      </Modal>

      <Modal open={exportOpen} title="Экспорт" onClose={() => setExportOpen(false)}>
        <span className="pilot-badge">Пилот</span>
        <p style={{ marginTop: 12 }}>Предпросмотр карточки для Huntflow.</p>
        <AiNote label="Система предлагает" title={candidate.systemRecommendation}>
          <p style={{ fontSize: 13 }}>
            Обязательные {candidate.mandatoryCovered.confirmed}/{candidate.mandatoryCovered.total}
          </p>
        </AiNote>
        {lastDecision ? (
          <HumanNote label={`Решение: ${lastDecision.author}, ${lastDecision.at}`}>
            {lastDecision.kind}
          </HumanNote>
        ) : null}
        <div className="form-actions" style={{ marginTop: 16 }}>
          <Button type="button" onClick={() => window.print()}>
            Скачать PDF
          </Button>
          <Button type="button" variant="secondary" onClick={() => toast("В демо Huntflow не подключён")}>
            Отправить в Huntflow
          </Button>
        </div>
      </Modal>

      <ToastStack messages={toasts} />
    </AppShell>
  );
}
