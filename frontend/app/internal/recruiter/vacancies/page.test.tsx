import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const protectedRolePage = vi.fn(({ children }: { children?: React.ReactNode }) => <div>{children}</div>);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: (props: { children?: React.ReactNode; requiredArea?: string }) => protectedRolePage(props),
}));

vi.mock("@/lib/auth", () => ({
  loadLanding: vi.fn().mockResolvedValue({ landing: { available_areas: [] } }),
  getSession: vi.fn().mockReturnValue({ token: "token-1" }),
}));

vi.mock("@/lib/api", () => ({
  createRecruiterVacancy: vi.fn(),
  listRecruiterVacancies: vi.fn().mockResolvedValue({ items: [] }),
}));

import RecruiterVacanciesPage from "./page";

describe("RecruiterVacanciesPage", () => {
  it("renders behind the recruiter protected area", async () => {
    render(<RecruiterVacanciesPage />);

    expect(await screen.findByText(/no recruiter vacancies yet/i)).toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(
      expect.objectContaining({ requiredArea: "area.recruiter_workspace" }),
    );
  });
});
