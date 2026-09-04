/**
 * Голосовой ввод/вывод mock-флоу: озвучка реплик агента и распознавание ответов
 * кандидата. Оба идут через backend-прокси (`/mock-interview/speak`,
 * `/mock-interview/transcribe`) — сами STT/TTS-контейнеры браузеру недоступны
 * (нет CORS и они не должны быть публичными).
 *
 * Это mock-путь. В боевой архитектуре (specs/004-candidate-interview-flow) звук идёт
 * через LiveKit room, а не HTTP-запросами на каждую реплику.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

/** Синтезирует реплику и дожидается конца воспроизведения. */
export async function speak(text: string): Promise<void> {
  if (!text.trim()) return;

  const response = await fetch(`${BACKEND_URL}/mock-interview/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`TTS ${response.status}`);

  const url = URL.createObjectURL(await response.blob());
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio playback failed"));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Распознаёт записанный ответ кандидата. Пустая строка — ничего внятного не услышали. */
export async function transcribe(audio: Blob): Promise<string> {
  // Сырое тело, не multipart: разбор форм на backend потребовал бы `python-multipart`,
  // которого нет в окружении (см. docstring эндпоинта `/mock-interview/transcribe`).
  const response = await fetch(`${BACKEND_URL}/mock-interview/transcribe`, {
    method: "POST",
    headers: { "Content-Type": audio.type || "audio/webm", "X-Audio-Filename": "answer.webm" },
    body: audio,
  });
  if (!response.ok) throw new Error(`STT ${response.status}`);

  const body = (await response.json()) as { text?: string };
  return (body.text ?? "").trim();
}
