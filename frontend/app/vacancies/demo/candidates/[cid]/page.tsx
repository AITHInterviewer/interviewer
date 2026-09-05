"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CaretRight, ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VersionTag } from "@/components/chrome/VersionTag";
import { AiNote, HumanNote } from "@/components/evidence/AiNote";
import { Modal, ToastStack } from "@/components/evidence/Drawer";
import { EvidenceLink } from "@/components/evidence/EvidenceLink";
import { StatusBadge } from "@/components/evidence/StatusBadge";
import { Button } from "@/components/ui/button";
import { buildNav } from "@/lib/nav";
import { getCandidateById } from "@/lib/demo/candidates";
import { getRequirement } from "@/lib/demo/rubric";
import { appendDecision, pushToast, readStore, writeStore } from "@/lib/demo/recruiter-store";
import type { DecisionKind, ReportRequirement } from "@/lib/demo/types";
import { vacancy } from "@/lib/demo/vacancies";

export default function CandidateReportPage() {
  const { landing, loading } = useProtectedLanding();
  const params = useParams<{ cid: string }>();
  const candidate = getCandidateById(params.cid);
  const [mode, setMode] = useState<"generalist" | "technical">("generalist");
  const [selected, setSelected] = useState<ReportRequirement | null>(candidate?.report[0] ?? null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [followUpText, setFollowUpText] = useState("Хочу лучше понять, как вы проверяли результат фикса");
  const [followUpError, setFollowUpError] = useState("");
  const [toasts, setToasts] = useState<string[]>([]);
  const [selectedReqs, setSelectedReqs] = useState<string[]>([]);
  const [history, setHistory] = useState(() => {
    if (typeof window === "undefined" || !getCandidateById(params.cid)) return [];
    return readStore().decisions[params.cid] ?? [];
  });
  const [followUpRequest, setFollowUpRequest] = useState(() => {
    if (typeof window === "undefined" || !getCandidateById(params.cid)) return undefined;
    return readStore().followUpRequests[params.cid];
  });

  function refreshHistory() {
    setHistory(readStore().decisions[candidate!.id] ?? []);
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  const nav = buildNav(landing, { includeDemo: true });

  if (!candidate) {
    return (
      <AppShell nav={nav} title="Отчёт">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Отчёт не найден"
            text="Такого кандидата в демо нет. Вернитесь к доске кандидатов."
            action={
              <Button asChild variant="secondary">
                <Link href="/vacancies/demo/board">К доске</Link>
              </Button>
            }
          />
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
    <AppShell nav={nav} title="Отчёт">
      <main className="workspace report-workspace">
        <PageHeader
          path={`Кандидаты / ${candidate.name}`}
          title="Технический отчёт"
          description={
            <>
              {vacancy.title}, интервью {candidate.durationMin} минут, сессия завершена {candidate.submittedAt}.{" "}
              <span className="demo-jargon">
                <VersionTag demoNote />
              </span>
            </>
          }
          actions={
            <div className="density-switch" aria-label="Плотность отчёта">
              <button type="button" data-active={mode === "generalist"} onClick={() => setMode("generalist")}>
                Кратко
              </button>
              <button type="button" data-active={mode === "technical"} onClick={() => setMode("technical")}>
                Подробно
              </button>
            </div>
          }
        />

        <AiNote label="Система предлагает" title={candidate.systemRecommendation}>
          <p>
            Обязательные требования: {candidate.mandatoryCovered.confirmed} из {candidate.mandatoryCovered.total}.
            {candidate.criticalError ? ` ${candidate.criticalError}.` : ""}
          </p>
          {candidate.systemRecommendation === "Недостаточно данных" ? (
            <p className="status-hint">
              «Недостаточно данных» значит: по обязательным пунктам не хватает источника — цитаты нет в
              транскрипте или вопрос не задавался. Логичный шаг: запросить доп. ответ или принять решение
              человеком.
            </p>
          ) : null}
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
                    <p>{selected.aiSummary}</p>
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
                    <p className="status-hint">Причина: {selected.insufficientReason}</p>
                  ) : null}
                  {selected.followUpText ? (
                    <p className="status-hint">
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
          <section className="stack-list">
            <h2>Ответы по вопросам</h2>
            <p className="muted-copy">
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
              onClick={() => setRejectOpen(true)}
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
        {followUpRequest ? <p>Запрос доп. ответа отправлен кандидату.</p> : null}
      </main>

      <Modal
        open={followUpOpen}
        title="Запросить доп. ответ"
        onClose={() => {
          setFollowUpOpen(false);
          setFollowUpError("");
        }}
      >
        <p className="muted-copy">Один вопрос - выше шанс ответа.</p>
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
        <label>
          Пояснение для кандидата
          <textarea value={followUpText} onChange={(e) => setFollowUpText(e.target.value)} />
        </label>
        {followUpError ? <p className="follow-up-error">{followUpError}</p> : null}
        <div className="form-actions">
          <Button
            type="button"
            onClick={() => {
              if (selectedReqs.length === 0 || followUpText.trim() === "") {
                setFollowUpError("Выберите хотя бы один пункт и напишите пояснение — пустой запрос отправить нельзя.");
                return;
              }
              const store = readStore();
              const request = {
                requirementIds: selectedReqs,
                explanation: followUpText.trim(),
                at: new Date().toLocaleString("ru-RU"),
              };
              writeStore({
                ...store,
                followUpRequests: {
                  ...store.followUpRequests,
                  [candidate.id]: request,
                },
              });
              setFollowUpRequest(request);
              appendDecision(candidate.id, "Запрошен доп. ответ", comment);
              refreshHistory();
              toast("Письмо с запросом доп. ответа отправлено");
              setFollowUpError("");
              setFollowUpOpen(false);
            }}
          >
            Отправить
          </Button>
        </div>
      </Modal>

      <Modal open={exportOpen} title="Экспорт" onClose={() => setExportOpen(false)}>
        <span className="pilot-badge">Пилот</span>
        <p className="pilot-hint">В демо ATS и Huntflow не подключены — это макет карточки.</p>
        <AiNote label="Система предлагает" title={candidate.systemRecommendation}>
          <p>
            Обязательные {candidate.mandatoryCovered.confirmed}/{candidate.mandatoryCovered.total}
          </p>
        </AiNote>
        {lastDecision ? (
          <HumanNote label={`Решение: ${lastDecision.author}, ${lastDecision.at}`}>
            {lastDecision.kind}
          </HumanNote>
        ) : null}
        <div className="form-actions">
          <Button type="button" onClick={() => window.print()}>
            Скачать PDF
          </Button>
          <Button type="button" variant="secondary" onClick={() => toast("В демо Huntflow не подключён")}>
            Отправить в Huntflow
          </Button>
        </div>
      </Modal>

      <Modal open={rejectOpen} title="Не продвигать" onClose={() => setRejectOpen(false)}>
        <p className="muted-copy">
          Кандидат не пойдёт дальше. Решение сохранится в истории. Это действие в демо можно повторить, но
          откатить системно нельзя.
        </p>
        <div className="form-actions">
          <Button
            type="button"
            onClick={() => {
              decide("Не продвигать");
              setRejectOpen(false);
            }}
          >
            Не продвигать
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>

      <ToastStack messages={toasts} />
    </AppShell>
  );
}
