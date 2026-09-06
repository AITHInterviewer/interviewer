import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VacancyDescription, vacancyDescriptionPreview } from "./VacancyDescription";

const LONG_DESCRIPTION =
  "Growth-менеджер с опытом запуска AI-функций карьерной платформы. Провёл CustDev и сформировал продуктовые гипотезы. " +
  "Спроектировал human-in-the-loop pipeline для извлечения и нормализации данных, координировал дизайн и разработку, а также отвечал за A/B-тесты и релиз продукта на большую аудиторию.";

describe("VacancyDescription", () => {
  it("shows a short beginning and opens the full description in a dialog", () => {
    const { preview } = vacancyDescriptionPreview(LONG_DESCRIPTION);
    render(<VacancyDescription title="AI Product Manager" description={LONG_DESCRIPTION} />);

    expect(screen.getByText(preview)).toBeInTheDocument();
    expect(screen.queryByText(LONG_DESCRIPTION)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Читать полностью" }));

    expect(screen.getByRole("dialog", { name: "Описание вакансии" })).toBeInTheDocument();
    expect(screen.getByText(LONG_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByText("AI Product Manager")).toBeInTheDocument();
  });

  it("does not offer a dialog for a short description", () => {
    const result = vacancyDescriptionPreview("Короткое описание вакансии.");
    expect(result).toEqual({ preview: "Короткое описание вакансии.", truncated: false });

    render(<VacancyDescription title="QA" description="Короткое описание вакансии." />);
    expect(screen.queryByRole("button", { name: "Читать полностью" })).not.toBeInTheDocument();
  });
});
