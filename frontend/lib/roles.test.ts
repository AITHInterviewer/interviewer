import { describe, expect, it } from "vitest";

import { assignedRegistryRoles, formatRoleList, roleTitle } from "@/lib/roles";
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

  it("does not title a fictional admin role", () => {
    expect(roleTitle(entries, "admin")).toBe("admin");
    expect(roleTitle(entries, "admin")).not.toBe("Администратор");
  });

  it("keeps only roles that exist in the registry", () => {
    expect(assignedRegistryRoles(entries, ["recruiter", "admin", "expert"])).toEqual(["recruiter", "expert"]);
  });

  it("formats role lists for display", () => {
    expect(formatRoleList(entries, ["recruiter", "expert"])).toBe("Recruiter, Expert");
  });

  it("omits unknown codes from formatted lists", () => {
    expect(formatRoleList(entries, ["recruiter", "admin"])).toBe("Recruiter");
  });
});
