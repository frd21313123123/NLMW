# Agents Guide

Этот репозиторий содержит локальный веб-чат, который подключается к LM Studio (Local Server) и поддерживает:

- список чатов (по персонажам) + поиск
- чат с персонажем
- редактор персонажей (аватар, фон, стиль, предыстория и т.д.)
- профиль пользователя

Поддерживаются два режима API LM Studio:

- Native REST API v1 (`/api/v1/*`) — используется для стриминга и stateful chats
- OpenAI-compatible API (`/v1/*`) — fallback для совместимости

## Где находится проект

- Основной проект: `lmstudio-chat/`
- Сервер (proxy + static): `lmstudio-chat/server.js`
- Клиент (SPA без сборки): `lmstudio-chat/public/`

## Быстрый старт

1) В LM Studio:

- загрузите модель
- включите **Local Server (OpenAI compatible)** (обычно `http://localhost:1234`)

2) Запуск сайта:

```bash
cd lmstudio-chat
npm install
npm start
```

Открыть: `http://localhost:3000`

## Переменные окружения

- `PORT` (по умолчанию `3000`)
- `LMSTUDIO_BASE_URL` (по умолчанию `http://localhost:1234/v1`)
- `LMSTUDIO_API_KEY` (если в LM Studio включен ключ)
- `OPENROUTER_API_KEY` (необязательно, для увеличения лимитов OpenRouter)

Примечание: значение `LMSTUDIO_BASE_URL` может заканчиваться на `/v1` или `/api/v1`.
Сервер сам выведет базовые URL для REST и OpenAI-compat.

## Архитектура

### Server: `lmstudio-chat/server.js`

- Раздает статику из `lmstudio-chat/public/`
- Проксирует запросы к LM Studio, чтобы UI не упирался в CORS
- Эндпоинты (proxy):
  - `GET /api/lmstudio/models`
    - пытается: `${REST_BASE}/api/v1/models`
    - fallback: `${OPENAI_BASE}/models`
  - `POST /api/lmstudio/chat`
    - REST режим (если в payload есть `api:"rest"`/`input`/`system_prompt`/`previous_response_id`): `${REST_BASE}/api/v1/chat`
    - иначе OpenAI-compat: `${OPENAI_BASE}/chat/completions`
  - `GET /api/openrouter/models` — список бесплатных моделей OpenRouter
  - `POST /api/openrouter/chat` — проксирует запросы к OpenRouter API
  - `GET /api/health` — отдает вычисленные base URL

### Client: `lmstudio-chat/public/app.js`

- SPA на plain JS (без сборки)
- UI похож на мобильные мессенджеры:
  - `viewChats` — список чатов (по персонажам)
  - `viewChat` — окно чата
  - `viewProfile` — профиль
  - нижняя таб-панель для навигации
- Хранит состояние в `localStorage`:
  - профиль пользователя
  - список персонажей
  - выбранного персонажа
  - историю диалога (по персонажу)
- Для REST v1 использует stateful chats через `response_id`:
  - `nlmw.lmstudioResponseIdChains` — цепочки `response_id` по персонажу
  - `nlmw.lmstudioResponseIds` — последний `response_id` (legacy/кэш)
- Стриминг:
  - читает SSE события (`message.delta`, `chat.end`, `model_load.progress`, ...)
- Действия в чате:
  - `R` под последним сообщением ассистента — перегенерация
  - `>>` под последним сообщением ассистента — продолжение
  - долгий тап по сообщению — меню (редактировать/удалить)

## Модели данных (схематично)

### Профиль

- `name`: string
- `gender`: `unspecified|female|male|other`
- `avatar`: string (URL или data: URL)

### Персонаж

- `id`: string
- `name`, `gender`
- `avatar`: string (URL/data:)
- `background`: string (URL/data:) - используется как фон чата
- `backgroundHint`: string - текстовое описание фона для system prompt
- `outfit`, `setting`, `backstory`: string - видны нейросети
- `dialogueStyle`: id стиля
- `initialMessage`: первое сообщение в новом чате

### Сообщение

- `role`: `user|assistant`
- `content`: string
- `ts`: number (ms)
- `id`: string
- `pending`: boolean (временное сообщение во время генерации)

## Правила и ограничения

- Не добавляйте тяжелые зависимости и сборку без явной необходимости (проект намеренно простой: plain JS + Express).
- Учитывайте лимиты `localStorage`: изображения сохраняются как `data:` URL, поэтому клиент ограничивает размер файла (~1.2MB).
- Не добавляйте секреты в репозиторий. Ключ LM Studio задается через `LMSTUDIO_API_KEY`.
- Не включайте доступ к LM Studio наружу (идея проекта - локальная работа на одной машине).

## Изменения в UI/персонажах

Если добавляете новые поля персонажа/профиля:

- обновляйте `defaultProfile()` / `defaultCharacter()`
- обеспечьте безопасное чтение старых сохранений (дефолты/фолбэки)
- обновляйте form-поля и `buildSystemPrompt()`

## Частые проблемы

- "LM Studio недоступна": проверьте, что Local Server включен и URL совпадает с `LMSTUDIO_BASE_URL`.
- Пустой список моделей: убедитесь, что модель действительно загружена/активна в LM Studio.
- Нет стриминга (ответ появляется целиком):
  - в DevTools -> Network проверьте, что `/api/lmstudio/chat` отвечает `Content-Type: text/event-stream`
  - убедитесь, что LM Studio версии 0.4+ (REST v1 `/api/v1/chat`)
- После редактирования/удаления сообщений контекст сбрасывается (это ожидаемо): следующий запрос пересобирает контекст из истории.
