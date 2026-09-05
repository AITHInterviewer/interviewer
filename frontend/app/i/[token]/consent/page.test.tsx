import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ token: "invite-token" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCandidateInterview: vi.fn(),
    postCandidateConsent: vi.fn().mockResolvedValue({ product_state: "consented" }),
    postCandidateProgress: vi.fn().mockResolvedValue({ product_state: "opened" }),
  };
});

import { fetchCandidateInterview } from "@/lib/api";
import ConsentPage from "./page";

describe("ConsentPage", () => {
  beforeEach(() => {
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "created",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "consented",
      consented: true,
    });
  });

  it("keeps the consent checkbox checked after reload when already consented", async () => {
    render(<ConsentPage />);

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/согласие уже было отмечено ранее/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /дальше, к проверке/i })).toBeEnabled();
  });
});
