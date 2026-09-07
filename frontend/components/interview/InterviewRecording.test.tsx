import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InterviewRecording } from "@/components/interview/InterviewRecording";
import { loadManagedInterviewRecording } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  loadManagedInterviewRecording: vi.fn(),
}));

describe("InterviewRecording", () => {
  beforeEach(() => {
    vi.mocked(loadManagedInterviewRecording).mockResolvedValue(new Blob(["recording"], { type: "video/mp4" }));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:recording"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("starts closed and loads the protected recording only after opening", async () => {
    render(<InterviewRecording interviewId="interview-1" />);

    const disclosure = screen.getByText("Запись интервью").closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(loadManagedInterviewRecording).not.toHaveBeenCalled();

    disclosure!.open = true;
    fireEvent(disclosure!, new Event("toggle"));

    await waitFor(() => expect(loadManagedInterviewRecording).toHaveBeenCalledWith("interview-1"));
    await waitFor(() => expect(document.querySelector("video")).not.toBeNull());
    const video = document.querySelector("video") as HTMLVideoElement;
    expect(video).toHaveAttribute("src", "blob:recording");
    expect(video).toHaveAttribute("controls");
  });
});
