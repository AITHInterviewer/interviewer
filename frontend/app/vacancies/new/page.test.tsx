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
  };
});

import { createManagedVacancy, loadLanding } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import NewVacancyPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <NewVacancyPage />
    </ThemeProvider>,
  );
}

describe("NewVacancyPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
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

  it("submits the create-vacancy form with parsed skills and routes to the new vacancy", async () => {
    vi.mocked(createManagedVacancy).mockResolvedValue({
      id: "v1",
      recruiter_id: "r1",
      title: "Backend Developer",
      description: "Build things",
      grade: "middle",
      required_skills: ["python", "sql"],
      nice_to_have_skills: ["docker"],
      status: "draft",
      created_at: "2026-01-01T00:00:00Z",
    });

    renderPage();

    fireEvent.change(await screen.findByLabelText(/title/i), { target: { value: "Backend Developer" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "Build things" } });
    fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: "middle" } });
    fireEvent.change(screen.getByLabelText(/required skills/i), { target: { value: "python, sql" } });
    fireEvent.change(screen.getByLabelText(/nice-to-have skills/i), { target: { value: "docker" } });

    fireEvent.submit(screen.getByRole("button", { name: /create vacancy/i }).closest("form")!);

    await waitFor(() =>
      expect(createManagedVacancy).toHaveBeenCalledWith({
        title: "Backend Developer",
        description: "Build things",
        grade: "middle",
        requiredSkills: ["python", "sql"],
        niceToHaveSkills: ["docker"],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vacancies/v1"));
  });
});
