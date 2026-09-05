import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
}));

vi.mock("next/navigation", () => ({ redirect }));

import ExpertQueueRedirectPage from "./page";

describe("ExpertQueueRedirectPage", () => {
  it("redirects legacy /expert/queue to /expert", () => {
    expect(() => ExpertQueueRedirectPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/expert");
  });
});
