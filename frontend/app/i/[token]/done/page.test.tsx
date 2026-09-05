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
import DonePage from "./page";

describe("DonePage", () => {
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

  it("does not offer a recruiter message channel and keeps the transcript", async () => {
    render(<DonePage />);

    expect(await screen.findByRole("heading", { name: /ответы приняты/i })).toBeInTheDocument();
    expect(
      screen.getByText(/по вопросам свяжитесь с рекрутером тем способом, которым получили приглашение/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /расшифровка/i })).toHaveAttribute(
      "href",
      "/i/invite-token/transcript",
    );
    expect(screen.queryByRole("link", { name: /написать рекрутеру/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /к выбору роли/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /подготовка к интервью/i })).not.toBeInTheDocument();
  });

  it("does not show the invitation deadline as a recruiter reply date", async () => {
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "completed",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "submitted",
      consented: true,
      deadline: "2026-09-12",
    });
    render(<DonePage />);

    expect(await screen.findByRole("heading", { name: /ответы приняты/i })).toBeInTheDocument();
    expect(screen.queryByText(/срок:\s*12 сентября/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/12 сентября/i)).not.toBeInTheDocument();
  });
});
