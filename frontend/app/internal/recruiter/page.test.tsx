import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    createManagedInternalUser: vi.fn(),
    loadInternalUsers: vi.fn(),
    loadRoleRegistry: vi.fn(),
  };
});

import { createManagedInternalUser, loadInternalUsers, loadRoleRegistry } from "@/lib/auth";
import RecruiterInternalPage from "./page";

const registryEntries = [
  { code: "recruiter", title: "Recruiter", sort_order: 0 },
  { code: "hiring_manager", title: "Hiring manager", sort_order: 1 },
  { code: "expert", title: "Expert", sort_order: 2 },
];

describe("RecruiterInternalPage", () => {
  beforeEach(() => {
    vi.mocked(createManagedInternalUser).mockReset();
    vi.mocked(loadInternalUsers).mockResolvedValue({
      items: [],
    });
    vi.mocked(loadRoleRegistry).mockResolvedValue(registryEntries);
  });

  it("shows the users tab and submits the internal-user creation form", async () => {
    vi.mocked(createManagedInternalUser).mockResolvedValue({
      id: "2",
      name: "Manager One",
      email: "manager@example.com",
      roles: ["hiring_manager"],
      created_by_user_id: "1",
    });

    render(<RecruiterInternalPage />);

    expect(await screen.findByRole("tab", { name: /users/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/no managed users yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add new user/i }));

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Manager One" } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "manager@example.com" } });
    fireEvent.change(screen.getByLabelText(/temporary password/i), { target: { value: "TempPass123" } });

    // First registry entry is preselected by default; choose hiring manager instead.
    fireEvent.click(screen.getByRole("checkbox", { name: /recruiter/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^hiring manager$/i }));

    fireEvent.submit(screen.getByRole("button", { name: /create internal user/i }).closest("form")!);

    await waitFor(() => expect(createManagedInternalUser).toHaveBeenCalledWith({
      name: "Manager One",
      email: "manager@example.com",
      roles: ["hiring_manager"],
      temporaryPassword: "TempPass123",
    }));
    await waitFor(() => expect(screen.getByText(/manager one \(hiring_manager\) created/i)).toBeInTheDocument());
  });

  it("shows placeholder copy on future tabs", async () => {
    render(<RecruiterInternalPage />);

    fireEvent.click((await screen.findAllByRole("tab", { name: /vacancies/i }))[0]);

    expect(screen.getByText(/placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/vacancies tab is reserved/i)).toBeInTheDocument();
  });
});
