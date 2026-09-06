import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/vacancies/v1",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href as string} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadVacancy: vi.fn(),
    loadInterviews: vi.fn(),
    loadAnonymizedStats: vi.fn(),
    generateVacancyQuestions: vi.fn(),
    createManagedInterview: vi.fn(),
    sendManagedVacancyToExpert: vi.fn(),
    activateManagedVacancy: vi.fn(),
    pauseManagedVacancy: vi.fn(),
    resumeManagedVacancy: vi.fn(),
  };
});

import { createManagedInterview, loadInterviews, loadLanding, loadVacancy } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { VacancyDetailClient } from "./vacancy-detail-client";

function renderClient(vacancyId: string) {
  return render(
    <ThemeProvider>
      <VacancyDetailClient vacancyId={vacancyId} />
    </ThemeProvider>,
  );
}

const baseVacancy = {
  id: "v1",
  recruiter_id: "r1",
  title: "Backend Developer",
  description: "Build things",
  grade: "middle",
  required_skills: ["python"],
  nice_to_have_skills: [],
  status: "draft" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [],
};

const createdInvite = {
  interview: {
    id: "i1",
    vacancy_id: "v1",
    candidate_name: "Lida",
    resume_file_url: "",
    access_token: "tok-abc",
    status: "invited",
    created_at: "2026-01-01T00:00:00Z",
  },
  candidate_link: "/i/tok-abc",
};

async function openInviteFormAndAttachResume() {
  vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "active" });
  vi.mocked(createManagedInterview).mockResolvedValue(createdInvite);
  renderClient("v1");
  fireEvent.click(await screen.findByRole("button", { name: /пригласить кандидата/i }));
  const resumeInput = await screen.findByLabelText(/резюме кандидата/i);
  fireEvent.change(resumeInput, {
    target: { files: [new File(["cv"], "resume.pdf", { type: "application/pdf" })] },
  });
  fireEvent.submit(screen.getByRole("button", { name: /подготовить ссылку/i }).closest("form")!);
  expect(await screen.findByLabelText(/ссылка для кандидата/i)).toHaveValue(
    `${window.location.origin}/i/tok-abc`,
  );
}

describe("VacancyDetailClient", () => {
  beforeEach(() => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });
    vi.mocked(loadVacancy).mockResolvedValue(baseVacancy);
    vi.mocked(loadInterviews).mockResolvedValue({ items: [] });
    vi.mocked(createManagedInterview).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables invite until the vacancy is active", async () => {
    renderClient("v1");

    expect(await screen.findByRole("heading", { name: /backend developer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /пригласить кандидата/i })).toBeDisabled();
  });

  it("enables the invite form once the vacancy is active", async () => {
    vi.mocked(loadVacancy).mockResolvedValue({ ...baseVacancy, status: "active" });

    renderClient("v1");

    await screen.findByRole("heading", { name: /backend developer/i });
    const invite = screen.getByRole("button", { name: /пригласить кандидата/i });
    expect(invite).not.toBeDisabled();

    // Форма живёт в модалке: до нажатия её на странице нет.
    expect(screen.queryByLabelText(/резюме кандидата/i)).not.toBeInTheDocument();
    fireEvent.click(invite);
    expect(await screen.findByLabelText(/резюме кандидата/i)).not.toBeDisabled();
  });

  it("hides recruiter-only invite for users without the recruiter area", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
      landing: {
        roles: ["expert"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }],
        available_actions: ["action.questions.edit"],
      },
    });

    renderClient("v1");

    await screen.findByRole("heading", { name: /backend developer/i });
    expect(screen.queryByRole("button", { name: /пригласить кандидата/i })).not.toBeInTheDocument();
  });

  it("does not claim nobody was invited when later-stage interviews exist", async () => {
    vi.mocked(loadVacancy).mockResolvedValue({
      ...baseVacancy,
      status: "active",
      questions: [
        {
          id: "q1",
          vacancy_id: "v1",
          interview_id: null,
          text: "Explain GIL",
          order: 0,
          skill_tag: ["python"],
          intent: "assess",
          reference_answer: "...",
          format: "voice",
          role: "assessment",
          difficulty: "baseline",
          estimated_duration_sec: 120,
          stimulus: null,
          source: "base_generated",
        },
      ],
    });
    vi.mocked(loadInterviews).mockResolvedValue({
      items: [
        {
          id: "i1",
          vacancy_id: "v1",
          candidate_name: "Lida",
          resume_file_url: "",
          access_token: "t",
          status: "completed",
          created_at: "2026-01-01T00:00:00Z",
          product_state: "report_ready",
        },
      ],
    });

    renderClient("v1");

    expect(await screen.findByText("Сейчас в этой стадии никого нет")).toBeInTheDocument();
    expect(screen.queryByText("Никого не пригласили")).not.toBeInTheDocument();
    expect(screen.queryByText("Никого ещё не приглашали")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /открыть lida/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /приостановить/i })).toBeInTheDocument();
  });

  it("does not claim the link was copied when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    await openInviteFormAndAttachResume();

    expect(screen.getByText(/ссылка создана\. отправьте её кандидату самостоятельно/i)).toBeInTheDocument();
    expect(screen.queryByText(/скопирован/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /скопировать ссылку/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/i/tok-abc`));
    expect(screen.queryByText(/скопирован/i)).not.toBeInTheDocument();
    expect(screen.getByText(/не удалось скопировать/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ссылка для кандидата/i)).toHaveValue(`${window.location.origin}/i/tok-abc`);
  });

  it("says the link was copied only after clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    await openInviteFormAndAttachResume();

    expect(screen.queryByText(/скопирован/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /скопировать ссылку/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/i/tok-abc`));
    expect(screen.getByText(/ссылка скопирована/i)).toBeInTheDocument();
  });
});
