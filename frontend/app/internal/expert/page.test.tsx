import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const protectedRolePage = vi.fn(({ children }: { children?: React.ReactNode }) => <div>{children}</div>);

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: (props: { children?: React.ReactNode; requiredArea?: string }) => protectedRolePage(props),
}));

vi.mock("@/components/auth/expert-workspace", () => ({
  ExpertWorkspace: () => <div>expert workspace stub</div>,
}));

import ExpertPage from "./page";

describe("ExpertPage", () => {
  it("renders the protected expert page gated by the expert area", () => {
    protectedRolePage.mockClear();

    render(<ExpertPage />);

    expect(screen.getByText(/expert workspace stub/i)).toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(
      expect.objectContaining({ requiredArea: "area.expert_questions" }),
    );
  });
});
