import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ token: "invite-token", id: "extra-1" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCandidateInterview: vi.fn(),
    fetchCandidateExtra: vi.fn(),
  };
});

import { fetchCandidateExtra, fetchCandidateInterview } from "@/lib/api";
import ExtraPage from "./page";

describe("ExtraPage", () => {
  beforeEach(() => {
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "completed",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "submitted",
      consented: true,
      deadline: "2025-01-10T18:00:00Z",
    });
    vi.mocked(fetchCandidateExtra).mockResolvedValue({
      id: "extra-1",
      status: "requested",
      extra_token: "extra-token",
    });
  });

  it("does not inherit the invitation deadline as the written-answer deadline", async () => {
    render(<ExtraPage />);

    expect(
      await screen.findByText(
        /текст вопроса здесь недоступен\. используйте вопрос из сообщения рекрутера; если его нет, уточните перед отправкой/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/срок письменного ответа в этой ссылке не указан/i)).toBeInTheDocument();
    expect(screen.queryByText(/срок:\s*10 января/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/10 января/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/в приглашении не указана/i)).not.toBeInTheDocument();
  });
});
