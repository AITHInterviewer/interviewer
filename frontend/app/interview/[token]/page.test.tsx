import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import InterviewPage from "./page";

describe("InterviewPage", () => {
  it("resolves the token from params and renders it", async () => {
    const ui = await InterviewPage({ params: Promise.resolve({ token: "demo-token" }) });
    render(ui);

    expect(screen.getByText(/demo-token/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /включить камеру/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /начать запись/i })).toBeDisabled();
  });
});
