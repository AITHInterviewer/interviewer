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

    expect(await screen.findByText(/пока нет кандидатов/i)).toBeInTheDocument();
  });
});
