import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewRoom } from "@/components/interview/InterviewRoom";

const { channelInstances, liveKitInstances } = vi.hoisted(() => ({
  channelInstances: [] as Array<{
    listener: ((state: unknown) => void) | null;
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
  liveKitInstances: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onAgentPresenceChange: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@/lib/control-channel", () => ({
  ControlChannel: vi.fn().mockImplementation(function ControlChannelMock() {
    const instance = {
      listener: null as ((state: unknown) => void) | null,
      subscribe: vi.fn((listener: (state: unknown) => void) => {
        instance.listener = listener;
        listener({ status: "connecting" });
        return () => {};
      }),
      subscribeSubtitles: vi.fn(() => () => {}),
      connect: vi.fn(),
      close: vi.fn(),
      sendCandidateInput: vi.fn(),
      sendNextQuestion: vi.fn(),
    };
    channelInstances.push(instance);
    return instance;
  }),
}));

vi.mock("@/lib/livekit-client", () => ({
  LiveKitSession: vi.fn().mockImplementation(function LiveKitSessionMock() {
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      onAgentPresenceChange: vi.fn().mockReturnValue(() => {}),
      switchDevice: vi.fn().mockResolvedValue(undefined),
      getLocalVideoTrack: vi.fn().mockReturnValue(null),
      getLocalAudioTrack: vi.fn().mockReturnValue(null),
    };
    liveKitInstances.push(instance);
    return instance;
  }),
}));

// US4 (live_coding) — InterviewRoom здесь проверяется только на то, что переключается в
// код-режим и передаёт правильные пропсы; сам редактор/CodeMirror — предмет
// CodeEditorPanel.test.tsx, не дублируем это тестирование здесь.
vi.mock("@/components/interview/CodeEditorPanel", () => ({
  CodeEditorPanel: (props: { questionId: string; questionText: string; language: string | null }) => (
    <div data-testid="code-editor-panel" data-question-id={props.questionId} data-language={props.language ?? ""}>
      {props.questionText}
    </div>
  ),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    token: "jwt",
    room_name: "room-1",
    ws_url: "ws://localhost:3907",
    expires_at: "2026-09-04T12:00:00Z",
  }),
  resolveLiveKitWsUrl: (wsUrl: string) => `ws://${window.location.host}${new URL(wsUrl).pathname}`,
}));

const fakeStream = { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } as unknown as MediaStream;

describe("InterviewRoom", () => {
  beforeEach(() => {
    channelInstances.length = 0;
    liveKitInstances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("подключает control-канал и LiveKit при монтировании", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);

    await waitFor(() => expect(channelInstances).toHaveLength(1));
    expect(channelInstances[0].connect).toHaveBeenCalled();
    await waitFor(() =>
      expect(liveKitInstances[0].connect).toHaveBeenCalledWith(`ws://${window.location.host}/`, "jwt", fakeStream, undefined),
    );
  });

  it("показывает текст вопроса по приходу ControlEvent, без локальной логики перехода", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);
    await waitFor(() => expect(channelInstances).toHaveLength(1));

    channelInstances[0].listener?.({
      status: "question_active",
      event: { type: "question", question_id: "q1", text: "Расскажите про индексы", input_format: "none", ts: "" },
    });

    expect(await screen.findByText("Расскажите про индексы")).toBeInTheDocument();
  });

  it("наводящий вопрос от LLM не стирает основной вопрос — показывает оба", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);
    await waitFor(() => expect(channelInstances).toHaveLength(1));

    channelInstances[0].listener?.({
      status: "question_active",
      event: { type: "question", question_id: "q1", text: "Расскажите про индексы", input_format: "none", ts: "" },
    });
    expect(await screen.findByText("Расскажите про индексы")).toBeInTheDocument();

    channelInstances[0].listener?.({
      status: "question_active",
      event: {
        type: "adaptive_question",
        question_id: "q1",
        text: "А что насчёт B-tree?",
        input_format: "none",
        ts: "",
      },
    });

    expect(await screen.findByText("А что насчёт B-tree?")).toBeInTheDocument();
    expect(screen.getByText("Расскажите про индексы")).toBeInTheDocument();
  });

  it("сразу показывает вопрос с бэка (initialQuestionText), до первого ControlEvent", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} initialQuestionText="Сохранённый вопрос" />);

    expect(await screen.findByText("Сохранённый вопрос")).toBeInTheDocument();
  });

  it("переключается в редактор кода на ControlEvent с input_format=code (US4)", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);
    await waitFor(() => expect(channelInstances).toHaveLength(1));

    channelInstances[0].listener?.({
      status: "question_active",
      event: {
        type: "question",
        question_id: "q5",
        text: "Напишите функцию, которая переворачивает строку.",
        input_format: "code",
        code_language: null,
        ts: "",
      },
    });

    const panel = await screen.findByTestId("code-editor-panel");
    expect(panel).toHaveTextContent("Напишите функцию, которая переворачивает строку.");
    expect(panel).toHaveAttribute("data-question-id", "q5");
    expect(panel).toHaveAttribute("data-language", "");
    // Обычная карточка вопроса (голосовой режим) в код-режиме не рендерится.
    expect(screen.queryByText("Подключаемся к интервью…")).not.toBeInTheDocument();
  });

  it("показывает финальный экран на completed", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);
    await waitFor(() => expect(channelInstances).toHaveLength(1));

    channelInstances[0].listener?.({
      status: "completed",
      event: { type: "completed", question_id: null, text: "Спасибо!", input_format: null, ts: "" },
    });

    expect(await screen.findByRole("heading", { name: /поздравляем с прохождением интервью/i })).toBeInTheDocument();
  });
});
