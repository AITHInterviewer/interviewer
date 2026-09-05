import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/vacancies/v1/questions",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadVacancy: vi.fn(),
    approveManagedVacancy: vi.fn(),
    deleteManagedQuestion: vi.fn(),
    addManagedQuestion: vi.fn(),
    updateManagedQuestion: vi.fn(),
  };
});

import { approveManagedVacancy, loadLanding, loadVacancy } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { VacancyQuestionsClient } from "./questions-client";

function renderClient(vacancyId: string) {
  return render(
    <ThemeProvider>
      <VacancyQuestionsClient vacancyId={vacancyId} />
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
  intent: "assess depth",
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
  required_skills: [],
  nice_to_have_skills: [],
  status: "pending_review" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [question],
};

function landingWithEdit() {
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

describe("VacancyQuestionsClient", () => {
  beforeEach(() => {
    vi.mocked(loadVacancy).mockResolvedValue(baseVacancy);
  });

  it("shows the question list read-only when the user cannot edit questions", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });

    renderClient("v1");

    expect(await screen.findByText(/explain gil/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve vacancy/i })).not.toBeInTheDocument();
  });

  it("lets an expert approve the vacancy", async () => {
    vi.mocked(loadLanding).mockResolvedValue(landingWithEdit());
    vi.mocked(approveManagedVacancy).mockResolvedValue({ ...baseVacancy, status: "ready" });

    renderClient("v1");

    const approveButton = await screen.findByRole("button", { name: /approve vacancy/i });
    fireEvent.click(approveButton);

    await waitFor(() => expect(approveManagedVacancy).toHaveBeenCalledWith("v1"));
    await waitFor(() => expect(screen.getByText(/vacancy approved/i)).toBeInTheDocument());
  });
});
