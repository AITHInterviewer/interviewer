import { describe, expect, it } from "vitest";

import { formatRoleList, roleTitle } from "@/lib/roles";
import type { RoleRegistryEntry } from "@/lib/roles";

const entries: RoleRegistryEntry[] = [
  { code: "recruiter", title: "Recruiter", sort_order: 0 },
  { code: "hiring_manager", title: "Hiring manager", sort_order: 1 },
  { code: "expert", title: "Expert", sort_order: 2 },
];

describe("role registry helpers", () => {
  it("maps role codes to registry titles", () => {
    expect(roleTitle(entries, "expert")).toBe("Expert");
  });

  it("falls back to the raw code for unknown roles", () => {
    expect(roleTitle(entries, "methodologist")).toBe("methodologist");
  });

  it("formats role lists for display", () => {
    expect(formatRoleList(entries, ["recruiter", "expert"])).toBe("Recruiter, Expert");
  });
});
