import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CandidatePrepProgress } from "@/components/chrome/CandidatePrepProgress";
import { CandidateShell } from "@/components/chrome/CandidateShell";

describe("CandidatePrepProgress", () => {
  it("renders three preparation steps with the current one marked", () => {
    render(<CandidatePrepProgress current="Устройства" />);

    const nav = screen.getByRole("navigation", { name: /подготовка к интервью/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText("Согласие").closest("li")).toHaveAttribute("data-done", "true");
    expect(screen.getByText("Устройства").closest("li")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Интервью").closest("li")).not.toHaveAttribute("data-active");
  });
});

describe("CandidateShell prep progress", () => {
  it("shows prep progress only when prepStep is passed", () => {
    const { rerender } = render(
      <CandidateShell vacancyTitle="Backend" prepStep="Согласие">
        <p>Контент</p>
      </CandidateShell>,
    );

    expect(screen.getByRole("navigation", { name: /подготовка к интервью/i })).toBeInTheDocument();

    rerender(
      <CandidateShell vacancyTitle="Backend">
        <p>Контент</p>
      </CandidateShell>,
    );

    expect(screen.queryByRole("navigation", { name: /подготовка к интервью/i })).not.toBeInTheDocument();
  });
});
