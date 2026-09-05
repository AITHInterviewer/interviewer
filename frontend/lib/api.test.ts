import { describe, expect, it } from "vitest";

import { resolveLiveKitWsUrl } from "@/lib/api";

describe("resolveLiveKitWsUrl", () => {
  it("keeps backend's path/query but swaps host for the page's own origin", () => {
    expect(resolveLiveKitWsUrl("ws://26.67.31.6:12345/rtc")).toBe(`ws://${window.location.host}/rtc`);
  });

  it("uses wss when the page itself is served over https", () => {
    const original = window.location;
    Object.defineProperty(window, "location", {
      value: { ...original, protocol: "https:", host: "example.com" },
      writable: true,
    });

    expect(resolveLiveKitWsUrl("ws://26.67.31.6:12345")).toBe("wss://example.com/");

    Object.defineProperty(window, "location", { value: original, writable: true });
  });
});
