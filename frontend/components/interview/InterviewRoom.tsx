"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { ControlChannel, type ChannelState } from "@/lib/control-channel";
import { LiveKitSession, type AgentPresence } from "@/lib/livekit-client";

type LiveKitTokenResponse = { token: string; room_name: string; ws_url: string; expires_at: string };

/**
 * US2/US3 (specs/004-candidate-interview-flow) — видеозвонок-подобный экран интервью.
 * Единственные источники того, что показывать: `ControlChannel` (текст вопроса/фаза,
 * FR-008/FR-009/FR-011 — никакой локальной логики переходов здесь) и `LiveKitSession`
 * (только присутствие/озвучка агента, FR-012 — медиа отдельно от control-трафика).
 *
 * Answer-upload (`MediaRecorder` по вопросам) и live_coding-редактор — не реализованы в
 * этой итерации (см. tasks.md, T020/T021, T033-T036) — вакансия/вопросы для первого
 * сквозного прогона захардкожены на стороне live-agent, все вопросы формата `voice`.
 */
export function InterviewRoom({ sessionId, stream }: { sessionId: string; stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [channelState, setChannelState] = useState<ChannelState>({ status: "connecting" });
  const [agentPresence, setAgentPresence] = useState<AgentPresence>("absent");
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    let cancelled = false;
    const channel = new ControlChannel(sessionId);
    const liveKit = new LiveKitSession();
    let unsubscribePresence: (() => void) | null = null;
    let unsubscribeSpeaking: (() => void) | null = null;

    const unsubscribeChannel = channel.subscribe(setChannelState);
    channel.connect();

    apiFetch<LiveKitTokenResponse>(`/interview/${sessionId}/livekit-token`, { method: "POST" })
      .then((tokenResponse) => {
        if (cancelled) return undefined;
        return liveKit.connect(tokenResponse.ws_url, tokenResponse.token, stream);
      })
      .then(() => {
        if (cancelled) return;
        unsubscribePresence = liveKit.onAgentPresenceChange(setAgentPresence);
        unsubscribeSpeaking = liveKit.onLocalSpeakingChange(setCandidateSpeaking);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось подключиться к звонку");
      });

    return () => {
      cancelled = true;
      unsubscribeChannel();
      unsubscribePresence?.();
      unsubscribeSpeaking?.();
      channel.close();
      liveKit.disconnect();
    };
  }, [sessionId, stream]);

  const questionText =
    channelState.status === "question_active" || channelState.status === "completed"
      ? channelState.event.text
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="flex min-h-[220px] flex-col justify-center gap-4 rounded-xl border bg-card p-6">
          <p className="text-xl font-medium leading-snug">{questionText ?? "Подключаемся к интервью…"}</p>
          <StatusLine channelState={channelState} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-3">
          <div
            className={`aspect-video overflow-hidden rounded-xl border bg-muted/30 ${
              candidateSpeaking ? "border-primary" : ""
            }`}
          >
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
          <div
            className={`flex aspect-video items-center justify-center rounded-xl border text-sm ${
              agentPresence === "speaking" ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {agentPresence === "speaking" ? "Интервьюер говорит…" : agentPresence === "present" ? "Интервьюер" : "Ожидаем интервьюера…"}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusLine({ channelState }: { channelState: ChannelState }) {
  switch (channelState.status) {
    case "connecting":
      return <p className="text-sm text-muted-foreground">Подключаемся…</p>;
    case "reconnecting":
      return <p className="text-sm text-destructive">Потеряна связь — переподключаемся…</p>;
    case "completed":
      return <p className="text-sm text-muted-foreground">Интервью завершено. Спасибо, ответы отправлены на обработку.</p>;
    case "closed":
      return <p className="text-sm text-muted-foreground">Соединение закрыто.</p>;
    case "question_active":
      return <p className="text-sm text-muted-foreground">Слушаем вас — говорите свободно.</p>;
  }
}
