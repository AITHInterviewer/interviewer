import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const protectedRolePage = vi.fn(({ children }: { children?: React.ReactNode }) => <div>{children}</div>);

vi.mock("@/components/auth/protected-role-page", () => ({
  ProtectedRolePage: (props: { children?: React.ReactNode; expectedRole?: string }) => protectedRolePage(props),
}));

import ExpertPage from "./page";

describe("ExpertPage", () => {
  it("renders the protected expert page", () => {
    protectedRolePage.mockClear();

    render(<ExpertPage />);

    expect(screen.queryByText(/role-aware access for experts/i)).not.toBeInTheDocument();
    expect(protectedRolePage).toHaveBeenCalledWith(expect.objectContaining({ expectedRole: "expert" }));
  });
});
