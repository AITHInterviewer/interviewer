import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditorPanel } from "@/components/interview/CodeEditorPanel";
import type { ControlChannel } from "@/lib/control-channel";

// CodeMirror сам управляет своим DOM (contentEditable) — тестируем нашу обвязку
// (дебаунс, выбор языка, что отправляется в ControlChannel), не внутренности редактора,
// поэтому подменяем его простым <textarea> с тем же контрактом props (value/onChange).
vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea aria-label="Код" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock("@codemirror/lang-python", () => ({ python: () => [] }));
vi.mock("@codemirror/lang-javascript", () => ({ javascript: () => [] }));

function makeChannel() {
  return { sendCandidateInput: vi.fn() } as unknown as ControlChannel;
}

describe("CodeEditorPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("показывает текст задачи вместо видео-карточки вопроса", () => {
    const channel = makeChannel();
    render(
      <CodeEditorPanel
        questionId="q1"
        questionText="Напишите функцию, которая переворачивает строку."
        language="python"
        channel={channel}
        agentSubtitle={null}
        followUpText={null}
        agentPresence="present"
      />,
    );

    expect(screen.getByText("Напишите функцию, которая переворачивает строку.")).toBeInTheDocument();
    expect(screen.getByLabelText("Код")).toBeInTheDocument();
  });

  it("язык не выбирается, если задан вакансией (stimulus.language)", () => {
    const channel = makeChannel();
    render(
      <CodeEditorPanel
        questionId="q1"
        questionText="Задача"
        language="python"
        channel={channel}
        agentSubtitle={null}
        followUpText={null}
        agentPresence="present"
      />,
    );

    expect(screen.queryByLabelText("Язык программирования")).not.toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
  });

  it("показывает выбор языка, если он не задан вопросом, и подсветка не ломается без языка", () => {
    const channel = makeChannel();
    render(
      <CodeEditorPanel
        questionId="q1"
        questionText="Задача"
        language={null}
        channel={channel}
        agentSubtitle={null}
        followUpText={null}
        agentPresence="present"
      />,
    );

    const select = screen.getByLabelText("Язык программирования");
    expect(select).toBeInTheDocument();
    expect(screen.getByLabelText("Код")).toBeInTheDocument(); // редактор рендерится и без явного языка
  });

  it("отправляет код в ControlChannel с дебаунсом, одним сообщением на серию правок", () => {
    const channel = makeChannel();
    render(
      <CodeEditorPanel
        questionId="q1"
        questionText="Задача"
        language="python"
        channel={channel}
        agentSubtitle={null}
        followUpText={null}
        agentPresence="present"
      />,
    );

    const editor = screen.getByLabelText("Код");
    fireEvent.change(editor, { target: { value: "def f(" } });
    vi.advanceTimersByTime(500);
    fireEvent.change(editor, { target: { value: "def f():\n    pass" } });

    expect(channel.sendCandidateInput).not.toHaveBeenCalled(); // дебаунс ещё не истёк

    vi.advanceTimersByTime(1500);

    expect(channel.sendCandidateInput).toHaveBeenCalledTimes(1);
    expect(channel.sendCandidateInput).toHaveBeenCalledWith({
      question_id: "q1",
      input_format: "code",
      content: "def f():\n    pass",
    });
  });

  it("доп. вопрос агента приоритетнее обычного субтитра", () => {
    const channel = makeChannel();
    render(
      <CodeEditorPanel
        questionId="q1"
        questionText="Задача"
        language="python"
        channel={channel}
        agentSubtitle="Обычная реплика"
        followUpText="Подсказка: попробуйте с конца строки"
        agentPresence="speaking"
      />,
    );

    expect(screen.getByText("Подсказка: попробуйте с конца строки")).toBeInTheDocument();
    expect(screen.queryByText("Обычная реплика")).not.toBeInTheDocument();
  });
});
