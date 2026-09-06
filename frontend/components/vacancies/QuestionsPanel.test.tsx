import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateVacancyQuestions } from "@/lib/auth";

import { QuestionsPanel } from "./QuestionsPanel";

vi.mock("@/lib/auth", () => ({
  addManagedQuestion: vi.fn(),
  deleteManagedQuestion: vi.fn(),
  generateVacancyQuestions: vi.fn(),
  regenerateManagedQuestion: vi.fn(),
  updateManagedQuestion: vi.fn(),
}));

describe("QuestionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a manager generate the initial question set", async () => {
    const onQuestionsChanged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(generateVacancyQuestions).mockResolvedValue({ questions: [] });

    render(
      <QuestionsPanel
        vacancyId="vacancy-1"
        questions={[]}
        canManage
        canEditContent
        onQuestionsChanged={onQuestionsChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать вопросы" }));

    await waitFor(() => expect(generateVacancyQuestions).toHaveBeenCalledWith("vacancy-1"));
    expect(onQuestionsChanged).toHaveBeenCalledOnce();
  });

  it("keeps generation unavailable in read-only mode", () => {
    render(
      <QuestionsPanel
        vacancyId="vacancy-1"
        questions={[]}
        canManage={false}
        canEditContent={false}
        onQuestionsChanged={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("button", { name: "Сгенерировать вопросы" })).not.toBeInTheDocument();
  });
});
