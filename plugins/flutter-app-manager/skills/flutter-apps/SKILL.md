---
name: flutter-apps
description: Manage Flutter and Dart applications, including project inspection, dependency changes, assets, platform setup, analyze/test/build loops, runtime diagnostics, and release-safe packaging.
---

# Flutter Apps

Use this skill when the user asks Codex to work on a Flutter app, Dart app, mobile app built with Flutter, or a Flutter target such as Android, iOS, web, Windows, macOS, or Linux.

## Core Workflow

1. Locate the Flutter project root before changing files.
   - Prefer the nearest directory containing `pubspec.yaml`.
   - If the workspace has multiple `pubspec.yaml` files, inspect names and ask only when the target cannot be inferred.
   - Read `pubspec.yaml`, `analysis_options.yaml`, `lib/main.dart`, and relevant files under `lib/`, `test/`, `android/`, `ios/`, `web/`, or desktop platform folders.

2. Check the local toolchain when behavior depends on installed SDKs or devices.
   - Use `flutter --version`, `dart --version`, `flutter doctor -v`, and `flutter devices` when needed.
   - The bundled helper `scripts/check_flutter_project.ps1` can produce a structured status report.
   - Do not assume Android Studio, Xcode, CocoaPods, Chrome, or a connected device exists.

3. Make changes using Flutter conventions.
   - Use `flutter pub add`, `flutter pub remove`, and `flutter pub upgrade` for dependency edits when practical.
   - If editing `pubspec.yaml` directly, preserve indentation and run `flutter pub get` afterward.
   - Add assets under the `flutter.assets` section and keep paths project-relative.
   - Keep generated files, build outputs, signing keys, keystores, provisioning profiles, and API secrets out of source edits unless explicitly requested.

4. Validate after edits.
   - Run `dart format` on changed Dart files.
   - Run `flutter analyze` for non-trivial Dart or Flutter changes.
   - Run `flutter test` when tests exist or behavior changed.
   - For code generation projects, run the existing generator command used by the repo, commonly `dart run build_runner build --delete-conflicting-outputs`.

5. Choose run and build targets deliberately.
   - Inspect `flutter devices` before using `flutter run`.
   - Prefer short validation commands over long-running app sessions unless the user asked to launch the app.
   - For web, use `flutter run -d chrome` or `flutter build web`.
   - For Windows desktop, use `flutter run -d windows` or `flutter build windows`.
   - For Android, use `flutter build apk --debug` for a safe local build unless a release artifact is requested.
   - Do not sign release builds or modify release signing config without explicit user confirmation.

## Troubleshooting Checklist

- Dependency resolution: check `pubspec.yaml`, `pubspec.lock`, SDK constraints, and package versions.
- Analyzer failures: fix the first real source error before chasing follow-on errors.
- Platform build failures: inspect the platform-specific folder and toolchain output, especially Gradle, Android SDK, CocoaPods, or Xcode messages.
- Asset or font failures: verify `pubspec.yaml` paths and case-sensitive file names.
- State/UI bugs: inspect widget ownership, lifecycle, async calls after dispose, provider/bloc/riverpod wiring, and navigation context use.
- Performance issues: look for rebuild-heavy widgets, large synchronous work on the UI thread, uncached images, and avoidable layout passes.

## Expected Final Response

Summarize the user-visible Flutter change, list validation commands that passed or could not be run, and call out any platform/toolchain limitations that remain.
