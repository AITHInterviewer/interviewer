import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/vacancies/v1",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadVacancy: vi.fn(),
    loadInterviews: vi.fn(),
    loadAnonymizedStats: vi.fn(),
    generateVacancyQuestions: vi.fn(),
    createManagedInterview: vi.fn(),
    sendManagedVacancyToExpert: vi.fn(),
    activateManagedVacancy: vi.fn(),
    pauseManagedVacancy: vi.fn(),
    resumeManagedVacancy: vi.fn(),
  };
});

import { loadInterviews, loadLanding, loadVacancy } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { VacancyDetailClient } from "./vacancy-detail-client";

function renderClient(vacancyId: string) {
  return render(
    <ThemeProvider>
      <VacancyDetailClient vacancyId={vacancyId} />
    </ThemeProvider>,
  );
}

const baseVacancy = {
  id: "v1",
  recruiter_id: "r1",
  title: "Backend Developer",
  description: "Build things",
  grade: "middle",
  required_skills: ["python"],
  nice_to_have_skills: [],
  status: "draft" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [],
};

describe("VacancyDetailClient", () => {
  beforeEach(() => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });
    vi.mocked(loadVacancy).mockResolvedValue(baseVacancy);
    vi.mocked(loadInterviews).mockResolvedValue({ items: [] });
  });

  it("disables invite until the vacancy is active", async () => {
    renderClient("v1");

    expect(await screen.findByRole("heading", { name: /backend developer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /пригласить кандидата/i })).toBeDisabled();
    expect(
      screen.getByText(/пригласить можно после того, как эксперт одобрит версию/i),
    ).toBeInTheDocument();
  });

  it("enables the invite form once the vacancy is active", async () => {
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "active" });

    renderClient("v1");

    await screen.findByRole("heading", { name: /backend developer/i });
    const invite = screen.getByRole("button", { name: /пригласить кандидата/i });
    expect(invite).not.toBeDisabled();

    // Форма живёт в модалке: до нажатия её на странице нет.
    expect(screen.queryByLabelText(/резюме кандидата/i)).not.toBeInTheDocument();
    fireEvent.click(invite);
    expect(await screen.findByLabelText(/резюме кандидата/i)).not.toBeDisabled();
  });

  it("hides recruiter-only invite for users without the recruiter area", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
      landing: {
        roles: ["expert"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }],
        available_actions: ["action.questions.edit"],
      },
    });

    renderClient("v1");

    await screen.findByRole("heading", { name: /backend developer/i });
    expect(screen.queryByRole("button", { name: /пригласить кандидата/i })).not.toBeInTheDocument();
    // Разделы вакансии живут в сайдбаре: он рисуется вокруг экрана в AppShell.
    expect(screen.getByRole("link", { name: /вопросы/i })).toBeInTheDocument();
  });

  it("does not claim nobody was invited when later-stage interviews exist", async () => {
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "active" });
    vi.mocked(loadInterviews).mockResolvedValue({
      items: [
        {
          id: "i1",
          vacancy_id: "v1",
          candidate_name: "Lida",
          resume_file_url: "",
          access_token: "t",
          status: "completed",
          created_at: "2026-01-01T00:00:00Z",
          product_state: "report_ready",
        },
      ],
    });

    renderClient("v1");

    expect(await screen.findByText("Сейчас в этой стадии никого нет")).toBeInTheDocument();
    expect(screen.queryByText("Никого не пригласили")).not.toBeInTheDocument();
    expect(screen.queryByText("Никого ещё не приглашали")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /открыть lida/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /приостановить/i })).toBeInTheDocument();
  });
});
