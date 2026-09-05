import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({ from: null as string | null }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/vacancies/v1/approve",
  useParams: () => ({ id: "v1" }),
  useSearchParams: () => new URLSearchParams(search.from ? { from: search.from } : undefined),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadVacancy: vi.fn(),
    approveManagedVacancy: vi.fn(),
    requestManagedVacancyChanges: vi.fn(),
  };
});

import { approveManagedVacancy, loadLanding, loadVacancy } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import VacancyApprovePage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <VacancyApprovePage />
    </ThemeProvider>,
  );
}

const question = {
  id: "q1",
  vacancy_id: "v1",
  interview_id: null,
  text: "Explain GIL",
  order: 0,
  skill_tag: ["python"],
  intent: "assess",
  reference_answer: "...",
  format: "voice" as const,
  role: "assessment" as const,
  difficulty: "baseline" as const,
  estimated_duration_sec: 120,
  stimulus: null,
  source: "base_generated" as const,
};

const baseVacancy = {
  id: "v1",
  recruiter_id: "r1",
  title: "Backend Developer",
  description: "Build things",
  grade: "middle",
  required_skills: ["python", "sql"],
  nice_to_have_skills: [],
  status: "calibration" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [question],
};

function recruiterLanding() {
  return {
    session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
    landing: {
      roles: ["recruiter"],
      default_path: "/vacancies",
      available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
      available_actions: [],
    },
  };
}

function expertLanding() {
  return {
    session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
    landing: {
      roles: ["expert"],
      default_path: "/vacancies",
      available_areas: [{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }],
      available_actions: ["action.questions.edit"],
    },
  };
}

describe("VacancyApprovePage", () => {
  beforeEach(() => {
    search.from = null;
    vi.mocked(loadVacancy).mockResolvedValue(baseVacancy);
    vi.mocked(approveManagedVacancy).mockReset();
  });

  it("shows view-mode copy and the kit for a recruiter, not a blank empty state", async () => {
    search.from = "recruiter";
    vi.mocked(loadLanding).mockResolvedValue(recruiterLanding());

    renderPage();

    expect(await screen.findByText(/режим просмотра\. утверждение доступно эксперту/i)).toBeInTheDocument();
    expect(screen.getByText(/вопросов в комплекте: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/обязательные навыки: python, sql/i)).toBeInTheDocument();
    expect(screen.getAllByText(/backend developer/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/здесь нечего утверждать/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /одобрить версию/i })).not.toBeInTheDocument();
  });

  it("shows an empty-kit state without hiding the vacancy", async () => {
    vi.mocked(loadLanding).mockResolvedValue(expertLanding());
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, questions: [] });

    renderPage();

    expect(await screen.findByText(/комплект ещё не собран/i)).toBeInTheDocument();
    expect(screen.getByText(/вопросов в комплекте: 0/i)).toBeInTheDocument();
    expect(screen.getAllByText(/backend developer/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/здесь нечего утверждать/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /одобрить версию/i })).not.toBeInTheDocument();
  });

  it("shows already-approved copy and still shows the kit", async () => {
    vi.mocked(loadLanding).mockResolvedValue(expertLanding());
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "approved" });

    renderPage();

    expect(await screen.findByText(/версия уже одобрена/i)).toBeInTheDocument();
    expect(screen.getByText(/вопросов в комплекте: 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/здесь нечего утверждать/i)).not.toBeInTheDocument();
  });

  it("tells the expert that invites stay closed after approve", async () => {
    vi.mocked(loadLanding).mockResolvedValue(expertLanding());
    vi.mocked(approveManagedVacancy).mockResolvedValue({ ...baseVacancy, status: "approved" });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /одобрить версию/i }));

    await waitFor(() => expect(approveManagedVacancy).toHaveBeenCalledWith("v1"));
    expect(
      await screen.findByText(
        /версия одобрена\. приглашения пока недоступны: рекрутер должен активировать вакансию/i,
      ),
    ).toBeInTheDocument();
  });
});
