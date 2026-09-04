import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// В конфиге не включён `globals: true`, поэтому авто-cleanup из @testing-library/react
// сам не регистрируется — без этого DOM предыдущего теста утекает в следующий и
// queryBy*-проверки «элемента нет» ложно падают.
afterEach(() => {
  cleanup();
});
