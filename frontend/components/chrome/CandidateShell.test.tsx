import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CandidateShell } from "@/components/chrome/CandidateShell";

describe("CandidateShell", () => {
  it("renders vacancy title and children without a stepper or role-picker link", () => {
    render(
      <CandidateShell vacancyTitle="Backend-разработчик">
        <p>Содержимое</p>
      </CandidateShell>,
    );

    expect(screen.getByText("Backend-разработчик")).toBeInTheDocument();
    expect(screen.getByText("Содержимое")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /подготовка к интервью/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /к выбору роли/i })).not.toBeInTheDocument();
  });

  it("can show the three-step prep progress when prepStep is set", () => {
    render(
      <CandidateShell vacancyTitle="Backend-разработчик" prepStep="Согласие">
        <p>Содержимое</p>
      </CandidateShell>,
    );

    expect(screen.getByRole("navigation", { name: /подготовка к интервью/i })).toBeInTheDocument();
    expect(screen.getByText("Устройства")).toBeInTheDocument();
    expect(screen.getByText("Интервью")).toBeInTheDocument();
  });
});
