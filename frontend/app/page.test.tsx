import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  getRolePath: vi.fn(() => "/internal/recruiter"),
}));

import { getRolePath, getSession } from "@/lib/auth";
import HomePage from "./page";

describe("HomePage", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("redirects unauthenticated users to login", async () => {
    vi.mocked(getSession).mockReturnValue(null);

    render(<HomePage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByText(/preparing your workspace/i)).toBeInTheDocument();
  });

  it("redirects an existing session to the role area", async () => {
    vi.mocked(getSession).mockReturnValue({
      token: "token-1",
      user: { id: "1", name: "Recruiter", email: "recruiter@example.com", role: "recruiter" },
    });

    render(<HomePage />);

    await waitFor(() => expect(getRolePath).toHaveBeenCalledWith("recruiter"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/internal/recruiter"));
  });
});
