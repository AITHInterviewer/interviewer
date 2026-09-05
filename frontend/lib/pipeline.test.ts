import { describe, expect, it } from "vitest";

import type { Interview } from "./api";
import { interviewColumn } from "./pipeline";

function interview(partial: Partial<Interview> & Pick<Interview, "status">): Interview {
  return {
    id: "i1",
    vacancy_id: "v1",
    candidate_name: "Анна",
    resume_file_url: "s3://x",
    access_token: "tok",
    created_at: "2026-09-05T00:00:00Z",
    ...partial,
  };
}

describe("interviewColumn", () => {
  it("maps invited product state to invited column", () => {
    expect(interviewColumn(interview({ status: "created", product_state: "opened" }))).toBe(
      "invited",
    );
  });

  it("maps live interview to live column", () => {
    expect(interviewColumn(interview({ status: "in_progress", product_state: "in_interview" }))).toBe(
      "live",
    );
  });

  it("maps handed off decision to done", () => {
    expect(
      interviewColumn(
        interview({
          status: "completed",
          product_state: "report_ready",
          recruiter_decision: "handed_off",
        }),
      ),
    ).toBe("done");
  });

  it("keeps report_ready in decide while recruiter awaits — even if clarifications are open server-side", () => {
    expect(
      interviewColumn(
        interview({
          status: "completed",
          product_state: "report_ready",
          recruiter_decision: "awaiting",
        }),
      ),
    ).toBe("decide");
  });
});
