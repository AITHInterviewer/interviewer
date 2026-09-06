"""`POST /api/v1/vacancies/extract-requirements` — разбор описания в требования
(specs/010-vacancy-from-description) и ошибки разбора приложенного файла.
"""

from __future__ import annotations

import pytest

from app.services.document_text import (
    DocumentTooLargeError,
    EmptyDocumentError,
    UnsupportedDocumentError,
    extract_pdf_text,
)
from app.services.vacancy_llm_service import (
    ExtractedRequirement,
    ExtractedVacancy,
    VacancyLLMService,
)
from tests.conftest import register_recruiter

_DESCRIPTION = "Middle+ Python Developer\nТребования:\n● Опыт работы с Python от 5 лет;"


def _patch_extract(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_extract(self, description: str) -> ExtractedVacancy:
        assert description.strip()
        return ExtractedVacancy(
            title="Python Developer",
            grade="middle_plus",
            requirements=[
                ExtractedRequirement(
                    name="Python", kind="must", level="expert", checked=True,
                    evidence="Опыт работы с Python от 5 лет",
                )
            ],
            excluded=[{"text": "Удалённая работа", "reason": "условия работы"}],
            warnings=["В заголовке Middle+, а Python требуется от 5 лет"],
        )

    monkeypatch.setattr(VacancyLLMService, "extract_requirements", fake_extract)


@pytest.mark.anyio
async def test_extract_from_pasted_text(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extract(monkeypatch)
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/vacancies/extract-requirements",
        headers={"Authorization": f"Bearer {token}"},
        data={"description": _DESCRIPTION},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Python Developer"
    assert payload["grade"] == "middle_plus"
    assert payload["description"] == _DESCRIPTION
    # id проставляет бэкенд, source — всегда llm для извлечённых.
    assert payload["requirements"] == [
        {
            "id": "req_0",
            "name": "Python",
            "kind": "must",
            "level": "expert",
            "checked": True,
            "evidence": "Опыт работы с Python от 5 лет",
            "source": "llm",
        }
    ]
    assert payload["warnings"]
    assert payload["excluded"][0]["reason"] == "условия работы"


@pytest.mark.anyio
async def test_extract_without_text_or_file_is_422(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extract(monkeypatch)
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/vacancies/extract-requirements",
        headers={"Authorization": f"Bearer {token}"},
        data={"description": "   "},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "empty_description"


@pytest.mark.anyio
async def test_extract_rejects_non_pdf_file(client, monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_extract(monkeypatch)
    token = await register_recruiter(client)

    response = await client.post(
        "/api/v1/vacancies/extract-requirements",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("vacancy.docx", b"PK\x03\x04 not a pdf", "application/pdf")},
    )

    # Content-type клиента врёт (application/pdf), решает сигнатура файла.
    assert response.status_code == 415
    assert response.json()["detail"] == "not_a_pdf"


def test_pdf_signature_is_what_decides() -> None:
    with pytest.raises(UnsupportedDocumentError):
        extract_pdf_text(b"PK\x03\x04 docx pretending to be pdf")


def test_oversized_file_is_rejected_before_parsing() -> None:
    with pytest.raises(DocumentTooLargeError):
        extract_pdf_text(b"%PDF-" + b"0" * (10 * 1024 * 1024 + 1))


def test_pdf_without_text_layer_reads_as_empty() -> None:
    """Скан — самый частый реальный случай: PDF валиден, текста в нём нет."""
    from io import BytesIO

    from pypdf import PdfWriter

    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buffer = BytesIO()
    writer.write(buffer)

    with pytest.raises(EmptyDocumentError):
        extract_pdf_text(buffer.getvalue())
