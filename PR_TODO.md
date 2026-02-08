# PR / TODO

## What Works Now

- Local UI supports `Импорт`/`Экспорт` of characters (JSON + some PNG character cards).
- Import dialog accepts:
  - JSON (single character or array)
  - PolyBuzz link (`https://www.polybuzz.ai/...`) and will call the local server endpoint.
- Server has `POST /api/import/polybuzz` which tries:
  - PolyBuzz public API (`api.polybuzz.ai`) first
  - HTML meta fallback second

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
  - Add retries/backoff for PolyBuzz API `errNo=5002 system busy now`.
  - Add server-side timeouts for upstream fetch.
  - Add caching (e.g. per `secretSceneID`) to avoid hammering PolyBuzz.
- Authentication edge-cases:
  - PolyBuzz HTML pages frequently show "view limit / log in". We avoid that by calling their public API.
  - If PolyBuzz changes and starts requiring auth for API calls, we may need to support user-supplied cookies or tokens more explicitly.
- UI feedback:
  - Right now UI sets a short status line; no progress indicator, and errors are shown as text.
  - Add a dedicated import modal state (loading/spinner + detailed error).

## How To Create a PR

This repo is currently on a single branch `feature/lmstudio-chat-improvements` tracking `origin/feature/lmstudio-chat-improvements`.

If you want a separate PR branch:

1. `git checkout -b feature/polybuzz-import`
2. Commit changes
3. Push: `git push -u origin feature/polybuzz-import`
4. Open PR on GitHub from `feature/polybuzz-import` into the default branch.

