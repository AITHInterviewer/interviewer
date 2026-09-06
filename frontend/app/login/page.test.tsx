import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

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

function fillLoginForm() {
  fireEvent.change(screen.getByLabelText(/рабочая почта/i), { target: { value: "expert@example.com" } });
  fireEvent.change(screen.getByLabelText(/^пароль$/i), { target: { value: "TempPass123" } });
}

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

    fillLoginForm();
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

  it("shows a help mail link before any error", () => {
    render(<LoginPage />);

    expect(screen.getByRole("link", { name: /нужна помощь со входом/i })).toHaveAttribute(
      "href",
      "mailto:help@napoleon-it.ru",
    );
  });

  it("shows a unified Russian message on 401 and keeps the email", async () => {
    vi.mocked(signIn).mockRejectedValue(new ApiError("Invalid email or password.", 401));

    render(<LoginPage />);

    fillLoginForm();
    fireEvent.submit(screen.getByRole("button", { name: /^войти$/i }).closest("form")!);

    expect(await screen.findByText("Не удалось войти. Проверьте почту и пароль")).toBeInTheDocument();
    expect(screen.getByLabelText(/рабочая почта/i)).toHaveValue("expert@example.com");
    expect(screen.getByLabelText(/^пароль$/i)).toHaveValue("TempPass123");
    expect(screen.queryByText(/неверный пароль/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid email/i)).not.toBeInTheDocument();
  });

  it("shows a service-unreachable message on network failure", async () => {
    vi.mocked(signIn).mockRejectedValue(new TypeError("Failed to fetch"));

    render(<LoginPage />);

    fillLoginForm();
    fireEvent.submit(screen.getByRole("button", { name: /^войти$/i }).closest("form")!);

    expect(await screen.findByText("Не удалось связаться с сервисом. Повторите попытку")).toBeInTheDocument();
    expect(screen.getByLabelText(/рабочая почта/i)).toHaveValue("expert@example.com");
  });

  it("shows a service-unreachable message when the request never reaches the server", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Network Error"));

    render(<LoginPage />);

    fillLoginForm();
    fireEvent.submit(screen.getByRole("button", { name: /^войти$/i }).closest("form")!);

    expect(await screen.findByText("Не удалось связаться с сервисом. Повторите попытку")).toBeInTheDocument();
  });
});
