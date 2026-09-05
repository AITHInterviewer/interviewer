import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockReturnValue({ token: "token-1" }),
  loadLanding: vi.fn().mockResolvedValue({
    landing: { available_areas: [{ id: "area.recruiter_workspace" }, { id: "area.expert_questions" }] },
  }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  fetchExpertVacancy: vi.fn(),
  fetchRecruiterVacancy: vi.fn(),
  updateRecruiterVacancy: vi.fn(),
  addRecruiterVacancyQuestion: vi.fn(),
  deleteRecruiterVacancyQuestion: vi.fn(),
  updateRecruiterVacancyQuestion: vi.fn(),
  updateExpertVacancyQuestion: vi.fn(),
  submitRecruiterVacancy: vi.fn(),
  approveExpertVacancy: vi.fn(),
  requestExpertVacancyChanges: vi.fn(),
  archiveRecruiterVacancy: vi.fn(),
  restoreRecruiterVacancy: vi.fn(),
}));

import {
  addRecruiterVacancyQuestion,
  ApiError,
  approveExpertVacancy,
  requestExpertVacancyChanges,
  fetchExpertVacancy,
  fetchRecruiterVacancy,
  submitRecruiterVacancy,
  updateExpertVacancyQuestion,
  type VacancyDetail,
  updateRecruiterVacancy,
  updateRecruiterVacancyQuestion,
} from "@/lib/api";
import { VacancyWorkspace } from "./vacancy-workspace";

const recruiterVacancy: VacancyDetail = {
  id: "vac-1",
  title: "Backend Engineer",
  grade: "senior",
  job_description: "Build services",
  ideal_candidate_profile: "Clear communicator",
  required_skills: ["Python"],
  nice_to_have_skills: ["Docker"],
  status: "draft",
  created_by_recruiter_id: "u-1",
  created_by_user_id: "u-1",
  managing_recruiter_id: "u-1",
  created_at: "2026-09-04T00:00:00Z",
  updated_at: "2026-09-04T00:00:00Z",
  questions: [],
  review_state: { status: "draft" },
  viewer_permissions: ["vacancy.body.edit", "vacancy.questions.edit", "vacancy.submit", "vacancy.archive", "vacancy.review_history.view"],
};

const submittedVacancy: VacancyDetail = {
  ...recruiterVacancy,
  status: "submitted_for_review",
  updated_at: "2026-09-04T01:00:00Z",
  questions: [
    {
      id: "q-1",
      text: "Explain CAP theorem",
      order: 0,
      skill_tags: ["distributed systems"],
      intent: null,
      reference_answer: null,
      format: "voice",
      role: "assessment",
      difficulty: "baseline",
      estimated_duration_sec: null,
      stimulus: null,
      source: "base_manual",
      updated_at: "2026-09-04T01:00:00Z",
    },
  ],
  viewer_permissions: ["vacancy.questions.edit", "vacancy.approve", "vacancy.request_changes", "vacancy.review_history.view"],
};

describe("VacancyWorkspace", () => {
  beforeEach(() => {
    vi.mocked(fetchExpertVacancy).mockRejectedValue(new ApiError("not expert mode", 403));
    vi.mocked(fetchRecruiterVacancy).mockResolvedValue(structuredClone(recruiterVacancy));
  });

  it("loads recruiter vacancy details and saves body changes", async () => {
    vi.mocked(updateRecruiterVacancy).mockResolvedValue({
      ...recruiterVacancy,
      title: "Updated title",
      questions: [
        {
          id: "q-1",
          text: "Saved question text",
          order: 0,
          skill_tags: ["systems"],
          intent: "Check depth",
          reference_answer: "Saved answer",
          format: "voice",
          role: "assessment",
          difficulty: "baseline",
          estimated_duration_sec: null,
          stimulus: null,
          source: "base_manual",
          updated_at: "2026-09-04T00:02:00Z",
        },
      ],
    });
    vi.mocked(fetchRecruiterVacancy).mockResolvedValue({
      ...recruiterVacancy,
      questions: [
        {
          id: "q-1",
          text: "Original question text",
          order: 0,
          skill_tags: [],
          intent: null,
          reference_answer: null,
          format: "voice",
          role: "assessment",
          difficulty: "baseline",
          estimated_duration_sec: null,
          stimulus: null,
          source: "base_manual",
          updated_at: recruiterVacancy.updated_at,
        },
      ],
    });
    vi.mocked(updateRecruiterVacancyQuestion).mockResolvedValue({
      ...recruiterVacancy,
      title: "Updated title",
      questions: [
        {
          id: "q-1",
          text: "Saved question text",
          order: 0,
          skill_tags: ["systems"],
          intent: "Check depth",
          reference_answer: "Saved answer",
          format: "voice",
          role: "assessment",
          difficulty: "baseline",
          estimated_duration_sec: null,
          stimulus: null,
          source: "base_manual",
          updated_at: "2026-09-04T00:02:00Z",
        },
      ],
      updated_at: "2026-09-04T00:02:00Z",
    });

    render(<VacancyWorkspace vacancyId="vac-1" />);

    const titleInput = await screen.findByDisplayValue(/backend engineer/i);
    fireEvent.change(titleInput, { target: { value: "Updated title" } });
    fireEvent.change(screen.getByDisplayValue(/original question text/i), {
      target: { value: "Saved question text" },
    });
    fireEvent.change(screen.getByLabelText(/reference answer/i), {
      target: { value: "Saved answer" },
    });
    fireEvent.change(screen.getByLabelText(/skill tags/i), {
      target: { value: "systems" },
    });
    fireEvent.change(screen.getByLabelText(/intent/i), {
      target: { value: "Check depth" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save vacancy/i }));

    await waitFor(() =>
      expect(updateRecruiterVacancy).toHaveBeenCalledWith(
        "token-1",
        "vac-1",
        expect.objectContaining({ title: "Updated title" }),
      ),
    );
    await waitFor(() =>
      expect(updateRecruiterVacancyQuestion).toHaveBeenCalledWith(
        "token-1",
        "vac-1",
        "q-1",
        expect.objectContaining({ text: "Saved question text", reference_answer: "Saved answer" }),
      ),
    );
    expect(await screen.findByText(/vacancy saved/i)).toBeInTheDocument();
  });

  it("adds a recruiter question and shows success feedback", async () => {
    vi.mocked(updateRecruiterVacancy).mockResolvedValue({
      ...recruiterVacancy,
      title: "Backend Engineer Updated",
      updated_at: "2026-09-04T00:00:30Z",
    });
    vi.mocked(addRecruiterVacancyQuestion).mockResolvedValue({
      ...recruiterVacancy,
      title: "Backend Engineer Updated",
      questions: [
        {
          id: "q-1",
          text: "Tell me about a migration",
          order: 0,
          skill_tags: null,
          intent: null,
          reference_answer: null,
          format: "voice",
          role: "assessment",
          difficulty: "baseline",
          estimated_duration_sec: null,
          stimulus: null,
          source: "base_manual",
          updated_at: "2026-09-04T00:01:00Z",
        },
      ],
      updated_at: "2026-09-04T00:01:00Z",
    });

    render(<VacancyWorkspace vacancyId="vac-1" />);

    fireEvent.change(await screen.findByDisplayValue(/backend engineer/i), {
      target: { value: "Backend Engineer Updated" },
    });
    fireEvent.change(await screen.findByPlaceholderText(/add a manual question/i), {
      target: { value: "Tell me about a migration" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add question/i }));

    await waitFor(() => expect(updateRecruiterVacancy).toHaveBeenCalled());
    await waitFor(() => expect(addRecruiterVacancyQuestion).toHaveBeenCalled());
    expect(addRecruiterVacancyQuestion).toHaveBeenCalledWith(
      "token-1",
      "vac-1",
      expect.objectContaining({ expected_updated_at: "2026-09-04T00:00:30Z" }),
    );
    expect(await screen.findByText(/question added/i)).toBeInTheDocument();
  });

  it("shows recruiter submit action and calls submit-for-review", async () => {
    vi.mocked(updateRecruiterVacancy).mockResolvedValue({
      ...recruiterVacancy,
      title: "Updated before submit",
      updated_at: "2026-09-04T00:00:45Z",
    });
    vi.mocked(submitRecruiterVacancy).mockResolvedValue({ ...recruiterVacancy, status: "submitted_for_review" });

    render(<VacancyWorkspace vacancyId="vac-1" />);

    fireEvent.change(await screen.findByDisplayValue(/backend engineer/i), {
      target: { value: "Updated before submit" },
    });
    fireEvent.click(await screen.findByRole("button", { name: /submit for review/i }));

    await waitFor(() => expect(updateRecruiterVacancy).toHaveBeenCalled());
    await waitFor(() =>
      expect(submitRecruiterVacancy).toHaveBeenCalledWith(
        "token-1",
        "vac-1",
        "2026-09-04T00:00:45Z",
      ),
    );
  });

  it("prefers expert mode for submitted vacancies and allows approval", async () => {
    vi.mocked(fetchExpertVacancy).mockResolvedValue(structuredClone(submittedVacancy));
    vi.mocked(approveExpertVacancy).mockResolvedValue({ ...submittedVacancy, status: "approved" });

    render(<VacancyWorkspace vacancyId="vac-1" />);

    fireEvent.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() => expect(approveExpertVacancy).toHaveBeenCalledWith(
      "token-1",
      "vac-1",
      expect.objectContaining({ expected_updated_at: submittedVacancy.updated_at }),
    ));
  });

  it("persists expert question edits before requesting changes", async () => {
    vi.mocked(fetchExpertVacancy).mockResolvedValue(structuredClone(submittedVacancy));
    vi.mocked(updateExpertVacancyQuestion).mockResolvedValue({
      ...submittedVacancy,
      updated_at: "2026-09-04T01:10:00Z",
      questions: [
        {
          ...submittedVacancy.questions[0],
          reference_answer: "Better answer",
          updated_at: "2026-09-04T01:10:00Z",
        },
      ],
    });
    vi.mocked(requestExpertVacancyChanges).mockResolvedValue({
      ...submittedVacancy,
      status: "changes_requested",
      updated_at: "2026-09-04T01:11:00Z",
      review_state: {
        ...submittedVacancy.review_state,
        status: "changes_requested",
        latest_review_comment: "Needs work",
      },
    });

    render(<VacancyWorkspace vacancyId="vac-1" />);

    fireEvent.change(await screen.findByLabelText(/reference answer/i), {
      target: { value: "Better answer" },
    });
    fireEvent.change(screen.getByLabelText(/review comment/i), {
      target: { value: "Needs work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /request changes/i }));

    await waitFor(() => expect(updateExpertVacancyQuestion).toHaveBeenCalled());
    await waitFor(() =>
      expect(requestExpertVacancyChanges).toHaveBeenCalledWith(
        "token-1",
        "vac-1",
        expect.objectContaining({ expected_updated_at: "2026-09-04T01:10:00Z", comment: "Needs work" }),
      ),
    );
  });
});
