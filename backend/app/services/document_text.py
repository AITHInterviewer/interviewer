"""Текст из приложенного файла описания вакансии (specs/010-vacancy-from-description).

Только PDF: рекрутёры приносят описание либо текстом, либо экспортом в PDF. Файл нигде не
сохраняем — забираем текст и отпускаем, в отличие от резюме кандидата (`storage.upload_resume`),
которое нужно эксперту целиком.
"""

from __future__ import annotations

import io

from pypdf import PdfReader

# Описание вакансии на 20 страницах — уже не описание. Режем, чтобы случайно приложенный
# многостраничный документ не уехал в LLM целиком.
MAX_PAGES = 20
MAX_CHARS = 60_000
MAX_FILE_BYTES = 10 * 1024 * 1024


class DocumentTooLargeError(Exception):
    """Файл больше MAX_FILE_BYTES."""


class UnsupportedDocumentError(Exception):
    """Не PDF."""


class EmptyDocumentError(Exception):
    """PDF без текстового слоя — обычно скан. Читать нечего, нужен ввод текстом."""


class UnreadableDocumentError(Exception):
    """PDF битый или зашифрован."""


def extract_pdf_text(data: bytes) -> str:
    if len(data) > MAX_FILE_BYTES:
        raise DocumentTooLargeError
    # Проверяем сигнатуру, а не расширение/content-type: и то и другое приходит от клиента.
    if not data.startswith(b"%PDF-"):
        raise UnsupportedDocumentError

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages[:MAX_PAGES]]
    except Exception as exc:  # noqa: BLE001 — pypdf кидает свои типы на каждый вид порчи
        raise UnreadableDocumentError(str(exc)) from exc

    text = "\n".join(pages).strip()
    if not text:
        raise EmptyDocumentError
    return text[:MAX_CHARS]
