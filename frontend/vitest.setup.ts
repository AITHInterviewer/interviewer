import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// happy-dom не реализует matchMedia, а сайдбар shadcn спрашивает у него про
// мобильную ширину. Без заглушки падает любой тест, который рендерит AppShell.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// В конфиге не включён `globals: true`, поэтому авто-cleanup из @testing-library/react
// сам не регистрируется — без этого DOM предыдущего теста утекает в следующий и
// queryBy*-проверки «элемента нет» ложно падают.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
