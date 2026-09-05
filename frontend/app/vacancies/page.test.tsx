import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/vacancies",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadVacancies: vi.fn(),
  };
});

import { loadLanding, loadVacancies } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import VacanciesPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <VacanciesPage />
    </ThemeProvider>,
  );
}

function landingFor(areas: { id: string; label: string; path: string }[], actions: string[] = []) {
  return {
    session: { token: "token", user: { id: "1", name: "User", email: "u@example.com", roles: [] } },
    landing: {
      roles: [],
      default_path: "/vacancies",
      available_areas: areas,
      available_actions: actions,
    },
  };
}

describe("VacanciesPage", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(loadVacancies).mockResolvedValue({ items: [] });
  });

  it("shows an access-denied state for users with neither recruiter nor question-review access", async () => {
    vi.mocked(loadLanding).mockResolvedValue(
      landingFor([{ id: "area.hiring_manager_review", label: "Hiring manager", path: "/internal/hiring-manager" }]),
    );

    renderPage();

    expect(await screen.findByText(/доступа к вакансиям нет/i)).toBeInTheDocument();
  });

  it("shows the empty state and a create-vacancy action for recruiters", async () => {
    vi.mocked(loadLanding).mockResolvedValue(
      landingFor([{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }]),
    );

    renderPage();

    expect(await screen.findByText(/вакансий пока нет/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /новая вакансия/i })).toHaveAttribute("href", "/vacancies/new");
  });

  it("lists vacancies for experts without showing the create action", async () => {
    vi.mocked(loadLanding).mockResolvedValue(
      landingFor([{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }], ["action.questions.edit"]),
    );
    vi.mocked(loadVacancies).mockResolvedValue({
      items: [
        {
          id: "v1",
          recruiter_id: "r1",
          title: "Backend Developer",
          description: "...",
          grade: "middle",
          required_skills: [],
          nice_to_have_skills: [],
          status: "calibration",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText(/backend developer/i)).toBeInTheDocument();
    // Статус есть и в строке таблицы, и в фильтре — проверяем именно пилюлю в таблице.
    const row = (await screen.findByText(/backend developer/i)).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(/на калибровке/i)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Эксперт проверяет комплект")).toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(/^Эксперт$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /новая вакансия/i })).not.toBeInTheDocument();
  });
});
