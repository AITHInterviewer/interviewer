/** Передача брошенного на список вакансий файла в редактор.
 *
 * `File` нельзя положить в query, а глобального стора в проекте нет — поэтому файл едет
 * через sessionStorage в base64 и вычитывается один раз при монтировании редактора.
 */

export const DRAFT_FILE_KEY = "vacancy-draft-file";

type StoredFile = { name: string; type: string; data: string };

export async function storeDraftFile(file: File): Promise<void> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // Чанками, потому что String.fromCharCode(...массив на 10 МБ) переполняет стек аргументов.
  for (let offset = 0; offset < buffer.length; offset += 8192) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + 8192));
  }
  const payload: StoredFile = {
    name: file.name,
    type: file.type || "application/pdf",
    data: btoa(binary),
  };
  window.sessionStorage.setItem(DRAFT_FILE_KEY, JSON.stringify(payload));
}

export function readDraftFile(): File | null {
  const raw = window.sessionStorage.getItem(DRAFT_FILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const payload = JSON.parse(raw) as StoredFile;
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], payload.name, { type: payload.type });
  } catch {
    // Мусор в хранилище (обрезанная запись, чужой ключ) — просто открываем пустой редактор.
    return null;
  }
}
