# Атомы, состояния и дизайн-система демо

Документ для демо **Napoleon Interview** (хакатон). Снято по коду `frontend/` **4 сентября 2026**, сверка с вечерними правками (модалка закрывается по фону, `.disabled-hint` у главных кнопок, extra не сирота). Это не каталог страниц и не спека продукта: список экранов и маршрутов живёт в [`screens.md`](screens.md). Здесь — из каких кирпичей собраны эти экраны, какие у кирпичей состояния, как движется интерфейс, и какую библиотеку имеет смысл подключать **следующим шагом** (после контракта 006, где новые npm были запрещены).

Контракт внешнего вида 006: [`specs/006-prototype-ux-pass/contracts/design-system.md`](../specs/006-prototype-ux-pass/contracts/design-system.md). Конституция уже называет стек фронта: Next.js, TypeScript, Tailwind, shadcn/ui (`.specify/memory/constitution.md`). Канон: на карточке рекрутера **нет процентов** ([`artifacts/00-canon/PRODUCT_SPEC.md`](artifacts/00-canon/PRODUCT_SPEC.md)).

---

## 1. Зачем этот документ

Два разных вопроса, два файла.

| Файл | Отвечает на вопрос | Не отвечает |
|---|---|---|
| [`screens.md`](screens.md) | Какие **экраны и маршруты** есть, кто в какой оболочке, какие моки | Как выглядит кнопка, модалка, канбан-карточка |
| **Этот файл** | Какие **атомы и виджеты**, какие **состояния**, какая **анимация**, **какую библиотеку брать** | Список URL страниц (S1, C1, R3…) |

Читать так: сначала `screens.md` («куда кликать на защите»), потом этот файл («почему кнопка серая и что ставить вместо самописной модалки»).

006 уже выровнял токены и chrome. Этот документ — **рекомендации с обоснованием**, не задача «поставить npm сегодня ночью».

---

## 2. Что уже есть в коде (инвентарь, не страницы)

Источник правды:

- токены: `frontend/app/globals.css`
- почти вся вёрстка: `frontend/app/product.css`
- React-кирпичи: `frontend/components/`
- единственный shadcn-style атом: `frontend/components/ui/button.tsx` (`@radix-ui/react-slot` + CVA)
- иконки: Phosphor (`@phosphor-icons/react`). `lucide-react` стоит в `frontend/package.json`, **в исходниках не импортируется** — второй набор иконок не плодить.

Tailwind 4 подключён (`@import "tailwindcss"` в `globals.css`). Экраны собраны классами из `product.css`, не utility-классами.

### A. Атомы и виджеты

| Виджет | Где | Варианты | Умеет | Не умеет |
|---|---|---|---|---|
| **Button** | `components/ui/button.tsx` + `.button*` в `product.css` | CVA: `default`/`primary`, `secondary`/`outline`, `ghost`, `text`; размер `default` / `large`. `asChild` через Radix Slot | Ссылка-как-кнопка (`asChild` + `Link`), наследует `disabled` с нативной кнопки | Нет `loading`, нет иконки-спиннера, нет `icon`-размера. Hover у disabled не отключён отдельно (см. §B) |
| **icon-button** | только CSS `.icon-button`, `.icon-button--small` | 38×38 и 32×32 | Квадрат с рамкой, hover, active `translateY(1px)` | Это **не** `Button`. Нет loading, нет единого API. Тема, крестик модалки, аудит-навигация |
| **text-button** | CSS `.text-button` **и** `Button variant="text"` | Плюс близнецы `.inline-action`, `.time-link` (акцент сразу, не только на hover) | Текстовая команда | Смешаны сырой `<button className="text-button">` и компонент `Button` |
| **Modal** | `components/evidence/Drawer.tsx` → `Modal`; CSS `.modal-overlay`, `.modal-card` | Один размер (карточка до 920px) | `open`, заголовок, крестик, **Esc**, **клик по серому фону** (`onClick` на оверлее, `stopPropagation` на карточке). `role="dialog"` `aria-modal="true"` | Нет focus-trap, нет анимации, нет «Назад» как пропа (кнопка «Назад» рисуется внутри children, напр. логин) |
| **Drawer** | тот же файл; CSS `.drawer-overlay`, `.drawer-panel` | Панель справа, ширина до 480px | Esc + **клик по фону** (оверлей — `button`) + крестик | Нет focus-trap, нет свайпа, нет размеров left/bottom. Сейчас одно место: согласие кандидата |
| **ToastStack** | тот же файл; CSS `.toast-stack`, `.toast` | Один вид | Пачка строк справа снизу через `createPortal` на `document.body` (иначе `overflow` у AppShell обрезает `position: fixed`), `aria-live="polite"` | Нет кнопки закрыть, нет success/error. Автоскрытие не внутри компонента: доска/отчёт/аудит сами делают `setTimeout` ~3500 мс; **approve и бриф** тост не прячут, пока не уйдёшь со страницы. Ключ React = текст сообщения (два одинаковых тоста схлопнутся) |
| **PageHeader** | `components/chrome/PageHeader.tsx`; CSS `.page-title`, `.path`, `.page-title__description`, `.page-actions` | `path?`, `title`, `description?`, `actions?` | Крошка + h1 (`--text-h1`) + описание + слот кнопок | Нет статуса загрузки в шапке, нет второстепенного meta-слота |
| **ScreenState** | `components/chrome/ScreenState.tsx`; CSS `.screen-state`, `.screen-state--loading/--empty/--error` | `kind`: **loading / empty / error** (готового `ready` нет — это просто страница) | Заголовок, текст, опциональное действие. `error` → `role="alert"`, иначе `status` | **Скелетона нет.** Loading = та же пунктирная рамка, только сплошная. Класс `.empty-state` в CSS есть, в JSX не используется |
| **StatusBadge** | `components/evidence/StatusBadge.tsx`; CSS `.status` + `data-tone` | Статусы требования: Подтверждено / Частично / Не подтверждено / Недостаточно данных (пунктир) / Не проверено / Противоречие | Иконка-символ + подпись + цвет | Не общий «бейдж любой сущности». На рубрике `.status` без `data-tone` — «Обязательное/Желательное» |
| **PilotBadge** | `components/chrome/VersionTag.tsx`; CSS `.pilot-badge` | Текст «Пилот», пунктир | Маркер пилот-маршрута | Нет ссылки «что значит пилот» |
| **VersionTag** | тот же файл; CSS `.version-tag` | `рубрика v2 · комплект v2 · модель …`, опция `demoNote` | Моноширинная мета | Не кликабелен |
| **Stepper** | `components/chrome/Stepper.tsx`; CSS `.stepper` | 7 подписей кандидата, `data-active` / `data-done`, галочка Phosphor | Прогресс интервью | Не кликабелен, нет номеров в кружках. **Другой** CSS `.setup-steps` (кружки) в JSX **не используется** |
| **LaptopGate** | `components/chrome/LaptopGate.tsx`; CSS `.laptop-gate` | Порог 900px (`useIsNarrow`) | На узком экране вместо интервью — «Откройте с ноутбука» | Нет кнопки «прислать ссылку» внутри гейта (это на приглашении, без гейта) |
| **AiNote / HumanNote** | `components/evidence/AiNote.tsx`; CSS `.ai-note*`, `.human-note*` | Ai: label по умолчанию «Система», опционально title. Human: обязательный label | Различие «система предлагает» vs решение человека | Нет свёртки, нет «доказать цитатой» внутри атома (цитата — `EvidenceLink` рядом) |
| **EvidenceLink** | `components/evidence/EvidenceLink.tsx`; CSS `.time-link`, `.clip-player`, `.no-source` | `found` + таймкод → кнопка Play; иначе «цитата не подтверждена» | Мини-плеер: **свой** оверлей (копия разметки Modal). Esc, крестик, **клик по фону** | Нет настоящего аудио. Волны — статичные палочки. Focus-trap нет |
| **BrandMark** | `components/chrome/AppShell.tsx`; CSS `.brand-mark` | `NAPOLEON` + `[INTERVIEW]` моно + акцент | Логотип-слово, не картинка | Нет иконки-знака, нет ссылки на `/` внутри компонента |
| **AppShell + сайдбар** | `AppShell.tsx`; CSS `.app-shell*` | Nav из пропсов; у admin — `adminNav()`. Активный пункт = самое длинное совпадение пути | Сайдбар + топбар («К выбору роли» + тема) | Нет сворачивания, нет иконок у пунктов, нет бейджей-счётчиков. Ссылки `<a>` **без** общего `focus-visible` (он прописан для button/input/textarea/summary) |
| **CandidateShell** | `CandidateShell.tsx`; CSS `.candidate-shell*` | Степпер + помощь (почта, Telegram, «К выбору роли») | Баннер офлайна `.offline-banner` | Нет темы в этом шелле (тумблер только в AppShell) |
| **theme toggle** | кнопка `.icon-button` в `AppShell`; логика `lib/theme.tsx` | light / dark, `localStorage` ключ `napoleon-theme` | Пишет `data-theme` на `<html>` | Нет `prefers-color-scheme`. У кандидата тумблера нет |
| **login-card** | CSS `.login-grid`, `.login-card*`, `.login-card__cta`; разметка `app/login/page.tsx` | Сетка 2 колонки | Карточка роли, подпись «Открыть», hover `translateY(-1px)` + рамка акцента. Клик по всей карточке открывает попап (вложенной кнопки нет) | Нет аватара роли, нет выбранного состояния на самой карточке (выбор = Modal) |
| **kanban-column / candidate-card** | CSS `.board-toolbar`, `.kanban`, `.kanban-column*`, `.candidate-stack`, `.candidate-card*`; данные `lib/demo/pipeline.ts`; доска `app/vacancies/[id]/page.tsx` | 5 колонок. Карточка: имя, строка стадии/решения; «Открыть отчёт» только если отчёт есть, иначе без паники «отчёта ещё нет» (в списке колонка Отчёт = «—»). `data-tone` positive/warning/danger только у канонических в «Отчёт готов» | Hover у кликабельных: рамка акцента + `translateY(-1px)`. Счётчик в шапке колонки | **Нет DnD.** Нет аватара/инициалов, нет тегов навыков, нет прогресс-бара. Некликабельная карточка — `<article>`, без hover-подъёма |
| **density-switch** | CSS вместе с `.answer-mode` | Сегмент 2 кнопок, `data-active` | Доска/Список; Кратко/Подробно на отчёте; вид запроса на C13 | Не radiogroup по ARIA (просто кнопки). Нет клавиатурных стрелок как у настоящего segmented control |
| **answer-mode** | тот же CSS; вопрос C6 | Голосом / текстом | `disabled` на «Голосом», если text-only | Нет подсказки на disabled (см. §B) |
| **record-button** | CSS `.record-button`, `.record-control`, `.record-live` | Круг 68px, акцент | Hover scale(1.03). Рядом волны и таймер | Нет состояния recording на самой кнопке (таймер отдельно). Красная точка `.record-live > i` **не пульсирует** (нет `@keyframes`) |
| **Формы: input / textarea / checkbox** | глобальные стили `input, textarea` + `.consent-row`, `.field-block`, `.form-surface`, `.form-panel`, `.form-actions`, `.split-form` | Высота инпута 42px, textarea 112px; чекбокс 17px, `accent-color: var(--accent)` | Hover рамки, focus-visible кольцо `--focus` | **Нет атома «поле с ошибкой»** (красная рамка + текст у поля). Класс `.follow-up-error` — просто красная строка под формой запроса доп. ответа, не обвязка поля |
| **Таблица** | CSS `.vacancies-table` | Список вакансий, список канбана, версии в настройках, встречи менеджера | Шапка muted, строки | Нет сортировки, нет sticky, нет пустой строки внутри table (пустые вкладки идут в `ScreenState`) |
| **tabs** | CSS `.tabs` | Пилюли, `data-active` | Черновики / На проверке / Архив на R1 | Не меняет URL |
| **diff** | CSS `.diff-surface`, `.diff-head`, `.diff-row`, `.diff-empty` | 3 колонки: изменение / v1 / v2; правая ячейка слегка positive-soft | Экран утверждения | Нет подсветки слов, нет «добавлено/удалено» |
| **brief-progress** | CSS `.brief-progress`; бриф менеджера | Полоска 4px, ширина `%` через inline style, `transition: width var(--ease)` | Шаг 1–5 | Не a11y-progressbar (`role` нет) |
| **toast-stack** | см. ToastStack выше | — | — | — |
| **system-proposal** | **только CSS** `.system-proposal`, `.proposal-count` | Баннер «система предлагает» + крупная цифра | Стили есть | **В JSX не найден.** На отчёте ту же роль играет `AiNote` |
| **report-glance** | CSS `.report-glance`; отчёт кандидата | 3 колонки: сильные / риски / не проверено | Текст, не график | Не кликабельно, не графики |
| **requirement-row + evidence-drawer (встроенный)** | CSS `.report-grid`, `.requirement-row`, `.evidence-drawer*` | Строка карты требований + правая колонка цитаты | Hover, `data-active` | Правая колонка — не компонент `Drawer`, а колонка сетки |
| **decision-bar** | CSS `.decision-bar`; низ отчёта | Липкая панель решения + комментарий | Тень | На узком экране `position: static` |
| **coverage-warning + matrix** | CSS `.coverage-warning`, `.matrix-*`, `.calibration-grid`, `.expert-requirement`, `.criterion-editor*` | Рубрика и комплект вопросов | Предупреждение Celery + матрица покрытия | Редактирование выключено (`disabled`) |
| **clip-player / wave-bars** | CSS; check, вопрос, EvidenceLink | Палочки акцентного цвета | На проверке микрофона высоты обновляются с анализатора | На плеере и записи ответа — **заглушка**, не анимированный эквалайзер |
| **progress-dots / time-track / question-progress** | CSS на экране вопроса | Точки вопросов, полоска подготовки | Текущий = акцент, пройденные = positive | Первые две точки зашиты как «пройденные» в CSS (`nth-child`), плюс `data-current` в JSX — хрупко |
| **setup-stage** | CSS `.setup-stage`, `.setup-stage__footer` | Карточка шага кандидата | Согласие, проверка, правила, тренировка, пилот-экраны | — |
| **check-list / rules-row / interview-facts** | CSS; приглашение и правила | Факты и нумерованные правила | — | — |
| **consent-row** | CSS; согласие, text-only, новая вакансия, доп. ответ | Чекбокс + две строки текста | Курсор pointer на label | Нет состояния ошибки «не отмечено» у самого ряда |
| **mail-preview + split-form** | CSS; модалка приглашения | Слева форма, справа макет письма | — | Письмо не уходит |
| **live-dot + board-toolbar** | CSS; шапка доски | Зелёная точка «приём открыт» | Всегда positive | Не привязана к статусу вакансии |
| **audit-compare / audit-question / audit-form** | CSS; аудит | Две колонки + Да/Нет/Спорно | `data-active` на вариантах | Пилот: сохранение = тост «макет» |
| **meeting-sheet** | CSS; менеджер перед встречей | Подтверждено / о чём говорить / решение Берём|Ещё этап|Нет | Печать через `.no-print` | time-link у фрагмента без `onClick` (кнопка есть, действия нет) |
| **completion-stage / next-steps / followup-stage** | CSS; готово, итог, уточнение | Иконка success, следующие шаги | Follow-up подсвечен `surface-selected` инлайном | Иконка `CircleNotch` на уточнении **не крутится** |
| **offline-banner** | CSS; CandidateShell | Жёлтая полоса | Слушает `online`/`offline` | Нет кнопки «повторить» |
| **disabled-hint / board-hint / pilot-hint / status-hint** | CSS | Подсказки 13px secondary | Доска: hint про колонку «Отчёт готов»; пилот-экраны | Не привязаны автоматически к `disabled` |
| **approval-success / success-message** | CSS | Зелёный баннер | Утверждение рубрики | — |
| **CSS-мертвецы** (стили есть, JSX нет) | `.system-proposal`, `.setup-steps`, `.camera-mini`, `.recalculate-row`, `.empty-state` | — | Не подключать «на всякий случай» в новые экраны, пока нет нужды | Не считать частью живого UI |

Оболочки `AppShell` / `CandidateShell` подробно разобраны в `screens.md` §1.2 — здесь не повторяем маршруты.

### B. Состояния кнопок и контролов

Общие правила в `product.css`:

- **default / hover / active:** `.button--primary|secondary|ghost`, `.text-button`, `.icon-button`. Active у `.button` и `.icon-button`: `transform: translateY(1px)`. У `.text-button` active нет.
- **focus-visible:** `button, input, textarea, summary` — `box-shadow: var(--focus)` (кольцо кобальта / светлого акцента в dark). У **ссылок сайдбара** отдельного кольца нет.
- **disabled:** `button:disabled { cursor: not-allowed; opacity: .42; }`. Отдельного `:disabled:hover` нет: из‑за специфичности CSS **hover-заливка primary всё ещё может сработать** на серой кнопке (визуально «жива», клик нативный браузер режет).
- **loading:** у `Button` **нет**. Имитация есть только на «Извлечь требования» (`vacancies/new`): текст меняется на «Извлекаю требования…», спиннера нет.
- **asChild / ссылка:** широко. `asChild` снимает `<button>` и вешает классы на `Link`. `disabled` на такой связке в коде почти не встречается (для ссылок это и не работает как у button).

Варианты:

| Имя в коде | CSS | Смысл |
|---|---|---|
| `variant="default"` или `"primary"` | `.button--primary` | Главное действие, `--accent` |
| `"secondary"` или `"outline"` | `.button--secondary` | Второстепенное, рамка |
| `"ghost"` | `.button--ghost` | Тихая кнопка на фоне |
| `"text"` | `.text-button` | Текстовая команда |
| `size="large"` | `.button--large` | Высота 48px (приглашение, follow-up голос) |

**Disabled без `.disabled-hint` рядом** (остаток после вечернего прохода 4 сентября):

- Комплект вопросов: «Редактировать» / «Утвердить комплект» — `disabled`, общий `.pilot-hint` внизу страницы, не у кнопки.
- Рубрика: «Утвердить» с `title=` + `.pilot-hint`.
- Extra: «Записать ответ» — `.pilot-hint`.
- Вопрос: «Переформулировать» после первого раза — `disabled={rephrased}`, почему нельзя ещё раз не написано.
- Сегмент «Голосом» при `textOnly` — `disabled`, без подписи на переключателе.
- Проверка устройства: «Всё работает» пока нет записи и не text-only — статус микрофона рядом есть.
- Аудит: «Сохранить» disabled, рядом текст «Ответьте на первый вопрос» (не класс `.disabled-hint`).
- Новая вакансия: «Извлекаю…» пока идёт extract.

**Где `.disabled-hint` уже есть:** пригласить (в демо вакансия «Активна» — кнопка включена, hint скрыт); согласие «Продолжить»; «Отправить ответ» на вопросе и follow-up; бриф «Назад» на шаге 0 («Это первый шаг»). Поле при пустой отправке **не** подсвечено ошибкой — только строка-подсказка.

**`onClick` на `disabled`:** браузер не вызовет обработчик, пока кнопка disabled. На «Утвердить v2» `disabled` **снят**: клик показывает toast «В пилоте это макет».

### C. Состояния экрана

`ScreenState` **не** рисует «ready». Ready = обычная вёрстка страницы.

| kind | Как выглядит | Где в коде |
|---|---|---|
| **loading** | Сплошная рамка, заголовок «Загружаю…», без скелетона и без спиннера | Почти только приглашение `/i/[token]` (короткий `setTimeout(0)` после чтения session) |
| **empty** | Пунктир, заголовок + «в этом демо…» + кнопка | Вкладки вакансий кроме заполненных «Активные» |
| **error** | Пунктир, `role="alert"`, текст «что / зачем / куда» + кнопка на вход или список | Почти каждый маршрут, если id/token не из моков |

Контракт 006 просил «скелетон той же сетки». **В коде скелетона нет** — loading это текстовый `ScreenState`.

**Модалка сейчас** (`Modal` в `Drawer.tsx`):

| Состояние | Есть? |
|---|---|
| `open === false` → `null` | да |
| Esc | да (`useEscape`) |
| Крестик | да |
| Клик по фону | **да** (карточка `stopPropagation`) |
| Focus-trap / возврат фокуса | **нет** |
| Анимация open | **нет** |
| Блокировка скролла body | **нет** |

`EvidenceLink` копирует оверлей модалки: Esc, крестик, клик по фону. Focus-trap нет.

**Drawer сейчас:** Esc + фон + крестик. Focus-trap нет.

**Тост сейчас:** нет закрытия, нет вариантов success/error/warning, нет очереди с id. Исчезает, если страница сама вырезала строку из массива.

### D. Тема и шрифты

- Тема: атрибут **`data-theme="light" | "dark"`** на `<html>` (`app/layout.tsx` стартует с `light`). Провайдер: `frontend/lib/theme.tsx`.
- **`prefers-color-scheme` не читается.** Первый заход всегда светлый, пока человек не нажмёт луну/солнце. Системная тёмная ОС на демо не влияет.
- Шрифт: `--font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif`. **Не Inter.** Моно: SFMono / Consolas — крошки, VersionTag, таймер записи, счётчик (если когда-нибудь оживят `.proposal-count`).
- Один акцент: `--accent` / `--accent-hover` (светлый кобальт `#140af0`, тёмный тот же акцент светлее `#756eff`). Смысловые `--positive` / `--warning` / `--danger` — не второй бренд.
- Радиусы: `--radius-control` 8px, `--radius-panel` 12px, `--radius-pill` 999px.
- Движение: `--ease: 180ms cubic-bezier(0.16, 1, 0.3, 1)`. Transition на button / icon-button / candidate-card / login-card / record-button / brief-progress. **`@keyframes` в проекте нет.**
- **`prefers-reduced-motion` есть** в конце `product.css`: у всех элементов `animation-duration` и `transition-duration` → `0.01ms`, `scroll-behavior: auto`. Это почти «выключить движение», но не буквальное `animation: none; transition: none`.

### E. Чего нет, хотя продукт это подразумевает

Имеется в виду «жюри или референс SaaS ожидают», не «сломано».

| Ожидание | Сейчас |
|---|---|
| Перетаскивание карточек канбана | Сетка CSS, карточки не draggable |
| Skeleton той же сетки | Текстовый ScreenState loading |
| Tooltip | Нет компонента и нет CSS |
| Focus-trap в модалке | Нет |
| Кнопка в состоянии loading | Нет (кроме смены текста на extract) |
| Поле с ошибкой как атом | Нет; только `.follow-up-error` строкой |
| Command palette (⌘K) | Нет |
| Графики | Нет экрана аналитики и нет Recharts/Tremor |
| Аватары / инициалы на карточке кандидата | Только имя текстом |
| Теги навыков на карточке | Нет (стек есть у вакансии, не у карточки пайплайна) |
| Индикатор прогресса на карточке («вопрос 3 из 5») | У Павла это **текст** `stageLine`, не бар. Процента нет — и не должно быть |

---

## 3. Северная звезда визуала (SpotAxis и Figma)

Пользователь предложил SpotAxis как «современный SaaS как Linear/Attio, shadcn/Tailwind, канбан с аватарами, тегами, прогрессом, DnD, виджеты Tremor/Recharts» плюс макет Figma «ATS Resume Analyzer Dashboard».

Честно по фактам:

**Реальный OSS [SpotAxis](https://github.com/Assystant/SpotAxis)** — MIT-лицензия, **классический ATS** (вакансии, отклики, воронка найма целиком). Стек исторически **PHP/HTML** (в обзорах иногда пишут Django) — это **не** Next.js и **не** shadcn. Клонировать репозиторий в `hakaton` **нельзя и не нужно**: другой продукт (полный ATS vs доказательное техинтервью Napoleon), другой стек, чужой бренд.

**Брать визуальный характер, не код:**

- светлая и тёмная тема;
- мало шума, карточки с радиусом ~8–12px;
- мягкий канбан, не Excel;
- микро-аватары или инициалы, 1–2 тега, спокойное движение карточки.

**Не брать:** PHP, чужой логотип, второй акцентный цвет, Inter вместо Helvetica Neue (бренд Napoleon в контракте 006).

**Figma [ATS Resume Analyzer Dashboard](https://www.figma.com/community/file/1530261325896087183/ats-resume-analyzer-dashboard)** — референс **дашборда аналитики**, не спецификация нашего MVP. У нас нет панели метрик на защите. Графики (Tremor/Recharts) **откладываем**, пока на экране не появятся настоящие числа, которые можно честно показать. Процентный «ATS score» из таких макетов **противоречит канону** (не ставим % на карточку кандидата).

Ближайшие **Next/React** ориентиры (смотреть глазами, не копировать продукт):

- [HireFlow](https://github.com/Hazem-Soliman-dev/HireFlow) — Next.js, канбан, `@dnd-kit` (другой продукт, есть AI-скоринг резюме — нам скоринг-% не нужен).
- [shadcn recruitment kanban block](https://www.shadcn.io/blocks/kanban-recruitment-board) — готовый кусок доски в экосистеме shadcn.
- [Kibo UI Kanban](https://www.kibo-ui.com/components/kanban) — канбан «как shadcn»: код копируется в проект, DnD из коробки.
- Linear и [Attio](https://attio.com) — характер: короткие 120–200 ms, мало теней, плотность без канцелярита.
- [Ashby](https://www.ashbyhq.com) / [Lever](https://www.lever.co) — ATS-плотность (много кандидатов на одной доске), не лендинг.

Примитивы shadcn, которые совпадают с нашими дырами: [Dialog](https://ui.shadcn.com/docs/components/dialog), [AlertDialog](https://ui.shadcn.com/docs/components/alert-dialog), [Empty](https://ui.shadcn.com/docs/components/empty), [Sidebar](https://ui.shadcn.com/docs/components/sidebar), [Sonner](https://ui.shadcn.com/docs/components/sonner), [Sheet](https://ui.shadcn.com/docs/components/sheet).

---

## 4. Какую дизайн-систему взять из того, что уже можно (и зачем)

Короткий ответ: **не новая «библиотека с нуля» и не клон SpotAxis.** Ядро бренда оставляем. Дыры закрываем **по одному примитиву shadcn/Radix**, когда конкретный экран это просит. Канбан «как в референсе» — отдельным решением после того, как жюри перестанет спотыкаться о disabled и модалку.

Уже стоит (`frontend/package.json`): `next`, `react` 19, `tailwindcss` 4, `@phosphor-icons/react`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (не использовать дальше).

Конституция уже записала shadcn/ui как baseline фронта. 006 запретил **новые npm в том проходе**, чтобы не разъехаться во время полировки. Этот документ — разрешение планировать пакеты **точечно**.

### Оставить как ядро бренда

- Токены `--canvas` / `--surface*` / `--ink*` / `--accent` / `--positive|--warning|--danger`
- Helvetica Neue
- Радиусы 8 / 12 / pill
- Phosphor
- Два шелла (сотрудник / кандидат), как сейчас
- Классы `product.css` для канбана, отчёта, кандидатского мастера — не переписывать все экраны на Tailwind за ночь

### Дособрать в духе shadcn (без смены бренда)

Ставить **не** `npx shadcn add` всего каталога, а по одному файлу в `components/ui/`, когда экран реально просит:

| Когда экран просит | Примитив | Зачем |
|---|---|---|
| Модалка ломает клавиатуру / фон | **Dialog** (Radix) вместо самописного `Modal` | Focus-trap, Esc, клик по оверлею, `aria` из коробки. Внешний вид — наши токены |
| Подтверждение «Не продвигать» | **AlertDialog** | Не путать с обычным Dialog |
| Длинный текст согласия | **Sheet** вместо самописного `Drawer` *или* дописать trap в текущий Drawer | Один паттерн оверлея |
| Пустые вкладки / ошибка | **Empty** как обёртка над смыслом `ScreenState`, не взамен копирайта | Визуал empty из shadcn, тексты наши |
| Тосты после защиты | **Sonner** вместо `ToastStack` | Закрытие, типы, очередь. Не P0 |
| Кнопка «сохраняю» | Дописать `loading` в существующий `Button` (CVA + Phosphor `CircleNotch` + `aria-busy`) | Без Framer Motion |
| Loading сетки | CSS-скелетон тех же `.kanban` / `.vacancies-table` / `.report-grid` | Без новой библиотеки |

Каждый такой файл красится **нашими** CSS-переменными (`--accent`, не дефолтный shadcn zinc + Inter).

### Канбан «как SpotAxis» — позже, отдельным решением

Не в ночь перед промежуточной защитой.

Варианты, когда доска должна **двигаться**:

1. **`@dnd-kit/core` + `@dnd-kit/sortable`** — как HireFlow; полный контроль над нашей `.candidate-card`.
2. **Kibo Kanban** — быстрее «похоже на shadcn», но притащит свой DnD и разметку; всё равно перекрашивать под Napoleon.

Карточка (без смены канона):

- кружок с **инициалами** (не стоковые фото, в демо нет лиц);
- **1–2 тега** с доски вакансии (например `async`, `SQL`) — это стек роли, не «скор»;
- тонкая полоска прогресса **только если это стадия пайплайна** («вопрос 3 из 5» у «Проходят»), **не** «магический процент соответствия».

Колонки оставляем пять: Приглашены / Проходят / Обработка / Отчёт готов / Решено.

### Анимации

**Сейчас:** CSS `transition` на кнопке, карточке, иконке, записи, брифе. Свойство `--ease` (180 ms, кривая как у «выезда»). `@keyframes` нет. Карточка уже умеет `translateY(-1px)` на hover.

**Цель (ощущение Linear, не рекламный сайт):**

- короткие **120–200 ms**, ease-out (наш `--ease` уже в этом коридоре);
- модалка: короткий fade + лёгкий scale (1.02 → 1);
- канбан при DnD: подъём тени, не полёт через весь экран;
- скелетон: спокойный shimmer **только если** человек не просил `prefers-reduced-motion`.

**Предпочтительный путь:** CSS + Tailwind 4 transitions. Пакет [`tw-animate-css`](https://github.com/Wombosvideo/tw-animate-css) (дефолт новых шаблонов shadcn) — **если** понадобятся классы `animate-in` у Dialog. Не подключать «на всякий случай» до первого Dialog.

**Не** Framer Motion / Motion на первом шаге: тяжело для демо, конституция и 006 против анимационной библиотеки без нужды.

**Обязательно сохранить** медиазапрос reduced-motion. Имеет смысл ужесточить до:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

Сейчас стоит смягчённый вариант с `0.01ms` — лучше, чем ничего.

**Не анимировать:** появление «магических скоров»; пульсацию «ИИ думает» как маркетинг (иконка `CircleNotch` на уточнении пусть остаётся статичной или вовсе уйдёт). Полоски микрофона на проверке устройства — исключение: это обратная связь «вас слышно», не реклама.

### Графики

Не ставить Recharts и Tremor, пока нет экрана аналитики. Если появится — **Recharts** (привычен со shadcn charts), пастель, скруглённые карточки, без градиентного «wow». Не круговые «match %» на кандидата.

### Тёмная тема

Довести текущий `data-theme`. Опционально: `prefers-color-scheme` **только как дефолт до первого выбора** (если в `localStorage` пусто — взять системную). Ручной тумблер в AppShell всегда побеждает. Не ломать запись `napoleon-theme`. Кандидатский шелл: либо тот же тумблер в подвале, либо явное наследование `data-theme` с `<html>` (оно уже наследуется цветами, не хватает только кнопки).

### Фазы

| Фаза | Что | npm |
|---|---|---|
| **P0 демо (жюри не спотыкается)** | **Сделано вечером 4 сентября:** подсказки у главных disabled, клик по фону модалки, extra больше не сирота, эксперт стартует с `/expert`. Осталось: не ломать empty/error; мелкие disabled на пилот-кнопках | **Ноль** новых пакетов |
| **P1 после защиты / полировка** | Dialog с trap, CSS-skeleton, `Button` loading, ужесточить reduced-motion, карточка канбана (инициалы + тег) **без** DnD | `@radix-ui/react-dialog` (через shadcn Dialog). Sheet — по желанию |
| **P2 не надо для хакатона, если нет времени** | DnD, Sonner, графики, command palette | `@dnd-kit/*` или Kibo; `sonner`; Recharts только с экраном метрик |

---

## 5. Карта «виджет → состояние → библиотека»

P0 — то, без чего жюри спотыкается. Код может чиниться параллельно; здесь **целевое** поведение.

| Виджет | Состояния, которые должны быть | Сейчас | Что взять | Приоритет |
|---|---|---|---|---|
| Button primary/secondary/ghost/text | default, hover, active, focus-visible, disabled+подсказка, loading | Нет loading; главные hint есть; hover на disabled ещё живой; пилот-кнопки без hint у самой кнопки | `:disabled:hover`; loading в CVA; hint на остатке пилота | **P0** hint (основное **сделано**); **P1** loading |
| Модалка (логин, пригласить, решение) | open, Esc, крестик, клик по фону, focus-trap, закрыть «Назад» | Esc + крестик + **фон**; trap нет | shadcn **Dialog** | **P0** фон (**сделано**); **P1** Dialog/trap |
| Drawer согласия | open, Esc, фон, крестик, trap | Фон работает, trap нет | Оставить или **Sheet** | **P1** |
| Toast | показать, закрыть, success/error, очередь | Только текст, авто-срез со страницы | Пока `ToastStack`; потом **Sonner** | **P2** |
| ScreenState empty/error | заголовок, почему, действие | Уже близко к цели на R1 и 404 | Тексты; визуал **Empty** по желанию | **P0** не ломать; полировка P1 |
| ScreenState loading | скелетон той же сетки | Текст «Загружаю…» | CSS skeleton | **P1** |
| Канбан колонка | ≥1 карточка, счётчик | Есть, 5 колонок | Оставить CSS | — |
| Канбан карточка | hover, focus, инициалы, 1–2 тега, стадия текстом, не % | Имя + строка + tone | Свои классы, без новой lib | **P1** |
| Канбан DnD | lift, drop, keyboard | Нет | `@dnd-kit` или Kibo Kanban | **P2** |
| Поле ввода | default, hover, focus, error, disabled | Нет error-атома | CSS `.field-error` | **P1** |
| density-switch / tabs / answer-mode | active, disabled+hint, keyboard | active есть | Подсказка на disabled «Голосом» | **P0** мелкий hint |
| record-button | idle, recording, disabled | idle/hover | Без пульсации «AI» | не надо анимировать |
| Тема | light, dark, системный дефолт | Только ручной тумблер | optional prefers как дефолт | **P1** |
| Reduced-motion | выкл. анимации | 0.01ms | Ужесточить `none` | **P1** |
| Tooltip | hover/focus пояснение | Нет | shadcn Tooltip / CSS title не достаточно | **P2** (или P1 для одной кнопки «⋯») |
| Sidebar | active, collapse | active есть | shadcn Sidebar **не** тащить ради коллапса | **P2** не надо |
| Графики | hover серии | Нет экрана | Recharts когда будет экран | **P2** не надо сейчас |
| Command palette | open, query | Нет | Не ставить | **P2** не надо |
| Аватар | initials fallback | Нет | CSS кружок на карточке | **P1** |
| Прогресс на карточке | стадия, не скор | Текст `stageLine` | Тонкий бар только у «Проходят» | **P1** осторожно |
| EvidenceLink / clip | open, Esc, фон | Фон **работает**; trap нет | Тот же Dialog | **P0** фон (**сделано**) / **P1** общий Dialog |

---

## 6. Чего не делать

- Не клонировать репозиторий SpotAxis и не копировать PHP/Django ATS в `frontend/`.
- Не ставить **Inter** и не менять Helvetica Neue.
- Не вводить **второй акцент** «для кандидата» или «для ИИ».
- Не рисовать **проценты** и «match score» на карточке кандидата и в glance.
- Не ставить npm «на всякий случай» (Framer Motion, Tremor, cmdk, весь shadcn каталог, lucide поверх Phosphor).
- Не переписывать все экраны на Tailwind utility за одну ночь: `product.css` — рабочая система, её чинят точечно.
- Не анимировать «ИИ думает» и появление оценки.
- Не тащить Figma-дашборд аналитики в MVP, пока нет метрик.

---

## 7. Как проверить (чеклист человека)

Живой стенд: `http://localhost:3001` (иногда другой порт), только `localhost`, не `127.0.0.1`. Роли — с `/login`.

1. **Светлая / тёмная:** войти рекрутером → луна/солнце в топбаре → канбан, отчёт, таблица вакансий. Обновить страницу: тема из `localStorage`. Кандидатский путь `/i/lida`: цвета с `data-theme` наследуются, тумблера нет — это ожидаемо.
2. **Кнопки:** hover, зажать (active), Tab до `focus-visible` кольца. На комплекте серое «Редактировать» объясняется `.pilot-hint`. На approve «Утвердить v2» клик показывает toast «макет».
3. **Модалка:** `/login` → карточка роли → Esc, крестик, **клик по серому закрывает**. То же: «Пригласить» на доске, «Не продвигать» на отчёте. Tab не должен уходить в сайдбар, пока открыто (цель P1).
4. **Канбан 5 колонок:** вакансия Middle+ Python, вид «Доска». В каждой колонке человек. «Отчёт готов»: Дмитрий, Никита, Лидия. Переключатель «Список» — те же люди со стадией. Карточки без % .
5. **Степпер кандидата:** `/i/lida` — 7 шагов, активный «Приглашение». Пройти согласие → проверка → правила → тренировка → вопрос. На ширине окна ≤900px после приглашения — LaptopGate «Откройте с ноутбука».
6. **Empty/error:** вкладки «Черновики / На проверке / Архив»; битый URL вакансии; `/i/нет-такого`.
7. **Тост:** пригласить Александра — сообщение снизу справа (закрытия может не быть — так сейчас).
8. **Reduced-motion:** в ОС «уменьшить движение» — кнопки не должны прыгать; микрофонные палочки на проверке могут замереть.

---

## Источники

1. [10 usability heuristics (Nielsen Norman Group)](https://www.nngroup.com/articles/ten-usability-heuristics/)
2. [Эвристики Нильсена простым языком (Яндекс Практикум)](https://practicum.yandex.ru/blog/evristiki-nilsena-v-dizayne-interfeysov/)
3. [shadcn Dialog](https://ui.shadcn.com/docs/components/dialog)
4. [shadcn AlertDialog](https://ui.shadcn.com/docs/components/alert-dialog)
5. [shadcn Empty](https://ui.shadcn.com/docs/components/empty)
6. [shadcn Sonner](https://ui.shadcn.com/docs/components/sonner)
7. [shadcn Sheet](https://ui.shadcn.com/docs/components/sheet)
8. [shadcn recruitment kanban block](https://www.shadcn.io/blocks/kanban-recruitment-board)
9. [Kibo UI Kanban](https://www.kibo-ui.com/components/kanban)
10. [SpotAxis (GitHub, MIT ATS)](https://github.com/Assystant/SpotAxis)
11. [HireFlow (Next.js + dnd-kit kanban)](https://github.com/Hazem-Soliman-dev/HireFlow)
12. [Figma Community: ATS Resume Analyzer Dashboard](https://www.figma.com/community/file/1530261325896087183/ats-resume-analyzer-dashboard)

Дополнительно по движению и DnD: [tw-animate-css](https://github.com/Wombosvideo/tw-animate-css), [dnd kit](https://dndkit.com), характер [Linear](https://linear.app) / [Attio](https://attio.com), плотность [Ashby](https://www.ashbyhq.com).
