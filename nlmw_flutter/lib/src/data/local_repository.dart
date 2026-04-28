import 'dart:convert';

import '../domain/models.dart';
import 'app_database.dart';

class LocalRepository {
  LocalRepository(this._database);

  static const appDataKey = 'app_data_v1';

  final AppDatabase _database;

  Future<AppData> loadAppData() async {
    final raw = await _database.readDocument(appDataKey);
    if (raw == null || raw.trim().isEmpty) {
      final initial = AppData.initial();
      await saveAppData(initial);
      return initial;
    }

    try {
      return AppData.fromJson(jsonDecode(raw));
    } catch (_) {
      final initial = AppData.initial();
      await saveAppData(initial);
      return initial;
    }
  }

  Future<void> saveAppData(AppData data) {
    return _database.writeDocument(appDataKey, data.encode());
  }

  Future<JsonMap> exportBackup(AppData data) async {
    return data.toBackupJson();
  }

  Future<AppData> importBackup(Object? raw) async {
    final imported = AppData.fromJson(raw);
    await saveAppData(imported);
    return imported;
  }

  Future<void> writeCache(String key, JsonMap value) {
    return _database.writeDocument('cache:$key', jsonEncode(value));
  }

  Future<JsonMap?> readCache(String key) async {
    final raw = await _database.readDocument('cache:$key');
    if (raw == null) return null;
    try {
      final value = jsonDecode(raw);
      return value is Map ? Map<String, dynamic>.from(value) : null;
    } catch (_) {
      return null;
    }
  }
}
