import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/models.dart';
import 'sse_parser.dart';

class AiModel {
  const AiModel({required this.id, required this.name});

  final String id;
  final String name;
}

class AiClient {
  AiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<List<AiModel>> fetchModels({
    required AiProviderKind provider,
    required String apiKey,
  }) async {
    if (apiKey.trim().isEmpty) return _fallbackModels(provider);
    final uri = provider == AiProviderKind.mistral
        ? Uri.parse('https://api.mistral.ai/v1/models')
        : Uri.parse('https://openrouter.ai/api/v1/models');
    final response = await _client.get(
      uri,
      headers: _headers(provider, apiKey),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return _fallbackModels(provider);
    }
    final decoded = jsonDecode(response.body);
    final list = decoded is Map && decoded['data'] is List
        ? decoded['data'] as List
        : decoded is List
        ? decoded
        : const [];
    final models = list
        .map((raw) {
          final map = raw is Map ? raw : const {};
          final id = stringValue(map['id']);
          final name = stringValue(
            map['name'] ?? map['display_name'] ?? map['id'],
            id,
          );
          return id.isEmpty ? null : AiModel(id: id, name: name);
        })
        .whereType<AiModel>()
        .toList();
    return models.isEmpty ? _fallbackModels(provider) : models;
  }

  Stream<String> streamChat({
    required AiProviderKind provider,
    required String apiKey,
    required String model,
    required List<JsonMap> messages,
    required double temperature,
  }) async* {
    if (apiKey.trim().isEmpty) {
      throw Exception('API key is required for ${provider.label}.');
    }
    final uri = provider == AiProviderKind.mistral
        ? Uri.parse('https://api.mistral.ai/v1/chat/completions')
        : Uri.parse('https://openrouter.ai/api/v1/chat/completions');
    final request = http.Request('POST', uri)
      ..headers.addAll({
        ..._headers(provider, apiKey),
        'Accept': 'text/event-stream',
      })
      ..body = jsonEncode({
        'model': model.trim().isEmpty ? provider.defaultModel : model.trim(),
        'messages': messages,
        'temperature': temperature,
        'stream': true,
      });

    final response = await _client.send(request);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final body = await response.stream.bytesToString();
      throw Exception('HTTP ${response.statusCode}: $body');
    }

    final parser = SseDataParser();
    await for (final chunk in response.stream.transform(utf8.decoder)) {
      for (final event in parser.addChunk(chunk)) {
        if (event.trim() == '[DONE]') return;
        final delta = contentDeltaFromSseJson(event);
        if (delta != null && delta.isNotEmpty) yield delta;
      }
    }
    final last = parser.close();
    if (last != null && last != '[DONE]') {
      final delta = contentDeltaFromSseJson(last);
      if (delta != null && delta.isNotEmpty) yield delta;
    }
  }

  Map<String, String> _headers(AiProviderKind provider, String apiKey) {
    final headers = <String, String>{
      'Authorization': 'Bearer ${apiKey.trim()}',
      'Content-Type': 'application/json',
    };
    if (provider == AiProviderKind.openrouter) {
      headers['HTTP-Referer'] = 'https://localhost/nlmw-chat';
      headers['X-OpenRouter-Title'] = 'NLMW Chat';
    }
    return headers;
  }

  List<AiModel> _fallbackModels(AiProviderKind provider) {
    if (provider == AiProviderKind.mistral) {
      return const [
        AiModel(id: 'mistral-small-latest', name: 'Mistral Small'),
        AiModel(id: 'mistral-medium-latest', name: 'Mistral Medium'),
        AiModel(id: 'mistral-large-latest', name: 'Mistral Large'),
        AiModel(id: 'codestral-latest', name: 'Codestral'),
      ];
    }
    return const [
      AiModel(id: 'openrouter/auto', name: 'OpenRouter Auto'),
      AiModel(
        id: 'meta-llama/llama-3.1-8b-instruct:free',
        name: 'Llama 3.1 8B Instruct (free)',
      ),
      AiModel(id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B IT (free)'),
      AiModel(
        id: 'mistralai/mistral-7b-instruct:free',
        name: 'Mistral 7B Instruct (free)',
      ),
    ];
  }
}
