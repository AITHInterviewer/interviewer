import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  loadLanding: vi.fn().mockResolvedValue(null),
  getRolePath: vi.fn(() => "/internal/recruiter"),
}));

import InternalEntryPage from "./page";

describe("InternalEntryPage", () => {
  it("redirects to login when there is no valid session", async () => {
    render(<InternalEntryPage />);

    expect(screen.getByText(/checking your internal session/i)).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
