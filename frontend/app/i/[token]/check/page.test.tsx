import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useParams: () => ({ token: "invite-token" }),
}));

import CheckPage from "./page";

describe("CheckPage", () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.push.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects to the unified interview entry at /i/[token]", async () => {
    render(<CheckPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/i/invite-token"));
  });
});
