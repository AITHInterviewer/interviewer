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
  usePathname: () => "/manager/i2",
  useParams: () => ({ cid: "i2" }),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadManagerCandidate: vi.fn(),
    loadInterviewEvents: vi.fn(),
    loadRubricVersions: vi.fn(),
  };
});

import { loadInterviewEvents, loadLanding, loadManagerCandidate, loadRubricVersions } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ManagerCandidatePage from "./page";

const interview = {
  id: "i2",
  vacancy_id: "v1",
  candidate_name: "Pavel",
  resume_file_url: "",
  access_token: "t2",
  status: "report_ready",
  created_at: "2026-09-02T00:00:00Z",
};

function renderPage() {
  return render(
    <ThemeProvider>
      <ManagerCandidatePage />
    </ThemeProvider>,
  );
}

describe("ManagerCandidatePage", () => {
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
    vi.mocked(loadInterviewEvents).mockResolvedValue({
      interview,
      events: [],
      answers: [],
    });
    vi.mocked(loadRubricVersions).mockResolvedValue({ items: [] });
  });

  it("treats handoff as meeting and opinion as not a meeting", async () => {
    vi.mocked(loadManagerCandidate).mockResolvedValueOnce({
      interview,
      vacancy_title: "Backend",
      access: "handoff",
      from_recruiter_name: "Anna",
      summary: "Нужна встреча",
    });

    renderPage();

    expect(await screen.findByText(/передан вам, нужна встреча/i)).toBeInTheDocument();
    expect(screen.getByText(/с человеком нужна встреча/i)).toBeInTheDocument();
  });

  it("treats opinion as not a meeting and has no outcome controls", async () => {
    vi.mocked(loadManagerCandidate).mockResolvedValue({
      interview,
      vacancy_title: "Backend",
      access: "opinion",
      from_recruiter_name: "Anna",
    });

    renderPage();

    expect(await screen.findByText(/спросили мнение/i)).toBeInTheDocument();
    expect(screen.getByText(/рекрутер спросил ваше мнение: кандидат вам не передан/i)).toBeInTheDocument();
    expect(screen.queryByText(/нужна встреча/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/начните с того, что человек уже рассказал; при необходимости уточните детали/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/результат встречи здесь не сохраняется/i)).toBeInTheDocument();
    expect(screen.queryByText(/help@/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /нанять|отклонить|принять|отказать/i })).not.toBeInTheDocument();
    expect(document.querySelector(".meeting-decision")).not.toBeInTheDocument();
  });
});
