import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const protectedRolePage = vi.fn(({ children }: { children?: React.ReactNode }) => <div>{children}</div>);

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: (props: { children?: React.ReactNode; requiredArea?: string }) => protectedRolePage(props),
}));

import HiringManagerPage from "./page";

describe("HiringManagerPage", () => {
  it("renders the protected hiring manager page gated by the hiring manager area", () => {
    protectedRolePage.mockClear();

    render(<HiringManagerPage />);

    expect(screen.getByText(/hiring manager workspace is reserved/i)).toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(
      expect.objectContaining({ requiredArea: "area.hiring_manager_review" }),
    );
  });
});
