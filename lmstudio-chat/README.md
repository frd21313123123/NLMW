# LM Studio Character Chat

Локальный веб‑сайт (SPA) с:

- окном чата с персонажем
- меню выбора/редактирования персонажей (фото, фон чата, пол, описание, обстановка, имя, начальное сообщение, предыстория для нейросети, стиль диалога)
- окном профиля пользователя (имя, пол, аватар)

## Запуск

1) В LM Studio:

- загрузите модель
- включите **Local Server (OpenAI compatible)** (обычно `http://localhost:1234`)

2) В этом проекте:

```bash
npm install
npm start
```

Откройте `http://localhost:3000`.

## Переменные окружения (опционально)

- `LMSTUDIO_BASE_URL` (по умолчанию `http://localhost:1234/v1`)
- `LMSTUDIO_API_KEY` (если вы включили ключ)
- `MISTRAL_API_KEY` (опционально, серверный ключ Mistral)
- `OPENROUTER_API_KEY` (опционально, серверный ключ OpenRouter; также можно ввести в профиле)

Пример:

```bash
LMSTUDIO_BASE_URL=http://localhost:1234/v1 npm start
```
