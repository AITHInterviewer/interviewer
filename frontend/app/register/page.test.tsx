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
  getRolePath: vi.fn(() => "/internal/recruiter"),
  signUpRecruiter: vi.fn(),
}));

import { getSession, signUpRecruiter } from "@/lib/auth";
import RegisterPage from "./page";

describe("RegisterPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    vi.mocked(getSession).mockReturnValue(null);
  });

  it("submits recruiter registration and redirects to recruiter area", async () => {
    vi.mocked(signUpRecruiter).mockResolvedValue({
      access_token: "token-1",
      token_type: "bearer",
      user: { id: "1", name: "Recruiter", email: "recruiter@example.com", role: "recruiter" },
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Recruiter" } });
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "recruiter@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "StrongPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /create recruiter account/i }).closest("form")!);

    await waitFor(() => expect(signUpRecruiter).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/internal/recruiter"));
  });

  it("redirects an existing session away from the page", async () => {
    vi.mocked(getSession).mockReturnValue({
      token: "token-1",
      user: { id: "1", name: "Recruiter", email: "recruiter@example.com", role: "recruiter" },
    });

    render(<RegisterPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/internal/recruiter"));
  });
});
