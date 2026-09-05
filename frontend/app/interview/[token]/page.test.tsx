import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InterviewPage from "./page";

const CONSENT_INFO = {
  interview_id: "int-demo",
  status: "created" as const,
  vacancy_title: "Backend-разработчик",
  questions_total: 6,
  estimated_duration_min: { min: 25, max: 40 },
};

const MIC_AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => body,
    }),
  );
}

function fakeTrack(kind: "audio" | "video", deviceId: string) {
  return {
    kind,
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
  } as unknown as MediaStreamTrack;
}

function fakeStream(tracks: MediaStreamTrack[]) {
  const list = [...tracks];
  return {
    getTracks: () => list,
    getVideoTracks: () => list.filter((track) => track.kind === "video"),
    getAudioTracks: () => list.filter((track) => track.kind === "audio"),
    addTrack: (track: MediaStreamTrack) => {
      list.push(track);
    },
    removeTrack: (track: MediaStreamTrack) => {
      const index = list.indexOf(track);
      if (index >= 0) list.splice(index, 1);
    },
  } as unknown as MediaStream;
}

function getUserMediaMock() {
  return navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
}

describe("InterviewPage", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the consent screen first and gates progression behind an explicit click", async () => {
    mockFetchOnce(CONSENT_INFO);
    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);

    expect(await screen.findByRole("heading", { name: /перед началом интервью/i })).toBeInTheDocument();
    expect(screen.getByText(/backend-разработчик/i)).toBeInTheDocument();
    expect(screen.getByText(/25–40 минут/)).toBeInTheDocument();
    // Device-check не должен запрашивать доступ, пока кандидат явно не нажал кнопку разрешения.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("requests only the microphone until the candidate turns the camera on", async () => {
    mockFetchOnce(CONSENT_INFO);
    getUserMediaMock().mockImplementation((constraints: MediaStreamConstraints) => {
      if (constraints.audio) {
        return Promise.resolve(fakeStream([fakeTrack("audio", "mic-1")]));
      }
      if (constraints.video) {
        return Promise.resolve(fakeStream([fakeTrack("video", "cam-1")]));
      }
      return Promise.reject(new Error("unexpected constraints"));
    });

    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);

    fireEvent.click(await screen.findByRole("button", { name: /разрешить микрофон/i }));

    await waitFor(() => expect(getUserMediaMock()).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock()).toHaveBeenCalledWith({ audio: MIC_AUDIO });
    expect(getUserMediaMock()).not.toHaveBeenCalledWith({ video: true });
    expect(await screen.findByText(/микрофон готов/i)).toBeInTheDocument();
    expect(screen.getByText(/камера выключена — это нормально/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать интервью/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /включить камеру/i }));

    await waitFor(() => expect(getUserMediaMock()).toHaveBeenCalledTimes(2));
    expect(getUserMediaMock()).toHaveBeenNthCalledWith(2, { video: true });
    expect(await screen.findByText(/микрофон и камера готовы/i)).toBeInTheDocument();
  });

  it("lets the candidate proceed when the camera is denied but the microphone works", async () => {
    mockFetchOnce(CONSENT_INFO);
    getUserMediaMock().mockImplementation((constraints: MediaStreamConstraints) => {
      if (constraints.video) {
        return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      }
      return Promise.resolve(fakeStream([fakeTrack("audio", "mic-1")]));
    });

    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);

    fireEvent.click(await screen.findByRole("button", { name: /разрешить микрофон/i }));

    await waitFor(() => expect(getUserMediaMock()).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock()).toHaveBeenCalledWith({ audio: MIC_AUDIO });
    expect(await screen.findByText(/микрофон готов/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать интервью/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /включить камеру/i }));

    await waitFor(() => expect(getUserMediaMock()).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/камеру включить не получилось|камера не включена/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /начать интервью/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/нет доступа к микрофону/i)).not.toBeInTheDocument();
  });

  it("blocks progression when the microphone is denied", async () => {
    mockFetchOnce(CONSENT_INFO);
    getUserMediaMock().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));

    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);

    fireEvent.click(await screen.findByRole("button", { name: /разрешить микрофон/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/нет доступа к микрофону/i);
    expect(screen.queryByRole("button", { name: /начать интервью/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/микрофон готов/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /запросить микрофон снова/i })).toBeInTheDocument();
  });

  it("shows an already-completed screen instead of consent when the interview is done", async () => {
    mockFetchOnce({ ...CONSENT_INFO, status: "completed" });
    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token-completed" }) });
    render(ui);

    expect(await screen.findByText(/уже пройдено/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /разрешить микрофон/i })).not.toBeInTheDocument();
  });

  it("shows an invalid-link message for an unknown token", async () => {
    mockFetchOnce({ detail: "interview not found" }, 404);
    const ui = await InterviewPage({ params: Promise.resolve({ token: "bogus" }) });
    render(ui);

    expect(await screen.findByRole("alert")).toHaveTextContent(/ссылка недействительна/i);
  });
});
