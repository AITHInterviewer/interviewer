import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ExpiredPage from "./page";

describe("ExpiredPage", () => {
  it("does not send the candidate to role picker or show interview steps", () => {
    render(<ExpiredPage />);

    expect(screen.getByRole("heading", { name: /эта ссылка больше не работает/i })).toBeInTheDocument();
    expect(
      screen.getByText(/попросите новую ссылку у рекрутера, который прислал приглашение/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/истекло, удалено или скопировано/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /к выбору роли/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /прогресс интервью/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /подготовка к интервью/i })).not.toBeInTheDocument();
  });
});
