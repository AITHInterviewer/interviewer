import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/internal/hiring-manager",
}));

vi.mock("@/lib/auth", () => ({
  loadLanding: vi.fn(),
}));

import { loadLanding } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import HiringManagerPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <HiringManagerPage />
    </ThemeProvider>,
  );
}

describe("HiringManagerPage", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirects away when the user lacks the hiring manager area", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/vacancies"));
  });

  it("renders the placeholder workspace for hiring managers", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Manager", email: "m@example.com", roles: ["hiring_manager"] } },
      landing: {
        roles: ["hiring_manager"],
        default_path: "/internal/hiring-manager",
        available_areas: [
          { id: "area.hiring_manager_review", label: "Hiring manager workspace", path: "/internal/hiring-manager" },
        ],
        available_actions: [],
      },
    });

    renderPage();

    expect(await screen.findByText(/hiring manager workspace is reserved/i)).toBeInTheDocument();
  });
});
