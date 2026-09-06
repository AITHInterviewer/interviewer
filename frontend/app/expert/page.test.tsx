import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/expert",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadExpertQueue: vi.fn(),
  };
});

import { loadExpertQueue, loadLanding } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ExpertHomePage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <ExpertHomePage />
    </ThemeProvider>,
  );
}

describe("ExpertHomePage", () => {
  beforeEach(() => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
      landing: {
        roles: ["expert"],
        default_path: "/expert",
        available_areas: [{ id: "area.expert_questions", label: "Expert", path: "/expert" }],
        available_actions: ["action.questions.edit"],
      },
    });
    vi.mocked(loadExpertQueue).mockResolvedValue({
      calibrations: [
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
      audits: [],
    });
  });

  it("renders calibration queue from loadExpertQueue", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: /вакансии на калибровке/i })).toBeInTheDocument();
    expect(screen.getByText(/backend developer/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /проверить комплект/i })).toHaveAttribute(
      "href",
      "/vacancies/v1/rubric",
    );
  });

  it("shows separate empty states for calibrations and audits", async () => {
    vi.mocked(loadExpertQueue).mockResolvedValue({ calibrations: [], audits: [] });

    renderPage();

    expect(await screen.findByText(/комплекты на проверку не поступили/i)).toBeInTheDocument();
    expect(screen.getByText(/запросов аудита нет/i)).toBeInTheDocument();
  });
});
