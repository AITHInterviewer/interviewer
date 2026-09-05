import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ token: "invite-token" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCandidateInterview: vi.fn(),
    postCandidateProgress: vi.fn().mockResolvedValue({ product_state: "device_checked" }),
  };
});

import { fetchCandidateInterview, postCandidateProgress } from "@/lib/api";
import CheckPage from "./page";

function fakeAudioStream() {
  const track = {
    kind: "audio",
    stop: vi.fn(),
    getSettings: () => ({ deviceId: "mic-1" }),
  };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

function getUserMediaMock() {
  return navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
}

describe("CheckPage", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.push.mockReset();
    vi.mocked(postCandidateProgress).mockClear();
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "created",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "consented",
      consented: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not treat unchecked devices as passed and asks for the microphone first", async () => {
    render(<CheckPage />);

    expect(await screen.findByText(/для голосовых ответов нужен микрофон/i)).toBeInTheDocument();
    expect(screen.getByText(/камера не обязательна/i)).toBeInTheDocument();
    expect(screen.getByText(/камеру можно не включать/i)).toBeInTheDocument();
    expect(screen.queryByText(/микрофон разрешён/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/если понадобится/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к правилам/i })).toBeDisabled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("checks the microphone with audio-only getUserMedia and then allows continue", async () => {
    getUserMediaMock().mockResolvedValue(fakeAudioStream());
    render(<CheckPage />);

    fireEvent.click(await screen.findByRole("button", { name: /проверить микрофон/i }));

    await waitFor(() => expect(getUserMediaMock()).toHaveBeenCalledWith({ audio: true }));
    expect(getUserMediaMock()).not.toHaveBeenCalledWith(expect.objectContaining({ video: true }));
    expect(await screen.findByText(/микрофон разрешён/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к правилам/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /дальше, к правилам/i }));

    await waitFor(() =>
      expect(postCandidateProgress).toHaveBeenCalledWith("invite-token", "device_checked"),
    );
    expect(nav.push).toHaveBeenCalledWith("/i/invite-token/rules");
  });

  it("does not let the candidate continue when the microphone is denied", async () => {
    getUserMediaMock().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    render(<CheckPage />);

    fireEvent.click(await screen.findByRole("button", { name: /проверить микрофон/i }));

    expect(await screen.findByText(/доступ к микрофону запрещён/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к правилам/i })).toBeDisabled();
    expect(postCandidateProgress).not.toHaveBeenCalled();
  });

  it("explains a missing microphone instead of showing a fake success tick", async () => {
    getUserMediaMock().mockRejectedValue(new DOMException("Requested device not found", "NotFoundError"));
    render(<CheckPage />);

    fireEvent.click(await screen.findByRole("button", { name: /проверить микрофон/i }));

    expect(await screen.findByText(/микрофон не найден/i)).toBeInTheDocument();
    expect(screen.queryByText(/микрофон разрешён/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к правилам/i })).toBeDisabled();
  });

  it("explains a busy microphone", async () => {
    getUserMediaMock().mockRejectedValue(new DOMException("Could not start audio source", "NotReadableError"));
    render(<CheckPage />);

    fireEvent.click(await screen.findByRole("button", { name: /проверить микрофон/i }));

    expect(await screen.findByText(/уже используется другим приложением/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к правилам/i })).toBeDisabled();
  });
});
