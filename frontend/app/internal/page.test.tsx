import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  loadLanding: vi.fn(),
}));

import { loadLanding } from "@/lib/auth";
import InternalEntryPage from "./page";

describe("InternalEntryPage", () => {
  it("redirects to login when there is no valid session", async () => {
    vi.mocked(loadLanding).mockResolvedValue(null);

    render(<InternalEntryPage />);

    expect(screen.getByText(/checking your internal session/i)).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("redirects to the landing default path for a signed-in user", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: {
        token: "token-1",
        user: { id: "1", name: "Combo", email: "combo@example.com", roles: ["recruiter", "expert"] },
      },
      landing: {
        roles: ["recruiter", "expert"],
        default_path: "/internal/recruiter",
        available_areas: [
          { id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/internal/recruiter" },
          { id: "area.expert_questions", label: "Expert workspace", path: "/internal/expert" },
        ],
        available_actions: ["action.internal_users.manage", "action.questions.edit"],
      },
    });

    render(<InternalEntryPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/internal/recruiter"));
  });
});
