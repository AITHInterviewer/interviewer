import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/vacancies/new",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    createManagedVacancy: vi.fn(),
    generateVacancyQuestions: vi.fn(),
  };
});

import { createManagedVacancy, generateVacancyQuestions, loadLanding } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import NewVacancyPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <NewVacancyPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const created = {
  id: "v1",
  recruiter_id: "r1",
  title: "Backend Developer",
  description: "Build things",
  grade: "middle",
  required_skills: ["python", "sql"],
  nice_to_have_skills: ["docker"],
  status: "extracted" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [
    {
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
    },
  ],
};

describe("NewVacancyPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    vi.mocked(createManagedVacancy).mockReset();
    vi.mocked(generateVacancyQuestions).mockReset();
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });
  });

  it("redirects non-recruiters to their landing default path", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
      landing: {
        roles: ["expert"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }],
        available_actions: ["action.questions.edit"],
      },
    });

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/vacancies"));
  });

  it("creates a vacancy, generates questions and redirects to the vacancy page", async () => {
    vi.mocked(createManagedVacancy).mockResolvedValue(created);
    vi.mocked(generateVacancyQuestions).mockResolvedValue(created);

    renderPage();

    fireEvent.change(await screen.findByLabelText(/название/i), { target: { value: "Backend Developer" } });
    fireEvent.change(screen.getByLabelText(/описание/i), { target: { value: "Build things" } });
    fireEvent.change(screen.getByLabelText(/грейд/i), { target: { value: "middle" } });
    fireEvent.change(screen.getByLabelText(/обязательные навыки/i), { target: { value: "python, sql, docker," } });
    fireEvent.change(screen.getByLabelText(/желательные навыки/i), { target: { value: "docker," } });

    fireEvent.submit(screen.getByRole("button", { name: /создать вакансию/i }).closest("form")!);

    await waitFor(() =>
      expect(createManagedVacancy).toHaveBeenCalledWith({
        title: "Backend Developer",
        description: "Build things",
        grade: "middle",
        requiredSkills: ["python", "sql", "docker"],
        niceToHaveSkills: ["docker"],
        expertId: null,
        hiringManagerId: null,
      }),
    );
    await waitFor(() => expect(generateVacancyQuestions).toHaveBeenCalledWith("v1"));
    expect(await screen.findByText(/backend developer.*создана, вопросы собраны/i)).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vacancies/v1"));
  });

  it("sends the recruiter to the vacancy page with a toast when question generation fails", async () => {
    vi.mocked(createManagedVacancy).mockResolvedValue(created);
    vi.mocked(generateVacancyQuestions).mockRejectedValueOnce(new Error("generation failed"));

    renderPage();

    fireEvent.change(await screen.findByLabelText(/название/i), { target: { value: "Backend Developer" } });
    fireEvent.change(screen.getByLabelText(/описание/i), { target: { value: "Build things" } });
    fireEvent.change(screen.getByLabelText(/грейд/i), { target: { value: "middle" } });
    fireEvent.change(screen.getByLabelText(/обязательные навыки/i), { target: { value: "python, sql, docker," } });
    fireEvent.change(screen.getByLabelText(/желательные навыки/i), { target: { value: "docker," } });

    fireEvent.submit(screen.getByRole("button", { name: /создать вакансию/i }).closest("form")!);

    expect(
      await screen.findByText(/backend developer.*создана, но вопросы не собрались/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vacancies/v1"));
    expect(createManagedVacancy).toHaveBeenCalledTimes(1);
    expect(generateVacancyQuestions).toHaveBeenCalledTimes(1);
  });
});
