import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const protectedRolePage = vi.fn(({ children }: { children?: React.ReactNode }) => <div>{children}</div>);

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: (props: { children?: React.ReactNode; expectedRole?: string }) => protectedRolePage(props),
}));

import HiringManagerPage from "./page";

describe("HiringManagerPage", () => {
  it("renders the protected hiring manager page", () => {
    protectedRolePage.mockClear();

    render(<HiringManagerPage />);

    expect(screen.queryByText(/role-aware access for hiring managers/i)).not.toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(expect.objectContaining({ expectedRole: "hiring_manager" }));
  });
});
