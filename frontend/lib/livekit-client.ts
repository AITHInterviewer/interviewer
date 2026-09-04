/**
 * Медиатранспорт кандидат↔live-agent (T018) — specs/004-candidate-interview-flow,
 * research.md п.3, FR-012. Только аудио/видео — никакого control-трафика здесь (это
 * `control-channel.ts`, отдельный WS).
 */

import { Room, RoomEvent } from "livekit-client";

export type AgentPresence = "absent" | "present" | "speaking";

export class LiveKitSession {
  private readonly room = new Room();

  /** Публикует камеру/микрофон из уже полученного `DeviceCheck`-стрима — не запрашивает
   * `getUserMedia` повторно. */
  async connect(wsUrl: string, token: string, localStream: MediaStream): Promise<void> {
    await this.room.connect(wsUrl, token);
    for (const track of localStream.getTracks()) {
      await this.room.localParticipant.publishTrack(track);
    }
  }

  /** Индикация присутствия агента (US2, FR-014) — по наличию remote-участника и его
   * активной речи, не по семантике control-канала (это разные заботы, см. research.md п.3). */
  onAgentPresenceChange(callback: (presence: AgentPresence) => void): () => void {
    const emit = () => {
      const agentIsSpeaking = this.room.activeSpeakers.some((speaker) => !speaker.isLocal);
      const agentPresent = this.room.remoteParticipants.size > 0;
      callback(agentIsSpeaking ? "speaking" : agentPresent ? "present" : "absent");
    };

    this.room.on(RoomEvent.ParticipantConnected, emit);
    this.room.on(RoomEvent.ParticipantDisconnected, emit);
    this.room.on(RoomEvent.ActiveSpeakersChanged, emit);
    emit();

    return () => {
      this.room.off(RoomEvent.ParticipantConnected, emit);
      this.room.off(RoomEvent.ParticipantDisconnected, emit);
      this.room.off(RoomEvent.ActiveSpeakersChanged, emit);
    };
  }

  disconnect(): void {
    this.room.disconnect();
  }
}
