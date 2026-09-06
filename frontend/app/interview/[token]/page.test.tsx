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

/** Флоу теперь три экрана: согласие → устройства → интервью. Тесты про device-check
 * должны сперва пройти экран согласия — как реальный кандидат. */
async function passConsentScreen() {
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /начать/i }));
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

    expect(await screen.findByRole("heading", { name: /вас пригласили на интервью/i })).toBeInTheDocument();
    expect(screen.getAllByText(/backend-разработчик/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/25–40 минут/)).toBeInTheDocument();
    // Device-check не должен запрашивать доступ, пока кандидат явно не нажал кнопку разрешения.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("requests camera/mic access automatically once the device-check screen mounts, and shows a live preview once granted", async () => {
    mockFetchOnce(CONSENT_INFO);
    const fakeStream = {
      getTracks: () => [],
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    } as unknown as MediaStream;
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(fakeStream);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);
    await passConsentScreen();

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }));
    expect(await screen.findByRole("button", { name: /начать интервью/i })).toBeInTheDocument();
    const preview = document.querySelector("video");
    expect(preview).not.toBeNull();
    expect(preview?.srcObject).toBe(fakeStream);
    playSpy.mockRestore();
  });

  it("blocks progression and offers a retry when camera/mic access is denied", async () => {
    mockFetchOnce(CONSENT_INFO);
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);
    await passConsentScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent(/нет доступа к камере или микрофону/i);
    expect(screen.queryByRole("button", { name: /начать интервью/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /запросить доступ снова/i })).toBeInTheDocument();
  });

  it("shows an already-completed screen instead of consent when the interview is done", async () => {
    mockFetchOnce({ ...CONSENT_INFO, status: "completed" });
    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token-completed" }) });
    render(ui);

    expect(await screen.findByText(/уже пройдено/i)).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("shows an invalid-link message for an unknown token", async () => {
    mockFetchOnce({ detail: "interview not found" }, 404);
    const ui = await InterviewPage({ params: Promise.resolve({ token: "bogus" }) });
    render(ui);

    expect(await screen.findByRole("alert")).toHaveTextContent(/ссылка недействительна/i);
  });
});
