import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";

function TestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Подтвердите действие" onClose={onClose}>
      <p>Текст предупреждения.</p>
      <ModalActions>
        <Button type="button" variant="secondary" data-modal-initial-focus onClick={onClose}>
          Отмена
        </Button>
        <Button type="button">Подтвердить</Button>
      </ModalActions>
    </Modal>
  );
}

describe("Modal", () => {
  it("closes on Escape and returns focus to the opener with initial focus on Отмена", async () => {
    const onClose = vi.fn();

    render(
      <>
        <button type="button">Открыть</button>
        <TestModal open onClose={onClose} />
      </>,
    );

    const opener = screen.getByRole("button", { name: "Открыть" });
    opener.focus();

    const dialog = await screen.findByRole("dialog", { name: /подтвердите действие/i });
    const cancel = within(dialog).getByRole("button", { name: /^отмена$/i });

    await waitFor(() => expect(cancel).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();

    render(<TestModal open onClose={onClose} />);

    const overlay = document.querySelector(".modal-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
