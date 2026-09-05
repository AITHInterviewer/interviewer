/**
 * Медиатранспорт кандидат↔live-agent (T018) — specs/004-candidate-interview-flow,
 * research.md п.3, FR-012. Только аудио/видео — никакого control-трафика здесь (это
 * `control-channel.ts`, отдельный WS).
 */

import { RemoteTrack, Room, RoomEvent, Track } from "livekit-client";

export type AgentPresence = "absent" | "present" | "speaking";

export class LiveKitSession {
  private readonly room = new Room();

  constructor() {
    // Без этого звук агента (TTS) долетает по WebRTC, но нигде не воспроизводится —
    // LiveKit сам ничего не проигрывает, `track.attach()` явно создаёт/возвращает
    // `<audio>`-элемент, который нужно вставить в DOM. Видео агента (если появится)
    // сюда не подключаем — эта фича его не показывает (только присутствие/речь, см.
    // onAgentPresenceChange).
    this.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach();
      el.style.display = "none";
      document.body.appendChild(el);
    });
    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
    });
  }

  /** Публикует камеру/микрофон из уже полученного `DeviceCheck`-стрима — не запрашивает
   * `getUserMedia` повторно. `speakerId` — устройство вывода, выбранное там же, если
   * браузер это поддерживает (см. `DeviceCheck.tsx`, `CAN_SELECT_OUTPUT_DEVICE`). */
  async connect(wsUrl: string, token: string, localStream: MediaStream, speakerId?: string | null): Promise<void> {
    await this.room.connect(wsUrl, token);
    for (const track of localStream.getTracks()) {
      // source: явно, иначе LiveKit публикует трек с source "unknown" (проверено вживую
      // логами livekit-server) — реальный найденный баг: агентский RoomIO по умолчанию
      // подписывается на входное аудио именно по source "microphone", трек с "unknown"
      // молча игнорируется на уровне VAD/STT, хотя транспортом до агента и долетает.
      await this.room.localParticipant.publishTrack(track, {
        source: track.kind === "audio" ? Track.Source.Microphone : Track.Source.Camera,
      });
    }
    if (speakerId) {
      await this.room.switchActiveDevice("audiooutput", speakerId).catch(() => {});
    }
  }

  /** Переключение устройства прямо во время звонка (как в Zoom/Meet) — LiveKit сам
   * заменяет опубликованный трек (camera/mic) или sinkId у уже подключённых audio-
   * элементов (speaker), без пересоздания соединения. */
  async switchDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    await this.room.switchActiveDevice(kind, deviceId);
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
