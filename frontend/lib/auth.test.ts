import { afterEach, describe, expect, it } from "vitest";

import { AUTH_STORAGE_KEY, clearSession, getLandingPath, getSession, saveSession } from "@/lib/auth";
import type { LandingResponse } from "@/lib/api";

afterEach(() => {
  window.localStorage.clear();
});

describe("auth helpers", () => {
  it("stores and reads the session", () => {
    saveSession({
      access_token: "token-1",
      token_type: "bearer",
      user: { id: "1", name: "Recruiter", email: "recruiter@example.com", roles: ["recruiter"] },
    });

    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toContain("token-1");
    expect(getSession()?.user.roles).toEqual(["recruiter"]);
  });

  it("clears a stored session", () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, "{}") ;
    clearSession();

    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("resolves the landing path from the landing payload", () => {
    const landing: LandingResponse = {
      roles: ["recruiter", "expert"],
      default_path: "/internal/recruiter",
      available_areas: [
        { id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/internal/recruiter" },
        { id: "area.expert_questions", label: "Expert workspace", path: "/internal/expert" },
      ],
      available_actions: ["action.internal_users.manage", "action.questions.edit"],
    };

    expect(getLandingPath(landing)).toBe("/internal/recruiter");
  });
});
