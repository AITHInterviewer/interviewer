# Блок 0. Переезд на VPS и перевод всего LLM/аудио на OpenRouter

Рабочий план с проверками на каждом шаге. Составлен по фактическому состоянию `main`
на 2026-09-06 (коммит `d2f204a`), а не по документации — все утверждения о текущем
поведении ниже проверены в коде и в сети.

## Решения, которые уже приняты

| Вопрос | Решение |
|---|---|
| GPU на VPS | Нет. Уезжаем в облачные API |
| Провайдер | Один ключ OpenRouter на всё: вопросы, оценка, live-контур, распознавание, голос |
| Машина | Уже существующий VPS «аутоматик». Новый сервер не заводим |
| Доступ к машине | SSH с рабочей машины Ильи уже настроен и работает |
| GitHub | Тот же аккаунт и тот же репозиторий `AITHInterviewer/interviewer` |
| Деплой | self-hosted GitHub Actions runner на самом VPS (Linux), workflow переписывается с PowerShell на bash |
| Адрес | Нормальный домен на 443, Let's Encrypt по HTTP-01 |

## Доступы: кто что делает

| Что | Кто | Когда |
|---|---|---|
| Ключ OpenRouter | **Илья добавляет сам** — в секреты репозитория как `OPENROUTER_API_KEY` и, для проверок Э0, в переменную окружения на своей машине | До Э0 |
| Лимит расходов в панели OpenRouter | Илья | До первого прогона живого интервью |
| SSH на VPS | уже есть | — |
| Регистрация runner'а на VPS | по тому же SSH, разово | Э1 |
| Домен и A-запись | Илья | До Э7 |

Ключ в переписке и в файлах репозитория не появляется: проверки Э0 читают его из
`$OPENROUTER_API_KEY`, деплой — из секретов GitHub. В `.env` он попадает только на
самой машине, в момент выполнения workflow.

## Что проверено фактами перед составлением плана

**У OpenRouter есть OpenAI-совместимые аудио-ручки.** Неизвестный путь
(`/api/v1/definitely/not/a/route`) отдаёт `404`, а `/api/v1/audio/transcriptions` —
`401` и `/api/v1/audio/speech` — `400`. Оба маршрута существуют и требуют ключ.
Форматы запроса, список допустимых `model` и поддержку параметра `prompt`
подтверждаем на этапе Э0 вашим ключом — этого без ключа проверить нельзя.

**В каталоге OpenRouter 431 модель.** Аудио на вход принимают 46, включая
`google/gemini-2.5-flash` (вход: text, image, audio, video, file; выход: text;
контекст 1 048 576; $0.30/$2.50 за млн токенов, аудио $0.10). Аудио на выход отдают
четыре: `openai/gpt-audio`, `openai/gpt-audio-mini` и две музыкальные Lyria.
Для голоса интервьюера кандидат один — `openai/gpt-audio-mini` ($0.60/$2.40, аудио $0.60).

**Текущий live-контур физически привязан к GPU.** В `live-agent/docker-compose.yml`
и `stt`, и `tts` объявляют `deploy.resources.reservations.devices: [gpu]`, а в шапке
файла зафиксировано измерение: whisper large-v3 на CPU даёт 20–30 секунд на реплику,
и именно это было причиной «агент перестал отвечать». На VPS без GPU эти два сервиса
не переезжают ни в каком виде.

**Веса TTS лежат на виндовом пути.** `C:\ai-interviewer-assets\fish-speech-1.5`
монтируется в контейнер `tts`. На Linux этого пути нет и не будет.

**Фронт в проде работает как `next dev`.** `docker-compose.dev.yml` поднимает frontend
с `target: dev` и командой `npm ci && npm run dev`, при том что `frontend/Dockerfile`
уже содержит готовые стадии `build` и `runner` с `NODE_ENV=production`. Это первый
подозреваемый по пункту «медленно грузится»: dev-сервер Next компилирует каждый
маршрут при первом заходе.

---

## Э0. Проверка ключа до всякого переезда

Делается на ноутбуке за десять минут, не требует VPS. Смысл — узнать про несовместимость
раньше, чем под неё будет переписан деплой.

Ключ добавляет Илья. Для проверок ниже — в переменную окружения текущей сессии,
не в файл репозитория:

```bash
export OPENROUTER_API_KEY='<ключ>'
```

Параллельно тот же ключ кладётся в GitHub → Settings → Secrets and variables → Actions
как `OPENROUTER_API_KEY` (репозиторий тот же, `AITHInterviewer/interviewer`) — оттуда
его читает деплой на этапе Э2.

### Э0.1. Чат-модель и структурированный ответ

Оба серверных сервиса (`backend/app/services/vacancy_llm_service.py`,
`evaluation_service.py`) требуют строгий JSON и сами снимают ```-обёртку
(`_strip_code_fence`). Проверяем, что gemini отдаёт разбираемый JSON:

```bash
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemini-2.5-flash","messages":[{"role":"user","content":"Верни строго JSON без пояснений: {\"ok\":true,\"lang\":\"ru\"}"}]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])"
```

**Ожидаем:** чистый JSON-объект. Если модель оборачивает его в ```-блок — это
нормально, `_strip_code_fence` уже это умеет.

### Э0.2. Распознавание речи

```bash
say -o /tmp/probe.aiff "Расскажите про задачу, где асинхронность реально что-то дала" 2>/dev/null \
  || echo "на Linux: espeak-ng -w /tmp/probe.wav 'тестовая фраза'"
ffmpeg -y -i /tmp/probe.aiff /tmp/probe.mp3

curl -s https://openrouter.ai/api/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -F file=@/tmp/probe.mp3 \
  -F model=whisper-1 \
  -F language=ru
```

**Ожидаем:** `{"text": "..."}` с узнаваемой русской фразой.

**Если `model=whisper-1` не принят** — перебрать по очереди `openai/whisper-1`,
`openai/gpt-4o-transcribe`, `google/gemini-2.5-flash`. Записать в этот файл тот id,
который сработал: от него зависит `STT_MODEL` в Э3.

**Если ручка не подойдёт совсем** — запасной путь есть и он проверен по каталогу:
`google/gemini-2.5-flash` принимает аудио прямо в `chat/completions` через
`input_audio`-часть сообщения. Тогда вместо `lk_openai.STT` пишется свой класс STT
на 40 строк поверх chat-ручки. Это плюс день работы, не блокер.

Отдельно проверить `prompt`: сейчас `agent.py` передаёт в STT словарь терминов вакансии
(`_build_stt_prompt`, до 800 символов) и обновляет его на каждом вопросе. Если
OpenRouter параметр не принимает — подсказки терминов теряются, качество распознавания
технических слов падает. Не блокер, но зафиксировать как регресс.

### Э0.3. Синтез речи

```bash
curl -s https://openrouter.ai/api/v1/audio/speech \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-audio-mini","input":"Здравствуйте! Давайте начнём интервью.","voice":"alloy"}' \
  --output /tmp/tts.mp3
ffprobe /tmp/tts.mp3
```

**Ожидаем:** файл в несколько десятков килобайт, `ffprobe` показывает длительность.
Послушать: русская речь без грубой транслитерации английских терминов — ровно та
проблема, из-за которой в своё время отказались от Piper.

### Э0.4. Задержка

Замерить `time` на Э0.2 и Э0.3 для реплики в 5–10 секунд. Бюджет живого разговора —
единицы секунд на полный круг STT → LLM → TTS.

**Порог приёмки:** STT ≤ 2 с, LLM ≤ 2 с, TTS ≤ 2 с на короткую фразу. Если суммарно
выходит за 6–7 секунд — кандидат воспримет это как зависание, и надо либо брать более
быструю модель, либо возвращаться к разговору про GPU.

**Итог Э0 (прогон 2026-09-06, ключ из сессии, не из репозитория):**

| Роль | Рабочий `model` | Задержка | Заметки |
|---|---|---|---|
| Чат / JSON | `google/gemini-2.5-flash` | 0.9–1.3 с | JSON в ````json`-обёртке — `_strip_code_fence` это уже снимает |
| STT | `whisper-1` | 1.3 с | Ручка `/audio/transcriptions` приняла этот id с первого раза |
| TTS | `fish-audio/s1` (основной) | 1.1 с на короткую фразу | MP3, русский нормальный, `REST API` / `Docker Compose` без транслитерации |
| TTS запас | `google/gemini-3.1-flash-tts-preview` voice `Kore` | 2.3 с короткая / 4.4–5.3 с длинная | Только `response_format=pcm` 24 kHz; качество речи тоже хорошее |

Порог «короткая фраза ≤ 2 с» по STT и LLM выполняется. По TTS — у Fish да, у Gemini на грани / выше. Сумма круга с Fish ≈ 1.3 + 1.3 + 1.1 ≈ **3.7 с**, в бюджет 6–7 с укладываемся. С Gemini TTS на длинной реплике сумма уходит за 8 с.

Что не сработало и не брать в Э3:

- `openai/gpt-audio-mini` и `openai/gpt-4o-mini-tts-2025-12-15` на `/audio/speech` — «model does not exist». `gpt-audio-mini` в каталоге есть, но это chat-модель с аудио, не speech-ручка.
- `hexgrad/kokoro-82m` отвечает быстро, но русский — транслит в стиле Piper. Браковать.
- Параметр `prompt` у STT **принимается** (HTTP 200), но словарь терминов **не помог**: FastAPI/Redis/PostgreSQL всё равно вышли как «фастапи, радис и поустгрызку». Регресс качества технических слов фиксируем, не блокер.

Риск Fish: один повторный запрос на длинную фразу занял **45 с** вместо 1–2 с (похоже на холодный старт провайдера). Если на живом интервью повторится — переключаемся на Gemini TTS и миримся с PCM.

---

## Э1. Машина

Сервер уже есть — VPS «аутоматик», SSH с рабочей машины настроен. Значит этап
начинается не с покупки, а со сверки: подходит ли то, что есть, под нагрузку.

### Что проверить на существующей машине первым делом

```bash
ssh <хост>
lsb_release -a                 # дистрибутив и версия
nproc && free -g && df -h /    # ядра, память, диск
docker version 2>/dev/null || echo "docker не установлен"
sudo ss -tulpn | grep -E ':(80|443|7881|5349) '   # заняты ли нужные порты
curl -s ifconfig.me            # публичный IP — сверить с тем, что ждём
```

Отдельно — не сидит ли на машине что-то ещё. Если «аутоматик» уже занят другим
проектом, надо заранее знать, кто держит 80 и 443: с ними придётся делить вход
или разносить по разным адресам. Порты 3901–3908 из пула проекта тоже проверить
на конфликт.

### Требования, под которые сверяем

- Ubuntu 22.04 или 24.04 LTS.
- 4 vCPU, 8 ГБ RAM минимум. Постоянно крутятся postgres, redis, minio, livekit-server,
  livekit-egress, nginx, backend, frontend, live-agent — восемь контейнеров.
- 60 ГБ диска: образы, записи интервью в MinIO, база.
- Открытые порты: 80 и 443 (TCP), 7881 (TCP, ICE-fallback LiveKit), 5349 (TCP, TURN/TLS),
  50000–50100 (UDP, медиа LiveKit).
- Публичный IP без NAT. LiveKit публикует ICE-кандидаты по внешнему адресу; за NAT
  без проброса медиа не пойдёт.

### Установка

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # перелогиниться
```

**Проверка:**

```bash
docker run --rm hello-world && docker compose version
```

### Runner

Ставится по тому же SSH, который уже работает — отдельная сессия не нужна.
Аккаунт GitHub и репозиторий те же, что сейчас: `AITHInterviewer/interviewer`,
так что старый раннер на Windows после переключения можно снять с регистрации
там же в Settings → Actions → Runners.

Отдельный непривилегированный пользователь, репозиторий → Settings → Actions → Runners →
New self-hosted runner (Linux x64), затем:

```bash
sudo ./svc.sh install && sudo ./svc.sh start && sudo ./svc.sh status
```

**Проверка:** в Settings → Actions → Runners раннер в статусе Idle. Пробный workflow
с одним шагом `run: docker compose version` проходит.

Запасной вариант, если с раннером что-то не заладится: раз SSH на машину уже есть,
деплой можно временно делать обычным `ubuntu-latest`, который ходит по SSH и запускает
там `docker compose`. Нужен только deploy-ключ в секретах. Как основной способ не берём —
это лишний слой поверх того, что и так работает, — но как аварийный выход он доступен
сразу, ничего дополнительно поднимать не надо.

### Папка проекта

```bash
sudo mkdir -p /srv/ainterviewer && sudo chown $USER:$USER /srv/ainterviewer
git clone git@github.com:AITHInterviewer/interviewer.git /srv/ainterviewer
```

Runner работает из своей `_work`-директории; `/srv/ainterviewer` — для ручных
операций и разбора инцидентов.

---

## Э2. Секреты и переменные

### Секреты репозитория

| Секрет | Было | Стало |
|---|---|---|
| `OPENROUTER_API_KEY` | общий ключ, бесплатные модели | **ваш платный ключ** |
| `ANTHROPIC_API_KEY` | live-контур | удалить |
| `ANTHROPIC_BASE_URL` | live-контур | удалить |
| `MISTRAL_API_KEY` | откачено 2026-09-06 | удалить |
| `DUCKDNS_TOKEN` | DNS-01 для TLS | удалить, переходим на HTTP-01 |
| `TLS_DOMAIN` | `ainterviewer.duckdns.org` | новый домен |

### Переменные деплоя

| Переменная | Было | Стало | Где |
|---|---|---|---|
| `PUBLIC_HTTP_PORT` | `12345` | `443` | `infra/docker-compose.yml` |
| `PUBLIC_FRONTEND_URL` | `https://ainterviewer.duckdns.org:12345` | `https://<домен>` | `backend/.env` |
| `LIVEKIT_WS_URL` | `wss://ainterviewer.duckdns.org:12345` | `wss://<домен>` | `backend/.env` |
| `S3_PUBLIC_ENDPOINT_URL` | `http://26.67.31.6:3903` | `https://<домен>/s3` | `backend/.env` |
| `OPENROUTER_MODEL` | `minimax/minimax-m3:free` | `google/gemini-2.5-flash` | `backend/.env`, `live-agent/.env` |
| `LLM_PROVIDER` | `anthropic_api` | `openrouter` | `live-agent/.env` |
| `STT_BASE_URL` | `http://stt:8000/v1` | `https://openrouter.ai/api/v1` | `live-agent/.env` |
| `TTS_BASE_URL` | `http://tts:8080` | `https://openrouter.ai/api/v1` | `live-agent/.env` |
| `STT_API_KEY` / `TTS_API_KEY` | `not-needed` | ключ OpenRouter | `live-agent/.env` |
| `LIVEKIT_API_SECRET` | `secret` (dev-ключ) | случайный 32+ символа | `backend/.env`, `infra/livekit.yaml`, `live-agent/.env` |
| `SECRET_KEY` | `dev-secret-change-me` | случайный | `backend/.env` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `ainterviewer` / `ainterviewer123` | случайные | `backend/.env`, `infra/docker-compose.yml` |

**Про `S3_PUBLIC_ENDPOINT_URL`.** Сейчас там прибит VPN-адрес раннера с портом 3903.
На VPS наружу будет открыт только 443, поэтому MinIO надо либо завести за nginx
отдельным `location /s3/`, либо отдавать записи через backend. Первое проще: один
`location` с `proxy_pass http://minio:9000/` и увеличенным `client_max_body_size`.

**Про dev-ключи.** `devkey`/`secret` для LiveKit и `ainterviewer`/`ainterviewer123`
для MinIO прямо помечены в `infra/README.md` как «ни в коем случае не для прода».
На машине с публичным IP это уже не формальность: с этими ключами кто угодно
выпускает токены в ваши комнаты и читает записи интервью. Меняем на этапе переезда,
не «потом».

**Проверка этапа:**

```bash
grep -rn "26\.67\.31\.6\|duckdns\|devkey\|ainterviewer123\|dev-secret" \
  .github/workflows/ infra/ backend/.env.example frontend/.env.example
```

Пусто по всем, кроме комментариев в `.env.example`, где это подписано как локальный дефолт.

---

## Э3. Аудио-стек: снять с GPU, перевести на OpenRouter

### Э3.1. Удалить self-hosted сервисы

`live-agent/docker-compose.yml`: убрать сервисы `stt` и `tts` целиком, вместе с
`deploy.resources`, томом `stt-cache` и монтированием `C:\ai-interviewer-assets\`.
У сервиса `live-agent` убрать `depends_on: [stt, tts]` и блок `environment`
с `STT_BASE_URL`/`TTS_BASE_URL` — он переопределяет `.env` и уже был причиной
трёхдневного молчаливого `ConnectionRefusedError` (зафиксировано в комментарии там же).

`evaluation-agent` из деплоя убрать полностью: его воркер падает на
`NotImplementedError` (сказано в его README), а поднимался только ради `stt-accurate`
на CPU с той самой моделью large-v3-turbo. Оценка теперь живёт в
`backend/app/services/evaluation_service.py` и ходит в OpenRouter.

Заодно из `live-agent/Dockerfile` уходит установка `claude` CLI, а из compose —
монтирование `${CLAUDE_CONFIG_DIR}:/root/.claude`: провайдер по подписке больше
не используется, и это снимает разовый интерактивный `claude login` на хосте,
описанный в шапке `deploy-full.yml` как обязательный шаг.

### Э3.2. Перенастроить STT

`STT_BASE_URL`, `STT_API_KEY` и `STT_MODEL` — это чистая замена переменных:
`agent.py` строит `lk_openai.STT(base_url=..., api_key=..., model=..., language=..., prompt=...)`,
плагин сам ходит в `{base_url}/audio/transcriptions`.

Сохранить `STT_LANGUAGE=ru`. У плагина дефолт `"en"`, и без явного `ru` сервер честно
транскрибирует русскую речь как английскую — уже пойманный баг, комментарий стоит
в `agent.py` рядом.

### Э3.3. Перенастроить TTS — здесь нужен код, не переменные

Сейчас голос идёт через `fishaudio.TTS`, а это протокол Fish Speech
(`POST {base_url}/v1/tts`, `voice_id` — папка с референсным сэмплом), не OpenAI.
Переменной его на OpenRouter не переключить. Меняем на `lk_openai.TTS` с
`model`/`voice`.

Обёртку `lk_tts.StreamAdapter` **сохранить**. Она стоит там из-за конкретного
пойманного отказа: плагин жёстко объявляет `capabilities.streaming=True`, фреймворк
зовёт `tts.stream()`, а WS-эндпоинт существовал только в облаке. Проверить, нужна ли
она для `lk_openai.TTS`; если нет — убирать отдельным коммитом, чтобы регресс был
виден по истории.

**Проверка Э3:** `python scripts/simulate.py` (или `console`-режим агента) проходит
один вопрос от приветствия до ответа. В логах нет обращений к `stt:8000` и `tts:8080`.
`docker compose ps` показывает один контейнер `live-agent` вместо трёх.

---

## Э4. LLM на Gemini 2.5 Flash

Три места, все — одно значение:

1. `backend/app/services/vacancy_llm_service.py:31` — `DEFAULT_MODEL = "minimax/minimax-m3:free"`.
2. `backend/app/services/evaluation_service.py:37` — то же самое.
3. `live-agent/src/ainterviewer/llm_client.py:227` — дефолт в `OpenRouterLiveControlLLM`.

Константы поменять на `google/gemini-2.5-flash` и продолжать читать `OPENROUTER_MODEL`
из окружения, как сейчас. `LLM_PROVIDER=openrouter` в `live-agent/.env` — ветка уже
есть в `agent.py`, писать её не надо.

Оставить как есть: чтение `OPENROUTER_API_KEY` внутри `_complete`, а не в `__init__`.
Это осознанное решение с комментарием — при eager-чтении любой запрос падал бы
на импорте, если ключ не задан.

**Проверка Э4:**

```bash
cd backend && python -m pytest tests/ -q
cd ../live-agent && python -m pytest tests/ -q
```

Затем вживую: создать вакансию с описанием, дождаться сборки вопросов, убедиться,
что вопросы на русском и осмысленные, а не заглушка.

---

## Э5. Фронт в продакшн-режим

Скорее всего это и есть «медленно грузится». Сейчас деплой поднимает
`target: dev` + `npm ci && npm run dev`: Next компилирует маршрут при первом заходе,
а `npm ci` выполняется на каждом старте контейнера.

В `frontend/Dockerfile` стадии `build` и `runner` уже написаны и не используются.
Нужно:

1. В компоуз-файле для VPS поставить `target: runner`, убрать `command`, убрать
   монтирование `./frontend:/app` и тома `frontend-node-modules` / `frontend-next`
   (в проде они бессмысленны и как раз они ломали деплой при добавлении зависимости —
   комментарий об этом стоит в `docker-compose.dev.yml`).
2. `NEXT_PUBLIC_BACKEND_URL` пробросить **на этапе сборки**, а не в рантайме:
   переменные с префиксом `NEXT_PUBLIC_` вшиваются в бандл во время `npm run build`.
   Сейчас `lib/api.ts` умеет падать обратно на `window.location.origin`, так что при
   пустом значении фронт всё равно попадёт в nginx на том же домене — но лучше задать явно.
3. `docker-compose.dev.yml` не трогать: он остаётся локальным quickstart из корневого README.

**Проверка Э5:**

```bash
docker compose logs frontend | head -20          # ожидаем "Ready in ..." без компиляции маршрутов
time curl -s -o /dev/null -w "%{time_total}\n" https://<домен>/vacancies
```

Второй и третий заход должны укладываться в десятые доли секунды. Если после этого
всё ещё медленно — измерять дальше по Э8.

---

## Э6. Деплой-workflow: Windows → Linux

`.github/workflows/deploy-full.yml`, 468 строк, целиком на PowerShell. Что уходит:

- `defaults.run.shell: powershell` → `bash`.
- Шаг «Reserve livekit UDP port range from Windows dynamic allocation» (`netsh`) — не нужен.
- Шаг «Ensure firewall rules for all service ports» (`New-NetFirewallRule`) → `ufw`,
  и один раз руками, а не на каждый деплой.
- Все `Set-Content`/`Add-Content` для `.env` → heredoc'и.
- `host.docker.internal` → имена сервисов внутри `ainterviewer-net`.
- Шаги подъёма `evaluation-agent` — удалить (см. Э3.1).
- `clean: false` в checkout **сохранить**: он стоит там, чтобы `git clean -ffdx`
  не сносил `infra/tls/` с выписанным сертификатом. Это была реальная причина
  упирания в лимит Let's Encrypt 5 сертификатов на 168 часов.

Что сохранить дословно:

- Три отдельных вызова `docker compose` вместо одного со склейкой `-f`. Причина
  подробно расписана в шапке файла: при мульти-file compose относительные пути
  резолвятся от директории первого `-f` для всех файлов сразу.
- `--project-directory .` там, где он стоит: `infra/docker-compose.yml` ссылается
  на `./infra/livekit.yaml` и `./infra/nginx/nginx.conf` относительно корня репозитория.
- Создание сети `ainterviewer-net` до `up` обоих проектов.
- Шаги ожидания здоровья backend, minio, livekit-server.

**Проверка Э6:** workflow проходит целиком, `docker compose ps` показывает все
контейнеры в `running`/`healthy`, шаг «Report container status» не содержит `Exited`.

---

## Э7. Домен и TLS

Порты 80 и 443 на VPS свободны, поэтому вся конструкция с DuckDNS DNS-01 не нужна.

1. A-запись домена на IP VPS. Проверка: `dig +short <домен>` возвращает нужный адрес.
2. Сервис `acme` в `infra/docker-compose.yml` переводится с `dns_duckdns` на
   `--standalone` по 80 порту либо на webroot через nginx. Том `acme-state` **сохранить**:
   без него acme.sh каждый деплой начинает с нуля и перевыпускает сертификат — та же
   история с лимитом.
3. `infra/nginx/nginx.conf`: добавить `server_name <домен>`, оставить `listen 443 ssl`,
   добавить редирект с 80. Пути к сертификату (`/etc/ainterviewer-tls/fullchain.pem`)
   не меняются.
4. `infra/livekit.yaml`: `node_ip` — публичный IP VPS; TURN на 5349 читает тот же
   сертификат.
5. Добавить `location /s3/` для MinIO (см. Э2).

### Подводные камни — не про HTTP-01, а про переезд на 443

Сам по себе способ выписки на WebRTC не влияет: HTTP-01 и DNS-01 дают одинаковый
сертификат от одного CA, разница только в том, как он проверяет владение доменом.
Медиа вообще идёт мимо TLS — SRTP по UDP 50000–50100 напрямую на публичный IP,
со своим шифрованием через DTLS-SRTP. А вот это поймать легко:

1. **Продление.** HTTP-01 требует свободный 80 порт в момент проверки, а nginx будет
   держать на нём редирект — `--standalone` там не поднимется. Нужен webroot: acme.sh
   кладёт файл в `.well-known/acme-challenge/`, nginx отдаёт его отдельным `location`.
   Заложить сразу, иначе деплой встанет через 60 дней в самый неудобный момент.
2. **livekit-server не перечитывает сертификат.** После продления контейнер надо
   перезапустить, иначе TURN/TLS продолжит отдавать протухший. Сейчас это замаскировано
   тем, что деплой каждый раз пересоздаёт всё целиком.
3. **UDP всё равно нужен.** 443 не заменяет диапазон 50000–50100/udp. Забыть открыть
   его в `ufw` или нарваться на провайдера, который режет UDP, — самая частая причина
   «сертификат валидный, а звука нет».
4. **`domain:` в turn-блоке.** В шаге workflow там захардкожен `ainterviewer.duckdns.org`.
   Не поменять на новый домен — TURN представится чужим именем, и клиент отвергнет
   соединение по несовпадению с сертификатом.

Что при этом станет лучше: уйдёт Radmin VPN и прибитый `node_ip: 26.67.31.6`.
В `infra/livekit.yaml` записано, почему сейчас нельзя `use_external_ip: true` — STUN
находил настоящий публичный IP хоста, а браузер кандидата шёл через VPN, две разные
сети. На VPS адрес один, и эта причина исчезает.

**Проверки:**

```bash
curl -sI https://<домен>/ | head -3                      # 200, TLS без предупреждений
curl -s https://<домен>/api/v1/health                    # {"status":"ok"}
curl -sI http://<домен>/ | grep -i location              # редирект на https
echo | openssl s_client -connect <домен>:5349 2>/dev/null | grep -i "verify return"
sudo ufw status | grep -E '50000:50100/udp|5349|443|80'  # порты действительно открыты
```

Отдельно — принудительное продление вхолостую, до того как срок реально подойдёт:

```bash
docker compose run --rm acme --renew -d <домен> --force
docker compose restart livekit-server nginx
```

Отдельно — в браузере: страница открывается без предупреждения о сертификате.
Без этого микрофон и LiveKit работать не будут, `getUserMedia` требует secure context.

---

## Э8. Пункт 5: не работает создание вакансии

Контракт я проверил: `backend/app/routers/vacancies.py:77` принимает `POST` и передаёт
`payload.expert_id` и `payload.hiring_manager_id` в сервис, а фронт
(`frontend/lib/auth.ts:206`, `createManagedVacancy`) шлёт ровно эти поля. Схемы совпадают,
дело не в них. Порядок диагностики после переезда:

1. DevTools → Network на `/vacancies/new`. Запрос вообще уходит?
   - **Нет запроса** — падает раньше: смотреть Console, скорее всего исключение
     в обработчике формы.
   - **CORS или неверный хост** — `NEXT_PUBLIC_BACKEND_URL` собран с прошлым адресом
     (см. Э5: значение вшивается на сборке).
   - **404 на `/api/v1/vacancies`** — nginx не проксирует `/api/`; проверить
     `location /api/` и что апстрим резолвится.
   - **401** — токен сессии; проверить `localStorage.ainterviewer-auth` и `/api/v1/auth/me`.
   - **422** — тело запроса; сравнить с моделью в роутере.
   - **500** — `docker compose logs backend --tail 100`.
2. Контрольный вызов в обход фронта:

```bash
TOKEN=$(curl -s https://<домен>/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST https://<домен>/api/v1/vacancies \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Тест","description":"Проверка","grade":"middle","required_skills":["Python"],"nice_to_have_skills":[]}' -i | head -20
```

Если curl создаёт вакансию, а фронт нет — проблема на фронте. Если и curl не создаёт —
ответ покажет, на чём именно.

3. Отдельно проверить вторую половину: `POST /api/v1/vacancies/{id}/questions/generate`.
   Сборка вопросов уже разведена с созданием (`frontend/app/vacancies/new/page.tsx:85-113`),
   и при её падении вакансия остаётся созданной, а пользователь видит warning-тост.
   Это значит, что «создание не работает» может на самом деле означать «упала генерация» —
   различить по тосту.

---

## Э9. «Медленно грузится»: что именно мерить

После Э5 половина проблемы, скорее всего, уйдёт. Оставшееся разложить по слоям:

| Что мерим | Команда | Порог |
|---|---|---|
| Отдача HTML | `curl -w "%{time_total}" -o /dev/null https://<домен>/vacancies` | < 0.5 с со второго захода |
| API списка | `curl -w "%{time_total}" -o /dev/null -H "Authorization: Bearer $TOKEN" https://<домен>/api/v1/vacancies` | < 0.3 с |
| Генерация вопросов | по логам backend от запроса до ответа | 10–40 с, это нормально для LLM |
| Оценка интервью | там же | до минуты |

Если API медленный — смотреть в сторону N+1-запросов и индексов. Если медленный
только LLM — это не «тормозит сайт», это ожидание модели, и лечится показом честного
прогресса в интерфейсе, а не оптимизацией.

---

## Сквозная приёмка

По порядку, каждый пункт — вручную на живом стенде:

1. `https://<домен>` открывается, сертификат валиден, порт в адресе не нужен.
2. Вход рекрутером, меню строится по `/api/v1/internal-users/me/landing`.
3. Создание вакансии с описанием → вакансия появилась в списке.
4. Сборка вопросов → пять вопросов на русском, с тегами навыков.
5. Отправка эксперту, вход экспертом, утверждение комплекта.
6. Создание приглашения, ссылка копируется.
7. Открытие ссылки кандидатом в другом браузере: согласие, доступ к камере
   и микрофону, вход в комнату.
8. **Интервьюер заговорил** — TTS через OpenRouter работает.
9. Ответ голосом → агент задал следующий вопрос — STT и LLM работают.
10. Завершение интервью, `product_state` дошёл до `report_ready`.
11. Отчёт у рекрутера: `report_json` с вердиктами по навыкам, а не пустая карта покрытия.
12. Запись интервью воспроизводится (Egress + MinIO через nginx).
13. В биллинге OpenRouter видны три типа вызовов: чат, транскрипция, синтез.
14. `docker compose ps` — ни одного контейнера в `Restarting`.
15. Перезагрузка VPS: `docker compose ps` через две минуты — всё поднялось само.

Пункт 15 отдельно: у сервисов должен стоять `restart: unless-stopped`, сейчас он
не задан нигде.

---

## Риски

**Задержка живого контура.** Три сетевых похода в облако вместо трёх локальных вызовов
на GPU. Это главный риск переезда, и он меряется на Э0.4 до всякой работы. Если
не укладываемся — либо более быстрая модель, либо GPU-инстанс под один только
live-контур.

**Формат аудио-ручек OpenRouter.** Маршруты существуют, поведение не проверено.
Запасной путь (аудио в chat/completions к gemini) есть и подтверждён каталогом.

**Потеря STT-подсказок.** Словарь терминов вакансии сейчас передаётся в whisper
и обновляется на каждом вопросе. Если OpenRouter не примет `prompt` — распознавание
технических слов ухудшится. Проверяется на Э0.2.

**Голос.** `openai/gpt-audio-mini` — единственный реальный кандидат на речь в каталоге.
Если русский с английскими терминами звучит плохо, придётся брать провайдера
вне OpenRouter, и тогда возвращается вопрос про второй ключ.

**Стоимость.** Бесплатные модели заканчиваются вместе с переездом. Порядок величин
на одно интервью: генерация вопросов и оценка — центы, живой контур — минуты аудио
в обе стороны. Поставить лимит расходов в панели OpenRouter до первого прогона,
а не после.

---

## Что сознательно выкидываем

- `evaluation-agent` целиком: воркер не реализован, оценка живёт в backend.
- `live-agent` провайдеры `anthropic_api` и `mistral`: остаётся один `openrouter`.
- Claude CLI и монтирование `~/.claude` в образе агента.
- Self-hosted `stt`, `tts`, том `stt-cache`, образ Fish Speech и его веса.
- DuckDNS и DNS-01.
- Всё, что специфично для Windows: `netsh`, `New-NetFirewallRule`, `host.docker.internal`,
  пути `C:\`.
