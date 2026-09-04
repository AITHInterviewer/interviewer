import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ControlChannel, type ChannelState } from "@/lib/control-channel";

/** Минимальный фейк WebSocket — довольно для проверки reducer'а `ControlChannel`, не
 * гоняем настоящую сеть/сервер. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.({ code: 1000 });
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose(code: number): void {
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ControlChannel", () => {
  it("переходит в question_active по приходу ControlEvent", () => {
    const channel = new ControlChannel("tok");
    const states: ChannelState[] = [];
    channel.subscribe((state) => states.push(state));
    channel.connect();

    FakeWebSocket.instances[0].emitMessage({
      type: "question",
      question_id: "q1",
      text: "Расскажите про индексы",
      input_format: "none",
      ts: "2026-09-04T10:00:00Z",
    });

    expect(states.at(-1)).toEqual({
      status: "question_active",
      event: {
        type: "question",
        question_id: "q1",
        text: "Расскажите про индексы",
        input_format: "none",
        ts: "2026-09-04T10:00:00Z",
      },
    });
  });

  it("переходит в completed и не переподключается на code=1000", () => {
    const channel = new ControlChannel("tok");
    const states: ChannelState[] = [];
    channel.subscribe((state) => states.push(state));
    channel.connect();

    FakeWebSocket.instances[0].emitMessage({
      type: "completed",
      question_id: null,
      text: "Спасибо, ответы отправлены на обработку",
      input_format: null,
      ts: "2026-09-04T10:20:00Z",
    });
    FakeWebSocket.instances[0].emitClose(1000);

    expect(states.at(-1)?.status).toBe("closed");
    expect(FakeWebSocket.instances).toHaveLength(1); // не переподключился
  });

  it("аномальный разрыв (не 1000/4401/4409) переходит в reconnecting и переподключается", () => {
    const channel = new ControlChannel("tok");
    const states: ChannelState[] = [];
    channel.subscribe((state) => states.push(state));
    channel.connect();

    FakeWebSocket.instances[0].emitClose(1006);

    expect(states.some((s) => s.status === "reconnecting")).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(2); // повторил handshake
  });

  it("4401/4409 — терминальное закрытие, без переподключения", () => {
    const channel = new ControlChannel("tok");
    const states: ChannelState[] = [];
    channel.subscribe((state) => states.push(state));
    channel.connect();

    FakeWebSocket.instances[0].emitClose(4409);

    expect(states.at(-1)).toEqual({ status: "closed", code: 4409 });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("sendCandidateInput отправляет candidate_input с указанными полями", () => {
    const channel = new ControlChannel("tok");
    channel.connect();

    channel.sendCandidateInput({ question_id: "q5", input_format: "code", content: "def f(): ..." });

    const sent = JSON.parse(FakeWebSocket.instances[0].sent[0]);
    expect(sent).toEqual({
      type: "candidate_input",
      question_id: "q5",
      input_format: "code",
      content: "def f(): ...",
    });
  });
});
