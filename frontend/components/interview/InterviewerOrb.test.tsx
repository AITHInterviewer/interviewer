import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InterviewerOrb } from "@/components/interview/InterviewerOrb";

describe("InterviewerOrb", () => {
  it("показывает понятное состояние подключения", () => {
    render(<InterviewerOrb presence="absent" />);

    expect(screen.getByRole("status", { name: "Подключаем интервьюера…" })).toHaveAttribute(
      "data-state",
      "absent",
    );
  });

  it("переключает визуальный режим между слушанием и речью", () => {
    const view = render(<InterviewerOrb presence="present" />);

    expect(screen.getByRole("status", { name: "Интервьюер слушает вас" })).toHaveAttribute(
      "data-state",
      "present",
    );

    view.rerender(<InterviewerOrb presence="speaking" />);

    expect(screen.getByRole("status", { name: "Интервьюер говорит…" })).toHaveAttribute(
      "data-state",
      "speaking",
    );
  });
});
