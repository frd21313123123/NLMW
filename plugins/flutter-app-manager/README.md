# Flutter App Manager

Local Codex plugin for managing Flutter and Dart applications.

## Contents

- `.codex-plugin/plugin.json` - plugin manifest.
- `skills/flutter-apps/SKILL.md` - Codex workflow for Flutter project work.
- `scripts/check_flutter_project.ps1` - safe diagnostic helper for local Flutter SDK and project detection.

## Diagnostic Helper

From a Flutter project or workspace root:

```powershell
powershell -ExecutionPolicy Bypass -File .\plugins\flutter-app-manager\scripts\check_flutter_project.ps1 -ProjectPath . -SkipDoctor
```

Remove `-SkipDoctor` when a full `flutter doctor -v` report is useful.
