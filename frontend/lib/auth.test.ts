import { afterEach, describe, expect, it } from "vitest";

import { AUTH_STORAGE_KEY, clearSession, getRolePath, getSession, saveSession } from "@/lib/auth";

afterEach(() => {
  window.localStorage.clear();
});

describe("auth helpers", () => {
  it("stores and reads the session", () => {
    saveSession({
      access_token: "token-1",
      token_type: "bearer",
      user: { id: "1", name: "Recruiter", email: "recruiter@example.com", role: "recruiter" },
    });

    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toContain("token-1");
    expect(getSession()?.user.role).toBe("recruiter");
  });

  it("clears a stored session", () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, "{}") ;
    clearSession();

    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("maps each role to its internal route", () => {
    expect(getRolePath("recruiter")).toBe("/internal/recruiter");
    expect(getRolePath("hiring_manager")).toBe("/internal/hiring-manager");
    expect(getRolePath("expert")).toBe("/internal/expert");
  });
});
