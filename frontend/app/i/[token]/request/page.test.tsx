import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ token: "invite-token" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCandidateInterview: vi.fn(),
  };
});

import { fetchCandidateInterview } from "@/lib/api";
import RequestPage from "./page";

describe("RequestPage", () => {
  beforeEach(() => {
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "completed",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "submitted",
      consented: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a local note and does not promise delivery to a recruiter", async () => {
    render(<RequestPage />);

    expect(await screen.findByText(/черновик заметки/i)).toBeInTheDocument();
    expect(
      screen.getByText(/текст сохранится только в этом браузере\. рекрутер его не получит/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Нужно уточнить время" } });
    fireEvent.click(screen.getByRole("button", { name: /сохранить заметку/i }));

    expect(screen.getByText(/сохранено в этом браузере/i)).toBeInTheDocument();
    expect(screen.queryByText(/рекрутер получит/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/отправки на сервер ещё нет/i)).not.toBeInTheDocument();
  });

  it("restores the saved note after remount", async () => {
    const { unmount } = render(<RequestPage />);

    fireEvent.change(await screen.findByRole("textbox"), {
      target: { value: "Черновик после перезагрузки" },
    });
    fireEvent.click(screen.getByRole("button", { name: /сохранить заметку/i }));
    unmount();

    render(<RequestPage />);

    expect(await screen.findByRole("textbox")).toHaveValue("Черновик после перезагрузки");
  });

  it("keeps the typed text and shows an error when localStorage cannot save", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    render(<RequestPage />);

    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Не потерять текст" } });
    fireEvent.click(screen.getByRole("button", { name: /сохранить заметку/i }));

    expect(screen.getByText(/не удалось сохранить заметку в этом браузере/i)).toBeInTheDocument();
    expect(screen.queryByText(/сохранено в этом браузере/i)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Не потерять текст");
    setItem.mockRestore();
  });

  it("does not claim the text was copied when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });
    render(<RequestPage />);

    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Скопировать это" } });
    fireEvent.click(screen.getByRole("button", { name: /скопировать текст/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Скопировать это"));
    expect(screen.queryByText(/текст скопирован/i)).not.toBeInTheDocument();
    expect(screen.getByText(/не удалось скопировать/i)).toBeInTheDocument();
  });

  it("asks for text instead of leaving save without explanation", async () => {
    render(<RequestPage />);

    fireEvent.click(await screen.findByRole("button", { name: /сохранить заметку/i }));

    expect(screen.getByText(/напишите текст заметки/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /сохранить заметку/i })).toBeEnabled();
  });
});
