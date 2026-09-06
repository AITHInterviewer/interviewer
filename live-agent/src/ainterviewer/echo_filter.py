"""Эвристический фильтр акустического эха собственной TTS-речи — раздел 2 задачи
"live-interview quality pass" (2026-09-05).

Это НЕ диаризация (разделение говорящих по голосу/эмбеддингам) — на этом слое (после
STT, у нас только текст) её и не сделать так же дёшево, а LiveKit и так уже даёт
отдельный аудио-трек на участника, так что многосторонний перекрёстный разговор —
не наша проблема здесь. Проблема конкретнее: даже с поднятым порогом VAD и шумоподавлением
на фронтенде часть звука собственной TTS-реплики агента может дойти обратно до микрофона
кандидата (акустическое эхо) и быть распознана STT как "реплика кандидата" — что выглядит
как ложное прерывание и/или засоряет `last_text`, который уходит в LLM. Простейшая защита
без новой зависимости: сравнить текст "реплики кандидата" с последней собственной репликой
агента — если кандидат "сказал" по сути кусок того же самого текста, это, вероятно, эхо,
а не осознанная речь человека.
"""

from __future__ import annotations

import difflib
import re

_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def _normalize(text: str) -> str:
    return _PUNCT_RE.sub("", text.lower()).strip()


def is_likely_echo(candidate_text: str, last_agent_utterance: str, threshold: float = 0.7) -> bool:
    """Возвращает True, если `candidate_text`, вероятно, — эхо `last_agent_utterance`,
    а не самостоятельная реплика кандидата.

    Нормализует обе строки (нижний регистр, без пунктуации) и ищет самую длинную общую
    подстроку (`difflib.SequenceMatcher.find_longest_match`). Если она покрывает большую
    часть (>= `threshold`) нормализованного текста кандидата — считаем это эхом: кандидат
    "сказал" по сути кусок того, что только что произнёс агент.
    """
    agent_norm = _normalize(last_agent_utterance)
    candidate_norm = _normalize(candidate_text)
    if not candidate_norm or not agent_norm:
        return False

    matcher = difflib.SequenceMatcher(None, agent_norm, candidate_norm)
    match = matcher.find_longest_match(0, len(agent_norm), 0, len(candidate_norm))
    return match.size / max(len(candidate_norm), 1) >= threshold
