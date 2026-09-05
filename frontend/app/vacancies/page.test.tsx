import { render, screen, waitFor } from "@testing-library/react";
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
    vi.mocked(loadLanding).mockResolvedValue(landingFor([{ id: "area.hiring_manager_review", label: "Hiring manager", path: "/internal/hiring-manager" }]));

    renderPage();

    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });

  it("shows the empty state and a create-vacancy action for recruiters", async () => {
    vi.mocked(loadLanding).mockResolvedValue(
      landingFor([{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }]),
    );

    renderPage();

    expect(await screen.findByText(/no vacancies yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create vacancy/i })).toHaveAttribute("href", "/vacancies/new");
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
          status: "pending_review",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText(/backend developer/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create vacancy/i })).not.toBeInTheDocument();
  });
});
