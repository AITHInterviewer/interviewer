import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/vacancies",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

import { AppShell } from "@/components/chrome/AppShell";
import { ThemeProvider } from "@/lib/theme";

describe("AppShell", () => {
  it("does not render a theme toggle in the pilot shell", () => {
    render(
      <ThemeProvider>
        <AppShell nav={[{ href: "/vacancies", label: "Вакансии" }]} title="Вакансии">
          <p>Содержимое</p>
        </AppShell>
      </ThemeProvider>,
    );

    expect(screen.getByText("Содержимое")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /включить (светлую|тёмную) тему/i })).not.toBeInTheDocument();
  });
});
