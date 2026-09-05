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
  getSession: vi.fn().mockReturnValue({ token: "token-1" }),
}));

vi.mock("@/lib/api", () => ({
  listExpertVacancies: vi.fn().mockResolvedValue({ items: [] }),
}));

import ExpertVacanciesPage from "./page";

describe("ExpertVacanciesPage", () => {
  it("renders behind the expert protected area", async () => {
    render(<ExpertVacanciesPage />);

    expect(await screen.findByText(/no vacancies waiting for review/i)).toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(
      expect.objectContaining({ requiredArea: "area.expert_questions" }),
    );
  });
});
