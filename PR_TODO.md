# PR / TODO

## What Works Now

- Local UI supports `Импорт`/`Экспорт` of characters (JSON + some PNG character cards).
- Import dialog accepts:
  - JSON (single character or array)
  - PolyBuzz link (`https://www.polybuzz.ai/...`) and will call the local server endpoint.
- Paste-to-import:
  - If you copy a PolyBuzz character link and press `Ctrl+V` (not inside an input/textarea), the app will auto-import it.
  - JSON auto-import via paste only runs while the Characters modal is open (to avoid surprises).
- Server has `POST /api/import/polybuzz` which tries:
  - PolyBuzz public API (`api.polybuzz.ai`) first
  - HTML meta fallback second
  - plus retries/backoff and upstream timeouts to handle transient errors (e.g. `errNo=5002 system busy now`).
- (Extra) Image helpers:
  - Character editor has a `Сгенерировать фото` button.
  - Chat supports `/img <prompt>` to generate an image bubble.
  - Currently implemented via a public image endpoint (external network call).

## What I Didn't Finish (And What Still Needs Doing)

- End-to-end smoke test inside the running app:
  - I validated PolyBuzz API calls via standalone Node scripts, but I did not validate the full UI flow in a browser against `http://localhost:<PORT>/api/import/polybuzz`.
- Better field mapping from PolyBuzz to local character model:
  - Currently we map:
    - `name` from scene name
    - `avatar` from `sceneAvatarUrl`
    - `background` from `conversationBackgroundImg` (fallbacks)
    - `backgroundHint` from tags
    - `setting` from `sceneBrief`
    - `backstory` gets appended with `systemRole` and `speechText` (as example)
    - `initialMessage` is best-effort: first assistant line extracted from `speechText`
  - This can be improved by:
    - extracting a cleaner `initialMessage` (e.g. remove ellipses, remove stage directions, prefer first real reply)
    - splitting `systemRole` into structured parts (persona vs rules vs scenario) if present
    - respecting language (RU/EN) and mapping `dialogueStyle` better
- Robustness and rate-limits:
  - Add caching (e.g. per `secretSceneID`) to avoid hammering PolyBuzz.
- Authentication edge-cases:
  - PolyBuzz HTML pages frequently show "view limit / log in". We avoid that by calling their public API.
  - If PolyBuzz changes and starts requiring auth for API calls, we may need to support user-supplied cookies or tokens more explicitly.
- UI feedback:
  - Right now UI uses a small note + a short status flash; no progress indicator, and errors are shown as text.
  - Add a dedicated import modal state (loading/spinner + detailed error).
- Privacy / local-only decision:
  - The image generation feature uses an external service and will send prompts over the network.
  - Decide if this should stay (and maybe be gated by a setting/env var), or be removed to keep the project strictly local.

## How To Create a PR

Default branch is currently `feature/lmstudio-chat-improvements`.

If you want a separate PR branch:

1. `git checkout -b feature/polybuzz-import-ux`
2. Commit changes
3. Push: `git push -u origin feature/polybuzz-import-ux`
4. Open PR on GitHub from `feature/polybuzz-import-ux` into `feature/lmstudio-chat-improvements`.
