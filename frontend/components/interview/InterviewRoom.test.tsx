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
      connect: vi.fn(),
      close: vi.fn(),
      sendCandidateInput: vi.fn(),
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
    };
    liveKitInstances.push(instance);
    return instance;
  }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    token: "jwt",
    room_name: "room-1",
    ws_url: "ws://localhost:3907",
    expires_at: "2026-09-04T12:00:00Z",
  }),
}));

const fakeStream = { getTracks: () => [] } as unknown as MediaStream;

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
    await waitFor(() => expect(liveKitInstances[0].connect).toHaveBeenCalledWith("ws://localhost:3907", "jwt", fakeStream));
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

  it("показывает финальный экран на completed", async () => {
    render(<InterviewRoom sessionId="tok" stream={fakeStream} />);
    await waitFor(() => expect(channelInstances).toHaveLength(1));

    channelInstances[0].listener?.({
      status: "completed",
      event: { type: "completed", question_id: null, text: "Спасибо!", input_format: null, ts: "" },
    });

    expect(await screen.findByText(/интервью завершено/i)).toBeInTheDocument();
  });
});
