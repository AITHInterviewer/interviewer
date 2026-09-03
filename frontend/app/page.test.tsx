import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/link не рендерится синхронно вне рантайма Next.js (app-router prefetch/Suspense) —
// стандартный приём для изолированных юнит-тестов: подменить на простой <a>.
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the landing heading and link to the interview demo page", async () => {
    // HomePage — async Server Component (делает fetch backend health на сервере) —
    // React DOM (client-only renderer) не умеет рендерить async-компоненты напрямую,
    // поэтому вызываем функцию и рендерим уже resolved JSX (тот же приём, что для
    // InterviewPage). В тестовом окружении BACKEND_INTERNAL_URL не задан — getBackendHealth
    // короткоживущий, без реального fetch.
    const ui = await HomePage();
    render(ui);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /открыть страницу интервью/i })).toHaveAttribute(
      "href",
      "/interview/demo",
    );
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
  });
});
