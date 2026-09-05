import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/vacancies/v1/settings",
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
    updateManagedVacancy: vi.fn(),
  };
});

import { loadLanding, loadVacancy, updateManagedVacancy } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { VacancySettingsClient } from "./settings-client";

function renderClient(vacancyId: string) {
  return render(
    <ThemeProvider>
      <VacancySettingsClient vacancyId={vacancyId} />
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

describe("VacancySettingsClient", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(loadVacancy).mockResolvedValue(baseVacancy);
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

  it("redirects non-recruiters away from settings", async () => {
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/vacancies"));
  });

  it("prefills the form and submits updates", async () => {
    vi.mocked(updateManagedVacancy).mockResolvedValue({ ...baseVacancy, title: "Senior Backend Developer" });

    renderClient("v1");

    const titleInput = (await screen.findByLabelText(/название/i)) as HTMLInputElement;
    expect(titleInput.value).toBe("Backend Developer");

    fireEvent.change(titleInput, { target: { value: "Senior Backend Developer" } });
    fireEvent.submit(screen.getByRole("button", { name: /сохранить/i }).closest("form")!);

    await waitFor(() =>
      expect(updateManagedVacancy).toHaveBeenCalledWith("v1", {
        title: "Senior Backend Developer",
        description: "Build things",
        grade: "middle",
        requiredSkills: ["python"],
        niceToHaveSkills: [],
      }),
    );
    await waitFor(() => expect(screen.getByText(/изменения сохранены/i)).toBeInTheDocument());
  });
});
