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
  usePathname: () => "/manager",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadManagerCandidates: vi.fn(),
  };
});

import { loadLanding, loadManagerCandidates } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ManagerListPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <ManagerListPage />
    </ThemeProvider>,
  );
}

describe("ManagerListPage", () => {
  beforeEach(() => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Manager", email: "m@example.com", roles: ["hiring_manager"] } },
      landing: {
        roles: ["hiring_manager"],
        default_path: "/manager",
        available_areas: [{ id: "area.hiring_manager_review", label: "Встречи", path: "/manager" }],
        available_actions: [],
      },
    });
    vi.mocked(loadManagerCandidates).mockResolvedValue({ items: [] });
  });

  it("shows an honest empty state when nobody was handed off", async () => {
    renderPage();

    expect(await screen.findByText(/вам пока не передали кандидатов и не запросили мнение/i)).toBeInTheDocument();
  });

  it("merges access and next step into one column", async () => {
    vi.mocked(loadManagerCandidates).mockResolvedValue({
      items: [
        {
          interview: {
            id: "i1",
            vacancy_id: "v1",
            candidate_name: "Lida",
            resume_file_url: "",
            access_token: "t",
            status: "report_ready",
            created_at: "2026-09-01T00:00:00Z",
          },
          vacancy_title: "Backend",
          handed_off_at: "2026-09-05T08:00:00Z",
          from_recruiter_name: "Anna",
          access: "handoff",
        },
        {
          interview: {
            id: "i2",
            vacancy_id: "v1",
            candidate_name: "Pavel",
            resume_file_url: "",
            access_token: "t2",
            status: "report_ready",
            created_at: "2026-09-02T00:00:00Z",
          },
          vacancy_title: "Backend",
          access: "opinion",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText(/передан вам, нужна встреча/i)).toBeInTheDocument();
    expect(screen.getByText(/спросили мнение/i)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /дата передачи \/ запроса/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /кто передал \/ запросил/i })).toBeInTheDocument();
    expect(screen.getByText("Не указана")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /открыть lida/i })).toBeInTheDocument();
    expect(screen.queryByText(/^доступ$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^когда$/i })).not.toBeInTheDocument();
  });
});
