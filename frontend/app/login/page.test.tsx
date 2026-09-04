import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  getRolePath: vi.fn(() => "/internal/expert"),
  signIn: vi.fn(),
}));

import { getSession, signIn } from "@/lib/auth";
import LoginPage from "./page";

describe("LoginPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    vi.mocked(getSession).mockReturnValue(null);
  });

  it("submits login and redirects to the role area", async () => {
    vi.mocked(signIn).mockResolvedValue({
      access_token: "token-1",
      token_type: "bearer",
      user: { id: "1", name: "Expert", email: "expert@example.com", role: "expert" },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "expert@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "TempPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /^sign in$/i }).closest("form")!);

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/internal/expert"));
  });

  it("redirects an existing session away from login", async () => {
    vi.mocked(getSession).mockReturnValue({
      token: "token-1",
      user: { id: "1", name: "Expert", email: "expert@example.com", role: "expert" },
    });

    render(<LoginPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/internal/expert"));
  });
});
