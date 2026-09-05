import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/internal/users",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    createManagedInternalUser: vi.fn(),
    loadInternalUsers: vi.fn(),
    loadRoleRegistry: vi.fn(),
    loadLanding: vi.fn(),
  };
});

import { createManagedInternalUser, loadInternalUsers, loadLanding, loadRoleRegistry } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import InternalUsersPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <InternalUsersPage />
    </ThemeProvider>,
  );
}

const registryEntries = [
  { code: "recruiter", title: "Recruiter", sort_order: 0 },
  { code: "hiring_manager", title: "Hiring manager", sort_order: 1 },
  { code: "expert", title: "Expert", sort_order: 2 },
];

describe("InternalUsersPage", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(createManagedInternalUser).mockReset();
    vi.mocked(loadInternalUsers).mockResolvedValue({ items: [] });
    vi.mocked(loadRoleRegistry).mockResolvedValue(registryEntries);
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: ["action.internal_users.manage"],
      },
    });
  });

  it("redirects away when the user cannot manage internal users", async () => {
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

  it("shows the empty state and submits the internal-user creation form", async () => {
    vi.mocked(createManagedInternalUser).mockResolvedValue({
      id: "2",
      name: "Manager One",
      email: "manager@example.com",
      roles: ["hiring_manager"],
      created_by_user_id: "1",
    });

    renderPage();

    expect(await screen.findByText(/сотрудников пока нет/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /завести сотрудника/i }));

    fireEvent.change(screen.getByLabelText(/имя и фамилия/i), { target: { value: "Manager One" } });
    fireEvent.change(screen.getByLabelText(/рабочая почта/i), { target: { value: "manager@example.com" } });
    fireEvent.change(screen.getByLabelText(/временный пароль/i), { target: { value: "TempPass123" } });

    // First registry entry is preselected by default; choose hiring manager instead.
    fireEvent.click(await screen.findByRole("checkbox", { name: /recruiter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^hiring manager$/i }));

    fireEvent.submit(screen.getByRole("button", { name: /завести сотрудника/i }).closest("form")!);

    await waitFor(() =>
      expect(createManagedInternalUser).toHaveBeenCalledWith({
        name: "Manager One",
        email: "manager@example.com",
        roles: ["hiring_manager"],
        temporaryPassword: "TempPass123",
      }),
    );
    await waitFor(() => expect(screen.getByText(/manager one \(hiring_manager\) created/i)).toBeInTheDocument());
  });
});
