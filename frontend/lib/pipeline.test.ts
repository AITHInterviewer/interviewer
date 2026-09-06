import { describe, expect, it } from "vitest";

import type { Interview, InterviewReport } from "./api";
import {
  formatRankingScore,
  interviewColumn,
  rankingScore,
  sortByRanking,
} from "./pipeline";

function report(partial: Partial<InterviewReport> = {}): InterviewReport {
  return {
    generated_at: null,
    model_version: null,
    prompt_version: null,
    verdict: "needs_review",
    overall_score: null,
    per_question: [],
    confirmed_skills: [],
    unconfirmed_skills: [],
    contradictions_found: [],
    strengths: [],
    risks: [],
    summary_intro: null,
    summary_conclusion: null,
    ...partial,
  };
}

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
  it("maps opened to invited", () => {
    expect(interviewColumn(interview({ status: "created", product_state: "opened" }))).toBe(
      "invited",
    );
  });

  it("maps in_interview to invited, not a live column", () => {
    expect(
      interviewColumn(interview({ status: "in_progress", product_state: "in_interview" })),
    ).toBe("invited");
  });

  it("maps submitted to interviewed", () => {
    expect(interviewColumn(interview({ status: "completed", product_state: "submitted" }))).toBe(
      "interviewed",
    );
  });

  it("maps report_processing to interviewed", () => {
    expect(
      interviewColumn(interview({ status: "processing", product_state: "report_processing" })),
    ).toBe("interviewed");
  });

  it("maps report_ready awaiting to evaluated", () => {
    expect(
      interviewColumn(
        interview({
          status: "completed",
          product_state: "report_ready",
          recruiter_decision: "awaiting",
        }),
      ),
    ).toBe("evaluated");
  });

  it("maps handed_off to done", () => {
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

  it("maps opinion_asked to done", () => {
    expect(
      interviewColumn(
        interview({
          status: "completed",
          product_state: "report_ready",
          recruiter_decision: "opinion_asked",
        }),
      ),
    ).toBe("done");
  });

  it("maps rejected to done", () => {
    expect(
      interviewColumn(
        interview({
          status: "completed",
          product_state: "report_ready",
          recruiter_decision: "rejected",
        }),
      ),
    ).toBe("done");
  });

  it("maps declined to done", () => {
    expect(interviewColumn(interview({ status: "created", product_state: "declined" }))).toBe(
      "done",
    );
  });

  it("maps expired to done", () => {
    expect(interviewColumn(interview({ status: "created", product_state: "expired" }))).toBe(
      "done",
    );
  });
});

describe("rankingScore", () => {
  it("uses score_percent when present", () => {
    expect(
      rankingScore(
        interview({
          status: "completed",
          product_state: "report_ready",
          report_json: report({ score_percent: 78, overall_score: 50 }),
        }),
      ),
    ).toBe(78);
  });

  it("falls back to overall_score as 0–100 when score_percent is missing", () => {
    expect(
      rankingScore(
        interview({ status: "completed", report_json: report({ overall_score: 84 }) }),
      ),
    ).toBe(84);
  });

  it("does not fall back to the 0–3 skill_levels average", () => {
    expect(
      rankingScore(
        interview({
          status: "completed",
          product_state: "report_ready",
          report_json: report({
            overall_score: null,
            skill_levels: [
              { skill_tag: "python", level: 2 },
              { skill_tag: "sql", level: 3 },
            ],
          }),
        }),
      ),
    ).toBeNull();
  });

  it("returns null while the report is still processing", () => {
    expect(
      rankingScore(
        interview({
          status: "processing",
          product_state: "report_processing",
          report_json: report({ overall_score: 84, score_percent: 84 }),
        }),
      ),
    ).toBeNull();
  });

  it("returns null when there is no report", () => {
    expect(rankingScore(interview({ status: "created" }))).toBeNull();
  });
});

describe("formatRankingScore", () => {
  it("prints a whole percent without decimals", () => {
    expect(formatRankingScore(78)).toBe("78");
  });

  it("prints one decimal for a fractional percent", () => {
    expect(formatRankingScore(78.56)).toBe("78.6");
  });
});

describe("sortByRanking", () => {
  it("puts a higher score first and null scores last", () => {
    const low = interview({
      id: "low",
      status: "completed",
      candidate_name: "Низкий",
      report_json: report({ overall_score: 10 }),
    });
    const high = interview({
      id: "high",
      status: "completed",
      candidate_name: "Высокий",
      report_json: report({ overall_score: 90 }),
    });
    const none = interview({
      id: "none",
      status: "created",
      candidate_name: "Без балла",
    });

    expect(sortByRanking([low, none, high]).map((item) => item.id)).toEqual([
      "high",
      "low",
      "none",
    ]);
  });
});
