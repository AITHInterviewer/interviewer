import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CandidateShell } from "@/components/chrome/CandidateShell";

describe("CandidateShell", () => {
  it("keeps help contacts and does not send the candidate to role picker", () => {
    render(
      <CandidateShell steps={["Приглашение", "Интервью"]} current="Приглашение">
        <p>Содержимое</p>
      </CandidateShell>,
    );

    expect(screen.getByRole("link", { name: "help@napoleon-it.ru" })).toHaveAttribute(
      "href",
      "mailto:help@napoleon-it.ru",
    );
    expect(screen.getByRole("link", { name: "@napoleon_help" })).toHaveAttribute(
      "href",
      "https://t.me/napoleon_help",
    );
    expect(screen.queryByRole("link", { name: /к выбору роли/i })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: /прогресс интервью/i })).toBeInTheDocument();
  });

  it("hides the stepper when showStepper is false", () => {
    render(
      <CandidateShell steps={["Приглашение", "Интервью"]} current="Приглашение" showStepper={false}>
        <p>Содержимое</p>
      </CandidateShell>,
    );

    expect(screen.queryByRole("list", { name: /прогресс интервью/i })).not.toBeInTheDocument();
  });
});
