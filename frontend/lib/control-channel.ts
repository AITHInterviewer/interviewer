/**
 * Control-канал (T010) — единственная точка входа кандидатского UI в backend (FR-009).
 * WS-клиент + client-side reducer, состояния — см.
 * specs/004-candidate-interview-flow/data-model.md, "Client-side interview state", и
 * contracts/control-channel.md за форматом сообщений.
 *
 * Держит соединение открытым весь сеанс интервью, параллельно с LiveKit (не переоткрывается
 * при подключении LiveKit — см. spec.md, "Механизм доставки событий").
 */

import { backendWsUrl } from "@/lib/api";

export type ControlEventType = "question" | "checkin" | "adaptive_question" | "transition" | "completed" | "reconnect_status";

export type InputFormat = "none" | "text" | "code" | null;

export type ControlEvent = {
  type: ControlEventType;
  question_id: string | null;
  text: string | null;
  input_format: InputFormat;
  code_language?: string | null;
  ts: string;
  // Только у type="question" (роадмап прогресса, US2) — checkin/adaptive_question их не
  // несут, это уточнения в рамках текущего вопроса, не отдельный шаг роадмапа.
  question_index?: number | null;
  questions_total?: number | null;
};

export type CandidateInput = {
  type: "candidate_input";
  question_id: string;
  input_format: Exclude<InputFormat, "none" | null>;
  content: string;
};

export type ChannelState =
  | { status: "connecting" }
  | { status: "question_active"; event: ControlEvent }
  | { status: "reconnecting"; lastEvent: ControlEvent | null }
  | { status: "completed"; event: ControlEvent }
  | { status: "closed"; code: number };

type Listener = (state: ChannelState) => void;

/** Коды закрытия из contracts/control-channel.md — не переподключаемся на них. */
const TERMINAL_CLOSE_CODES = new Set([1000, 4401, 4409]);

export class ControlChannel {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private state: ChannelState = { status: "connecting" };
  private lastEvent: ControlEvent | null = null;
  private closedByCaller = false;

  constructor(private readonly accessToken: string) {}

  connect(): void {
    this.closedByCaller = false;
    this.socket = new WebSocket(backendWsUrl(`/ws/interview/${this.accessToken}`));

    this.socket.onmessage = (message) => {
      const event = JSON.parse(message.data as string) as ControlEvent;
      this.lastEvent = event;
      this.setState(
        event.type === "completed" ? { status: "completed", event } : { status: "question_active", event },
      );
    };

    this.socket.onclose = (closeEvent) => {
      if (this.closedByCaller || TERMINAL_CLOSE_CODES.has(closeEvent.code)) {
        this.setState({ status: "closed", code: closeEvent.code });
        return;
      }
      // Обрыв связи — не переигрываем пропущенные ControlEvent задним числом (contracts/
      // control-channel.md), просто показываем статус и повторяем handshake.
      this.setState({ status: "reconnecting", lastEvent: this.lastEvent });
      this.connect();
    };
  }

  /** Явный ввод кандидата для input_format != none (contracts/control-channel.md). Голосовой
   * ответ и запись ответа НЕ идут через этот канал — см. lib/livekit-client.ts / answer-upload. */
  sendCandidateInput(message: Omit<CandidateInput, "type">): void {
    this.socket?.send(JSON.stringify({ type: "candidate_input", ...message } satisfies CandidateInput));
  }

  close(): void {
    this.closedByCaller = true;
    this.socket?.close();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(state: ChannelState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
