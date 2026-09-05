import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    generateVacancyQuestions: vi.fn(),
    createManagedInterview: vi.fn(),
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

  it("shows the vacancy overview and a disabled interview form while the vacancy is not ready", async () => {
    renderClient("v1");

    expect(await screen.findByRole("heading", { name: /backend developer/i })).toBeInTheDocument();
    expect(screen.getByText(/no interviews yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create interview/i })).toBeDisabled();
  });

  it("enables the create-interview form once the vacancy is ready", async () => {
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "ready" });

    renderClient("v1");

    await screen.findByRole("heading", { name: /backend developer/i });
    expect(screen.getByLabelText(/resume file/i)).not.toBeDisabled();
  });

  it("hides recruiter-only actions for users without the recruiter area", async () => {
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
    expect(screen.queryByRole("button", { name: /generate questions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /questions/i })).toBeInTheDocument();
  });
});
