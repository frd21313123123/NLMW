import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../domain/models.dart';

class SecureSettingsStore {
  SecureSettingsStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _mistralKey = 'api_key_mistral';
  static const _openRouterKey = 'api_key_openrouter';

  final FlutterSecureStorage _storage;

  Future<String> readApiKey(AiProviderKind provider) async {
    return await _storage.read(key: _keyFor(provider)) ?? '';
  }

  Future<void> writeApiKey(AiProviderKind provider, String value) async {
    final clean = value.trim();
    if (clean.isEmpty) {
      await _storage.delete(key: _keyFor(provider));
    } else {
      await _storage.write(key: _keyFor(provider), value: clean);
    }
  }

  String _keyFor(AiProviderKind provider) {
    return provider == AiProviderKind.mistral ? _mistralKey : _openRouterKey;
  }
}
