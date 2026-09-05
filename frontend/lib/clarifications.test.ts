import { describe, expect, it } from "vitest";

import { clarificationStatusLabel, isClarificationOpen, openClarifications } from "@/lib/clarifications";

describe("isClarificationOpen", () => {
  it("recognizes backend statuses", () => {
    expect(isClarificationOpen("requested")).toBe(true);
    expect(isClarificationOpen("received")).toBe(true);
    expect(isClarificationOpen("in_progress")).toBe(true);
    expect(isClarificationOpen("closed")).toBe(false);
  });

  it("recognizes legacy open status in fixtures", () => {
    expect(isClarificationOpen("open")).toBe(true);
  });
});

describe("openClarifications", () => {
  it("filters open items", () => {
    const items = [
      { id: "1", status: "requested" },
      { id: "2", status: "closed" },
      { id: "3", status: "open" },
    ];
    expect(openClarifications(items).map((item) => item.id)).toEqual(["1", "3"]);
  });
});

describe("clarificationStatusLabel", () => {
  it("maps requested to human text", () => {
    expect(clarificationStatusLabel("requested")).toMatch(/ждёт ответа/i);
  });
});
