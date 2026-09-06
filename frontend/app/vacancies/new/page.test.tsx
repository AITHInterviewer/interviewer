import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/vacancies/new",
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    loadLanding: vi.fn(),
    loadInternalUsers: vi.fn(),
    createManagedVacancy: vi.fn(),
    extractVacancyRequirements: vi.fn(),
    sendManagedVacancyToExpert: vi.fn(),
  };
});

import {
  createManagedVacancy,
  extractVacancyRequirements,
  loadInternalUsers,
  loadLanding,
  sendManagedVacancyToExpert,
} from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import NewVacancyPage from "./page";

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <NewVacancyPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const DESCRIPTION = "Middle+ Python Developer\nТребования: Python от 5 лет, PostgreSQL, Docker";

function requirement(id: string, name: string, checked = true) {
  return {
    id,
    name,
    kind: "must" as const,
    level: "confident" as const,
    checked,
    evidence: `«${name}»`,
    source: "llm" as const,
  };
}

const EXTRACTED = {
  title: "Python Developer",
  grade: "middle_plus",
  description: DESCRIPTION,
  description_file_name: null,
  requirements: [
    requirement("req_0", "Python"),
    requirement("req_1", "PostgreSQL"),
    requirement("req_2", "Docker"),
    requirement("req_3", "gRPC", false),
  ],
  excluded: [{ text: "Удалённая работа", reason: "условия работы" }],
  warnings: ["В заголовке Middle+, а Python требуется от 5 лет"],
};

const CREATED = {
  id: "v1",
  recruiter_id: "r1",
  title: "Python Developer",
  description: DESCRIPTION,
  grade: "middle_plus",
  required_skills: ["Python", "PostgreSQL", "Docker", "gRPC"],
  nice_to_have_skills: [],
  requirements: EXTRACTED.requirements,
  status: "extracted" as const,
  created_at: "2026-01-01T00:00:00Z",
  questions: [],
};

async function extractFromPastedText() {
  fireEvent.change(await screen.findByLabelText(/описание вакансии/i), {
    target: { value: DESCRIPTION },
  });
  fireEvent.click(screen.getByRole("button", { name: /извлечь требования/i }));
}

describe("NewVacancyPage", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    vi.mocked(createManagedVacancy).mockReset();
    vi.mocked(extractVacancyRequirements).mockReset();
    vi.mocked(sendManagedVacancyToExpert).mockReset();
    vi.mocked(loadInternalUsers).mockResolvedValue({ items: [] });
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Recruiter", email: "r@example.com", roles: ["recruiter"] } },
      landing: {
        roles: ["recruiter"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.recruiter_workspace", label: "Recruiter workspace", path: "/vacancies" }],
        available_actions: [],
      },
    });
  });

  it("redirects non-recruiters to their landing default path", async () => {
    vi.mocked(loadLanding).mockResolvedValue({
      session: { token: "token", user: { id: "1", name: "Expert", email: "e@example.com", roles: ["expert"] } },
      landing: {
        roles: ["expert"],
        default_path: "/vacancies",
        available_areas: [{ id: "area.expert_questions", label: "Expert workspace", path: "/vacancies" }],
        available_actions: ["action.questions.edit"],
      },
    });

    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/vacancies"));
  });

  it("не даёт извлекать требования из пустого описания", async () => {
    renderPage();

    const button = await screen.findByRole("button", { name: /извлечь требования/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/вставьте описание или приложите pdf/i)).toBeInTheDocument();
  });

  it("извлекает требования из вставленного текста и показывает предупреждения модели", async () => {
    vi.mocked(extractVacancyRequirements).mockResolvedValue(EXTRACTED);

    renderPage();
    await extractFromPastedText();

    await waitFor(() =>
      expect(extractVacancyRequirements).toHaveBeenCalledWith({ description: DESCRIPTION }),
    );
    // Название и грейд подставились из описания — руками их не вводили.
    expect(await screen.findByDisplayValue("Python Developer")).toBeInTheDocument();
    expect(screen.getByText(/python требуется от 5 лет/i)).toBeInTheDocument();
    // Отброшенное не потерялось.
    expect(screen.getByText(/не вошло в требования — 1/i)).toBeInTheDocument();
    expect(screen.getByText(/3 из 4 проверяем на интервью/i)).toBeInTheDocument();
  });

  it("создаёт вакансию с требованиями и отправляет её эксперту", async () => {
    vi.mocked(extractVacancyRequirements).mockResolvedValue(EXTRACTED);
    vi.mocked(createManagedVacancy).mockResolvedValue(CREATED);
    vi.mocked(sendManagedVacancyToExpert).mockResolvedValue(CREATED);

    renderPage();
    await extractFromPastedText();

    fireEvent.click(await screen.findByRole("button", { name: /отправить эксперту/i }));

    await waitFor(() =>
      expect(createManagedVacancy).toHaveBeenCalledWith({
        title: "Python Developer",
        description: DESCRIPTION,
        grade: "middle_plus",
        requiredSkills: [],
        niceToHaveSkills: [],
        requirements: EXTRACTED.requirements,
        descriptionSource: "text",
        descriptionFileName: null,
        expertId: null,
        hiringManagerId: null,
      }),
    );
    await waitFor(() => expect(sendManagedVacancyToExpert).toHaveBeenCalledWith("v1"));
    expect(await screen.findByText(/ушла эксперту на калибровку/i)).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vacancies/v1/rubric"));
  });

  it("блокирует отправку, пока проверяемых требований меньше трёх", async () => {
    vi.mocked(extractVacancyRequirements).mockResolvedValue({
      ...EXTRACTED,
      requirements: [requirement("req_0", "Python"), requirement("req_1", "PostgreSQL", false)],
    });

    renderPage();
    await extractFromPastedText();

    const send = await screen.findByRole("button", { name: /отправить эксперту/i });
    expect(send).toBeDisabled();
    expect(screen.getByText(/включите хотя бы 3 требования — сейчас 1/i)).toBeInTheDocument();
    expect(createManagedVacancy).not.toHaveBeenCalled();
  });

  it("объясняет скан по-человечески и не теряет описание", async () => {
    vi.mocked(extractVacancyRequirements).mockRejectedValue(new Error("pdf_no_text_layer"));

    renderPage();
    await extractFromPastedText();

    expect(await screen.findByText(/это скан: в файле нет текста/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/описание вакансии/i)).toHaveValue(DESCRIPTION);
  });
});
