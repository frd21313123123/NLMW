import 'dart:convert';

import 'package:http/http.dart' as http;

import '../data/media_store.dart';
import '../domain/models.dart';

class PolybuzzItem {
  const PolybuzzItem({
    required this.secretSceneId,
    required this.name,
    required this.brief,
    required this.avatar,
    required this.background,
    required this.cover,
    required this.tags,
    required this.totalChats,
    required this.url,
    this.gender = Gender.unspecified,
  });

  factory PolybuzzItem.fromJson(Object? raw) {
    final data = jsonMap(raw);
    return PolybuzzItem(
      secretSceneId: stringValue(data['secretSceneId']),
      name: stringValue(data['name']),
      brief: optionalString(data['brief']),
      avatar: optionalString(data['avatar']),
      background: optionalString(data['background']),
      cover: optionalString(data['cover']),
      tags: stringList(data['tags']),
      totalChats: intValue(data['totalChats'], 0),
      url: optionalString(data['url']),
      gender: GenderCodec.parse(data['gender']),
    );
  }

  final String secretSceneId;
  final String name;
  final String brief;
  final String avatar;
  final String background;
  final String cover;
  final List<String> tags;
  final int totalChats;
  final String url;
  final Gender gender;

  JsonMap toJson() => {
    'secretSceneId': secretSceneId,
    'name': name,
    'brief': brief,
    'avatar': avatar,
    'background': background,
    'cover': cover,
    'tags': tags,
    'totalChats': totalChats,
    'url': url,
    'gender': gender.wireName,
  };
}

class PolybuzzCatalogPage {
  const PolybuzzCatalogPage({required this.items, required this.hasMore});

  final List<PolybuzzItem> items;
  final bool hasMore;
}

class PolybuzzClient {
  PolybuzzClient({http.Client? client, MediaStore? mediaStore})
    : _client = client ?? http.Client(),
      _mediaStore = mediaStore ?? MediaStore(client: client);

  static const _localePages = ['/ru', '/en', '/pt', '/de', '/fr', '/es'];
  static const _browseSeeds = 'eaisontrlcdupmhgbfywkvxzjq';
  static const _pagesPerSeed = 10;

  final http.Client _client;
  final MediaStore _mediaStore;

  Future<PolybuzzCatalogPage> fetchCatalogPage(int page) async {
    final safePage = page < 1 ? 1 : page;
    if (safePage <= _localePages.length) {
      final items = await _fetchLocalePage(_localePages[safePage - 1]);
      return PolybuzzCatalogPage(items: items, hasMore: true);
    }
    return _fetchBrowsePage(safePage - _localePages.length);
  }

  Future<PolybuzzCatalogPage> search(
    String query, {
    int page = 1,
    int pageSize = 24,
  }) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return const PolybuzzCatalogPage(items: [], hasMore: false);
    }
    final cuid = await _getcuid();
    final data = await _fetchJson(
      Uri.parse('https://api.polybuzz.ai/api/scene/search'),
      method: 'POST',
      headers: {'cuid': cuid, 'Content-Type': 'application/json'},
      body: jsonEncode({
        'query': trimmed,
        'pageNo': page,
        'pageSize': pageSize,
      }),
    );
    final list = data['data'] is Map && data['data']['list'] is List
        ? data['data']['list'] as List
        : const [];
    final items = list
        .map(_mapSceneToItem)
        .where((item) => item.secretSceneId.isNotEmpty && !_hasCjk(item.name))
        .toList();
    return PolybuzzCatalogPage(items: items, hasMore: list.length >= pageSize);
  }

  Future<CharacterProfile> importFromText(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) throw Exception('Нет данных для импорта.');
    final parsed = _tryJson(trimmed);
    if (parsed != null) {
      final character = CharacterProfile.fromJson(parsed);
      return _localizeCharacterMedia(character);
    }
    final secretId = extractSecretSceneId(trimmed);
    if (secretId.isEmpty) {
      throw Exception('Не удалось найти PolyBuzz ID в ссылке.');
    }
    return importBySecretSceneId(secretId, sourceUrl: trimmed);
  }

  Future<CharacterProfile> importBySecretSceneId(
    String secretSceneId, {
    String sourceUrl = '',
  }) async {
    final cuid = await _getcuid();
    final detail = await _sceneDetailGuest(secretSceneId, cuid);
    final profile = await _sceneProfileGuest(secretSceneId, cuid);
    final merged = <String, dynamic>{...detail, ...profile};
    final name = stringValue(
      merged['sceneName'] ?? merged['oriSceneName'],
      'PolyBuzz персонаж',
    );
    final initial = _extractFirstAssistantLine(
      optionalString(
        merged['speechText'] ?? merged['openingSpeech'] ?? merged['greeting'],
      ),
      name,
    );
    final gender = _polybuzzGender(merged['sceneGender']);
    final character = CharacterProfile.fromJson({
      'id': 'polybuzz_$secretSceneId',
      'name': name,
      'gender': gender.wireName,
      'intro': merged['brief'] ?? merged['description'] ?? merged['sceneDesc'],
      'tags': merged['sceneTags'],
      'avatar':
          merged['chatbotAvatarUrl'] ?? merged['avatar'] ?? merged['avatarUrl'],
      'background':
          merged['chatBackgroundImgUrl'] ??
          merged['background'] ??
          merged['homeCoverUrl'],
      'backstory':
          merged['persona'] ??
          merged['prompt'] ??
          merged['characterSetting'] ??
          merged['description'],
      'initialMessage': initial,
      'sourceUrl': sourceUrl,
    });
    return _localizeCharacterMedia(character);
  }

  String extractSecretSceneId(String rawUrl) {
    final uri = Uri.tryParse(rawUrl.trim());
    if (uri == null) return '';
    final queryId =
        uri.queryParameters['CID'] ??
        uri.queryParameters['secretSceneId'] ??
        uri.queryParameters['secretSceneID'] ??
        uri.queryParameters['sceneId'];
    if (queryId != null && queryId.trim().isNotEmpty) return queryId.trim();
    final match = RegExp(r'([A-Za-z0-9_-]{8,})/?$').firstMatch(uri.path);
    return match?.group(1) ?? '';
  }

  Future<List<PolybuzzItem>> _fetchLocalePage(String path) async {
    final response = await _client.get(
      Uri.parse('https://www.polybuzz.ai$path'),
      headers: _headers(accept: 'text/html,application/xhtml+xml'),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return const [];
    }
    final match = RegExp(
      r'<script[^>]*>((?:\[.*?ShallowReactive.*?))</script>',
      dotAll: true,
    ).firstMatch(response.body);
    if (match == null) return const [];
    final payload = _tryJson(match.group(1) ?? '');
    if (payload is! List) return const [];
    return _extractScenesFromPayload(
      payload,
    ).where((item) => !_hasCjk(item.name)).toList();
  }

  Future<PolybuzzCatalogPage> _fetchBrowsePage(int browsePage) async {
    final seedIdx = (browsePage - 1) ~/ _pagesPerSeed;
    if (seedIdx >= _browseSeeds.length) {
      return const PolybuzzCatalogPage(items: [], hasMore: false);
    }
    final searchPage = ((browsePage - 1) % _pagesPerSeed) + 1;
    final query = _browseSeeds[seedIdx];
    final result = await search(query, page: searchPage, pageSize: 30);
    return PolybuzzCatalogPage(
      items: result.items,
      hasMore: result.hasMore || seedIdx < _browseSeeds.length - 1,
    );
  }

  List<PolybuzzItem> _extractScenesFromPayload(List<dynamic> payload) {
    final characters = <PolybuzzItem>[];
    Object? resolve(Object? value) {
      if (value is int && value >= 0 && value < payload.length) {
        return payload[value];
      }
      return value;
    }

    for (final item in payload) {
      if (item is! List || item.isEmpty) continue;
      final firstRef = item.first;
      if (firstRef is! int || firstRef >= payload.length) continue;
      final firstTpl = payload[firstRef];
      if (firstTpl is! Map ||
          !firstTpl.containsKey('secretSceneId') ||
          !firstTpl.containsKey('sceneName')) {
        continue;
      }
      for (final idx in item) {
        if (idx is! int || idx >= payload.length) continue;
        final tplRaw = payload[idx];
        if (tplRaw is! Map || !tplRaw.containsKey('secretSceneId')) continue;
        final tpl = Map<String, dynamic>.from(tplRaw);
        final sid = optionalString(resolve(tpl['secretSceneId']));
        final name = optionalString(resolve(tpl['sceneName']));
        if (sid.isEmpty || name.isEmpty) continue;
        final tagsRaw = resolve(tpl['sceneTags']);
        final tags = tagsRaw is List
            ? tagsRaw
                  .map((tag) {
                    final resolved = resolve(tag);
                    if (resolved is Map) {
                      return optionalString(resolved['tagName']);
                    }
                    return optionalString(resolved);
                  })
                  .where((tag) => tag.isNotEmpty)
                  .toList()
            : <String>[];
        characters.add(
          PolybuzzItem(
            secretSceneId: sid,
            name: name,
            brief: optionalString(resolve(tpl['brief'])),
            avatar: optionalString(resolve(tpl['chatbotAvatarUrl'])),
            background: optionalString(resolve(tpl['chatBackgroundImgUrl'])),
            cover: optionalString(resolve(tpl['homeCoverUrl'])),
            tags: tags,
            totalChats: intValue(resolve(tpl['totalChatCnt']), 0),
            url:
                'https://www.polybuzz.ai/ru/character/profile/${Uri.encodeComponent(name.toLowerCase().replaceAll(RegExp(r"\s+"), "-"))}-$sid',
          ),
        );
      }
    }
    final seen = <String>{};
    return characters.where((item) => seen.add(item.secretSceneId)).toList();
  }

  PolybuzzItem _mapSceneToItem(Object? raw) {
    final data = jsonMap(raw);
    final name = stringValue(
      data['sceneName'] ?? data['oriSceneName'],
      'PolyBuzz',
    );
    final sid = stringValue(data['secretSceneId']);
    return PolybuzzItem(
      secretSceneId: sid,
      name: name,
      brief: optionalString(data['brief']),
      avatar: optionalString(data['chatbotAvatarUrl']),
      background: optionalString(data['chatBackgroundImgUrl']),
      cover: optionalString(data['homeCoverUrl']),
      tags: data['sceneTags'] is List
          ? (data['sceneTags'] as List)
                .map((tag) => optionalString(tag is Map ? tag['tagName'] : tag))
                .where((tag) => tag.isNotEmpty)
                .toList()
          : const [],
      totalChats: intValue(data['totalChatCnt'], 0),
      url:
          'https://www.polybuzz.ai/ru/character/profile/${Uri.encodeComponent(name.toLowerCase().replaceAll(RegExp(r"\s+"), "-"))}-$sid',
    );
  }

  Future<String> _getcuid() async {
    final data = await _fetchJson(
      Uri.parse('https://api.polybuzz.ai/api/user/getcuid'),
    );
    final cuid = data['data'] is Map
        ? optionalString(data['data']['cuid'])
        : '';
    if (cuid.isEmpty) throw Exception('PolyBuzz не вернул cuid.');
    return cuid;
  }

  Future<JsonMap> _sceneDetailGuest(String secretSceneId, String cuid) {
    return _fetchJson(
      Uri.parse('https://api.polybuzz.ai/api/scene/detailguest'),
      method: 'POST',
      headers: {'cuid': cuid, 'Content-Type': 'application/json'},
      body: jsonEncode({'secretSceneID': secretSceneId}),
    ).then(
      (data) => data['data'] is Map
          ? Map<String, dynamic>.from(data['data'])
          : <String, dynamic>{},
    );
  }

  Future<JsonMap> _sceneProfileGuest(String secretSceneId, String cuid) {
    final url = Uri.parse(
      'https://api.polybuzz.ai/api/scene/profileguest?secretSceneID=${Uri.encodeComponent(secretSceneId)}',
    );
    return _fetchJson(url, headers: {'cuid': cuid}).then(
      (data) => data['data'] is Map
          ? Map<String, dynamic>.from(data['data'])
          : <String, dynamic>{},
    );
  }

  Future<JsonMap> _fetchJson(
    Uri uri, {
    String method = 'GET',
    Map<String, String> headers = const {},
    Object? body,
  }) async {
    final mergedHeaders = {..._headers(), ...headers};
    http.Response response;
    if (method == 'POST') {
      response = await _client.post(uri, headers: mergedHeaders, body: body);
    } else {
      response = await _client.get(uri, headers: mergedHeaders);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('PolyBuzz HTTP ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) throw Exception('PolyBuzz вернул неверный JSON.');
    final map = Map<String, dynamic>.from(decoded);
    if (map['errNo'] != null && map['errNo'] != 0) {
      throw Exception(
        map['errMsg']?.toString() ?? 'PolyBuzz error ${map['errNo']}',
      );
    }
    return map;
  }

  Map<String, String> _headers({String accept = 'application/json'}) {
    return {
      'Accept': accept,
      'Accept-Language': 'ru,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 NLMWChat/1.0',
      'Referer': 'https://www.polybuzz.ai/',
      'Origin': 'https://www.polybuzz.ai',
    };
  }

  Object? _tryJson(String text) {
    try {
      return jsonDecode(text);
    } catch (_) {
      return null;
    }
  }

  Future<CharacterProfile> _localizeCharacterMedia(
    CharacterProfile character,
  ) async {
    final avatar = await _mediaStore
        .downloadImage(character.avatarPath)
        .catchError((_) => character.avatarPath);
    final background = await _mediaStore
        .downloadImage(character.backgroundPath)
        .catchError((_) => character.backgroundPath);
    return character.copyWith(
      avatarPath: avatar,
      backgroundPath: background,
      updatedAt: nowMs(),
    );
  }

  Gender _polybuzzGender(Object? value) {
    if (value == 1 || value == '1') return Gender.male;
    if (value == 2 || value == '2') return Gender.female;
    return Gender.unspecified;
  }

  bool _hasCjk(String value) {
    return RegExp(r'[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]').hasMatch(value);
  }

  String _extractFirstAssistantLine(String speechText, String sceneName) {
    final lines = speechText
        .split(RegExp(r'\r?\n'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty && line != '...' && line != '…')
        .toList();
    final namePrefix = sceneName.trim().isEmpty
        ? ''
        : '${sceneName.trim().toLowerCase()}:';
    for (final line in lines) {
      final low = line.toLowerCase();
      if (low.startsWith('guest:') ||
          low.startsWith('user:') ||
          low.startsWith('you:')) {
        continue;
      }
      if (namePrefix.isNotEmpty && low.startsWith(namePrefix)) {
        return line.substring(namePrefix.length).trim();
      }
      if (low.startsWith('assistant:') || low.startsWith('ai:')) {
        return line.substring(line.indexOf(':') + 1).trim();
      }
      return line;
    }
    return '';
  }
}
