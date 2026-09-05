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
  resolveLandingPath: vi.fn(() => Promise.resolve("/internal/expert")),
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

  it("submits login and redirects to the landing default path", async () => {
    vi.mocked(signIn).mockResolvedValue({
      access_token: "token-1",
      token_type: "bearer",
      user: { id: "1", name: "Expert", email: "expert@example.com", roles: ["expert"] },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/рабочая почта/i), { target: { value: "expert@example.com" } });
    fireEvent.change(screen.getByLabelText(/^пароль$/i), { target: { value: "TempPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /^войти$/i }).closest("form")!);

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/internal/expert"));
  });

  it("redirects an existing session away from login", async () => {
    vi.mocked(getSession).mockReturnValue({
      token: "token-1",
      user: { id: "1", name: "Expert", email: "expert@example.com", roles: ["expert"] },
    });

    render(<LoginPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/internal"));
  });

  it("points to help mail when the password is wrong", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("bad password"));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/рабочая почта/i), { target: { value: "expert@example.com" } });
    fireEvent.change(screen.getByLabelText(/^пароль$/i), { target: { value: "TempPass123" } });
    fireEvent.submit(screen.getByRole("button", { name: /^войти$/i }).closest("form")!);

    expect(await screen.findByRole("link", { name: /help@napoleon-it.ru/i })).toHaveAttribute(
      "href",
      "mailto:help@napoleon-it.ru",
    );
  });
});
