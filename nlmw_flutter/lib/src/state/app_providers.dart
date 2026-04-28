import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/app_database.dart';
import '../data/local_repository.dart';
import '../data/media_store.dart';
import '../data/secure_settings.dart';
import '../services/ai_client.dart';
import '../services/polybuzz_client.dart';
import 'app_controller.dart';

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase.defaults();
  ref.onDispose(database.close);
  return database;
});

final localRepositoryProvider = Provider<LocalRepository>((ref) {
  return LocalRepository(ref.watch(appDatabaseProvider));
});

final secureSettingsProvider = Provider<SecureSettingsStore>((ref) {
  return SecureSettingsStore();
});

final aiClientProvider = Provider<AiClient>((ref) {
  return AiClient();
});

final mediaStoreProvider = Provider<MediaStore>((ref) {
  return MediaStore();
});

final polybuzzClientProvider = Provider<PolybuzzClient>((ref) {
  return PolybuzzClient(mediaStore: ref.watch(mediaStoreProvider));
});

final appControllerProvider = Provider<AppController>((ref) {
  final controller = AppController(
    repository: ref.watch(localRepositoryProvider),
    secureSettings: ref.watch(secureSettingsProvider),
    aiClient: ref.watch(aiClientProvider),
    polybuzzClient: ref.watch(polybuzzClientProvider),
  );
  controller.initialize();
  return controller;
});
