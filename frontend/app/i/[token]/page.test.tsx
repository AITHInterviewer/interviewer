import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ token: "invite-token" }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchCandidateInterview: vi.fn(),
    postCandidateProgress: vi.fn().mockResolvedValue({ product_state: "opened" }),
  };
});

import { ApiError, fetchCandidateInterview } from "@/lib/api";
import InvitationPage from "./page";

describe("CandidateInvitePage", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.push.mockReset();
    vi.mocked(fetchCandidateInterview).mockResolvedValue({
      interview_id: "int-1",
      status: "created",
      vacancy_title: "Backend-разработчик",
      questions_total: 6,
      estimated_duration_min: { min: 25, max: 40 },
      product_state: "invited",
      consented: false,
    });
  });

  it("renders the invitation heading", async () => {
    render(<InvitationPage />);

    expect(await screen.findByRole("heading", { name: /вас пригласили на интервью/i })).toBeInTheDocument();
  });

  it("opens /i/expired when the interview token is missing", async () => {
    vi.mocked(fetchCandidateInterview).mockRejectedValue(new ApiError("missing", 404));
    render(<InvitationPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/i/expired"));
  });
});
