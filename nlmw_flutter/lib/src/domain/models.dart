import 'dart:convert';

import 'package:collection/collection.dart';
import 'package:uuid/uuid.dart';

typedef JsonMap = Map<String, dynamic>;

const _uuid = Uuid();

String newId() => _uuid.v4();

int nowMs() => DateTime.now().millisecondsSinceEpoch;

String stringValue(Object? value, [String fallback = '']) {
  if (value == null) return fallback;
  final text = value.toString().trim();
  return text.isEmpty ? fallback : text;
}

String optionalString(Object? value) {
  if (value == null) return '';
  return value.toString();
}

List<String> stringList(Object? value, {int? max}) {
  Iterable<Object?> items;
  if (value is Iterable) {
    items = value.cast<Object?>();
  } else if (value is String) {
    items = value.split(',');
  } else {
    items = const [];
  }
  final out = items
      .map((item) => item?.toString().trim() ?? '')
      .where((item) => item.isNotEmpty)
      .toList();
  if (max != null && out.length > max) return out.take(max).toList();
  return out;
}

int intValue(Object? value, [int? fallback]) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? (fallback ?? nowMs());
  return fallback ?? nowMs();
}

JsonMap jsonMap(Object? value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

enum Gender { unspecified, female, male, other }

extension GenderCodec on Gender {
  static Gender parse(Object? value) {
    final raw = optionalString(value).trim().toLowerCase();
    if (raw == 'female' ||
        raw == 'f' ||
        raw == 'woman' ||
        raw == 'girl' ||
        raw == 'женский' ||
        raw == 'ж') {
      return Gender.female;
    }
    if (raw == 'male' ||
        raw == 'm' ||
        raw == 'man' ||
        raw == 'boy' ||
        raw == 'мужской' ||
        raw == 'м') {
      return Gender.male;
    }
    if (raw == 'other' ||
        raw == 'nonbinary' ||
        raw == 'non-binary' ||
        raw == 'nb' ||
        raw == 'другое') {
      return Gender.other;
    }
    return Gender.unspecified;
  }

  String get wireName => name;

  String get label {
    return switch (this) {
      Gender.female => 'женский',
      Gender.male => 'мужской',
      Gender.other => 'другое',
      Gender.unspecified => 'не указан',
    };
  }
}

enum AiProviderKind { mistral, openrouter }

extension AiProviderCodec on AiProviderKind {
  static AiProviderKind parse(Object? value) {
    final raw = optionalString(value).trim().toLowerCase();
    if (raw == 'openrouter') return AiProviderKind.openrouter;
    return AiProviderKind.mistral;
  }

  String get label => this == AiProviderKind.mistral ? 'Mistral' : 'OpenRouter';

  String get defaultModel => this == AiProviderKind.mistral
      ? 'mistral-small-latest'
      : 'openrouter/auto';
}

class DialogueStyle {
  const DialogueStyle({
    required this.id,
    required this.label,
    required this.prompt,
  });

  final String id;
  final String label;
  final String prompt;
}

const dialogueStyles = <DialogueStyle>[
  DialogueStyle(
    id: 'natural',
    label: 'Естественно',
    prompt: 'Говори живо и естественно. Без канцелярита.',
  ),
  DialogueStyle(
    id: 'friendly',
    label: 'Дружелюбно',
    prompt: 'Дружелюбный тон, поддерживай и уточняй мягко.',
  ),
  DialogueStyle(
    id: 'roleplay',
    label: 'Ролевой',
    prompt:
        'Это ролевая сцена. Добавляй детали обстановки и действий, но не перегружай.',
  ),
  DialogueStyle(
    id: 'formal',
    label: 'Официально',
    prompt: 'Официальный тон: четко, вежливо, без фамильярности.',
  ),
  DialogueStyle(
    id: 'flirty',
    label: 'Флирт',
    prompt: 'Легкий флирт и игривость, уважительно и без навязчивости.',
  ),
  DialogueStyle(
    id: 'short',
    label: 'Коротко',
    prompt: 'Короткие ответы: 1-4 предложения, по делу.',
  ),
  DialogueStyle(
    id: 'detailed',
    label: 'Подробно',
    prompt: 'Развернутые ответы: эмоции персонажа, мотивация и детали сцены.',
  ),
];

DialogueStyle styleById(Object? value) {
  final id = optionalString(value).trim().toLowerCase();
  return dialogueStyles.firstWhereOrNull((style) => style.id == id) ??
      dialogueStyles.first;
}

class UserProfile {
  const UserProfile({
    required this.name,
    required this.gender,
    required this.avatarPath,
  });

  factory UserProfile.defaultValue() {
    return const UserProfile(
      name: 'Вы',
      gender: Gender.unspecified,
      avatarPath: '',
    );
  }

  factory UserProfile.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final base = UserProfile.defaultValue();
    return UserProfile(
      name: stringValue(data['name'], base.name),
      gender: GenderCodec.parse(data['gender']),
      avatarPath: optionalString(data['avatarPath'] ?? data['avatar']),
    );
  }

  final String name;
  final Gender gender;
  final String avatarPath;

  UserProfile copyWith({String? name, Gender? gender, String? avatarPath}) {
    return UserProfile(
      name: name ?? this.name,
      gender: gender ?? this.gender,
      avatarPath: avatarPath ?? this.avatarPath,
    );
  }

  JsonMap toJson() => {
    'name': name,
    'gender': gender.wireName,
    'avatarPath': avatarPath,
    'avatar': avatarPath,
  };
}

class CharacterProfile {
  const CharacterProfile({
    required this.id,
    required this.name,
    required this.gender,
    required this.intro,
    required this.visibility,
    required this.tags,
    required this.avatarPath,
    required this.backgroundPath,
    required this.backgroundHint,
    required this.outfit,
    required this.setting,
    required this.backstory,
    required this.dialogueStyle,
    required this.initialMessage,
    required this.createdAt,
    required this.updatedAt,
    this.sourceUrl = '',
  });

  factory CharacterProfile.defaultValue() {
    final ts = nowMs();
    return CharacterProfile(
      id: newId(),
      name: 'Алиса',
      gender: Gender.female,
      intro:
          'Наблюдательная собеседница с мягкой иронией и вниманием к деталям.',
      visibility: 'public',
      tags: const ['город', 'неон'],
      avatarPath: '',
      backgroundPath: '',
      backgroundHint: 'ночной город, неон, дождь',
      outfit: 'Темная куртка, короткие перчатки, внимательный взгляд.',
      setting:
          'Вы стоите под навесом у маленького кафе; за стеклом теплый свет, снаружи шумит дождь.',
      backstory: 'Алиса любит точные вопросы и умеет держать интригу.',
      dialogueStyle: 'roleplay',
      initialMessage:
          'Привет. Кажется, дождь решил задержаться. Ты сюда случайно или искал именно это место?',
      createdAt: ts,
      updatedAt: ts,
    );
  }

  factory CharacterProfile.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final id = stringValue(data['id'], newId());
    final createdAt = intValue(data['createdAt'], nowMs());
    final dialogueStyle = styleById(
      data['dialogueStyle'] ?? data['dialogue_style'],
    ).id;
    final visibility =
        optionalString(data['visibility']).toLowerCase() == 'private'
        ? 'private'
        : 'public';
    final backstory = _mergedBackstory(data);

    return CharacterProfile(
      id: id,
      name: stringValue(
        data['name'] ?? data['char_name'] ?? data['display_name'],
        '(без имени)',
      ),
      gender: GenderCodec.parse(data['gender'] ?? data['sex']),
      intro: optionalString(
        data['intro'] ??
            data['description'] ??
            data['char_persona'] ??
            data['persona'],
      ),
      visibility: visibility,
      tags: stringList(data['tags'] ?? data['tag_list'], max: 8),
      avatarPath: optionalString(
        data['avatarPath'] ??
            data['avatar'] ??
            data['avatar_url'] ??
            data['avatarUrl'],
      ),
      backgroundPath: optionalString(
        data['backgroundPath'] ??
            data['background'] ??
            data['background_image'] ??
            data['background_url'] ??
            data['cover'] ??
            data['coverUrl'],
      ),
      backgroundHint: optionalString(
        data['backgroundHint'] ?? data['background_hint'],
      ),
      outfit: optionalString(data['outfit'] ?? data['appearance']),
      setting: optionalString(
        data['setting'] ?? data['scenario'] ?? data['world_scenario'],
      ),
      backstory: backstory,
      dialogueStyle: dialogueStyle,
      initialMessage: optionalString(
        data['initialMessage'] ??
            data['greeting'] ??
            data['first_mes'] ??
            data['firstMessage'],
      ),
      createdAt: createdAt,
      updatedAt: intValue(data['updatedAt'], createdAt),
      sourceUrl: optionalString(
        data['sourceUrl'] ?? data['source_url'] ?? data['url'],
      ),
    );
  }

  final String id;
  final String name;
  final Gender gender;
  final String intro;
  final String visibility;
  final List<String> tags;
  final String avatarPath;
  final String backgroundPath;
  final String backgroundHint;
  final String outfit;
  final String setting;
  final String backstory;
  final String dialogueStyle;
  final String initialMessage;
  final int createdAt;
  final int updatedAt;
  final String sourceUrl;

  CharacterProfile copyWith({
    String? id,
    String? name,
    Gender? gender,
    String? intro,
    String? visibility,
    List<String>? tags,
    String? avatarPath,
    String? backgroundPath,
    String? backgroundHint,
    String? outfit,
    String? setting,
    String? backstory,
    String? dialogueStyle,
    String? initialMessage,
    int? createdAt,
    int? updatedAt,
    String? sourceUrl,
  }) {
    return CharacterProfile(
      id: id ?? this.id,
      name: name ?? this.name,
      gender: gender ?? this.gender,
      intro: intro ?? this.intro,
      visibility: visibility ?? this.visibility,
      tags: tags ?? this.tags,
      avatarPath: avatarPath ?? this.avatarPath,
      backgroundPath: backgroundPath ?? this.backgroundPath,
      backgroundHint: backgroundHint ?? this.backgroundHint,
      outfit: outfit ?? this.outfit,
      setting: setting ?? this.setting,
      backstory: backstory ?? this.backstory,
      dialogueStyle: dialogueStyle ?? this.dialogueStyle,
      initialMessage: initialMessage ?? this.initialMessage,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      sourceUrl: sourceUrl ?? this.sourceUrl,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'name': name,
    'gender': gender.wireName,
    'intro': intro,
    'visibility': visibility,
    'tags': tags,
    'avatarPath': avatarPath,
    'avatar': avatarPath,
    'backgroundPath': backgroundPath,
    'background': backgroundPath,
    'backgroundHint': backgroundHint,
    'outfit': outfit,
    'setting': setting,
    'backstory': backstory,
    'dialogueStyle': dialogueStyle,
    'initialMessage': initialMessage,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
    'sourceUrl': sourceUrl,
  };

  static String _mergedBackstory(JsonMap data) {
    final chunks = <String>[];
    void add(String label, Object? value) {
      final text = optionalString(value).trim();
      if (text.isEmpty) return;
      chunks.add(label.isEmpty ? text : '$label: $text');
    }

    add('', data['backstory'] ?? data['background']);
    add(
      'Описание',
      data['description'] ?? data['char_persona'] ?? data['persona'],
    );
    add(
      'Обстановка',
      data['setting'] ?? data['scenario'] ?? data['world_scenario'],
    );
    add('Подсказка фона', data['backgroundHint'] ?? data['background_hint']);
    add('Внешность', data['outfit'] ?? data['appearance']);
    add('Стиль диалога', data['dialogue_style'] ?? data['style']);
    add('Пример диалога', data['mes_example'] ?? data['example_dialogue']);
    return chunks.toSet().join('\n\n').trim();
  }
}

class TempCharacter {
  const TempCharacter({
    required this.id,
    required this.name,
    required this.gender,
    required this.intro,
    required this.avatarPath,
    required this.source,
    required this.createdAt,
  });

  factory TempCharacter.fromJson(Object? raw) {
    final data = jsonMap(raw);
    return TempCharacter(
      id: stringValue(data['id'], newId()),
      name: stringValue(data['name'], 'НПС'),
      gender: GenderCodec.parse(data['gender']),
      intro: optionalString(data['intro']),
      avatarPath: optionalString(data['avatarPath'] ?? data['avatar']),
      source: optionalString(data['source']) == 'auto' ? 'auto' : 'manual',
      createdAt: intValue(data['createdAt'], nowMs()),
    );
  }

  final String id;
  final String name;
  final Gender gender;
  final String intro;
  final String avatarPath;
  final String source;
  final int createdAt;

  TempCharacter copyWith({
    String? id,
    String? name,
    Gender? gender,
    String? intro,
    String? avatarPath,
    String? source,
    int? createdAt,
  }) {
    return TempCharacter(
      id: id ?? this.id,
      name: name ?? this.name,
      gender: gender ?? this.gender,
      intro: intro ?? this.intro,
      avatarPath: avatarPath ?? this.avatarPath,
      source: source ?? this.source,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'name': name,
    'gender': gender.wireName,
    'intro': intro,
    'avatarPath': avatarPath,
    'avatar': avatarPath,
    'source': source,
    'createdAt': createdAt,
  };
}

class BranchVersion {
  const BranchVersion({required this.content, required this.tail});

  factory BranchVersion.fromJson(Object? raw) {
    final data = jsonMap(raw);
    return BranchVersion(
      content: optionalString(data['content']),
      tail: (data['tail'] is Iterable)
          ? (data['tail'] as Iterable).map(ChatMessage.fromJson).toList()
          : const <ChatMessage>[],
    );
  }

  final String content;
  final List<ChatMessage> tail;

  JsonMap toJson() => {
    'content': content,
    'tail': tail.map((message) => message.toJson()).toList(),
  };
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.ts,
    this.pending = false,
    this.type = '',
    this.npcId = '',
    this.npcName = '',
    this.npcGender = Gender.unspecified,
    this.npcIntro = '',
    this.speakerId = '',
    this.speakerName = '',
    this.characterId = '',
    this.branchVersions = const [],
    this.activeBranchIdx = 0,
  });

  factory ChatMessage.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final branchVersions = (data['branchVersions'] is Iterable)
        ? (data['branchVersions'] as Iterable)
              .map(BranchVersion.fromJson)
              .toList()
        : const <BranchVersion>[];
    final role = stringValue(data['role'], 'assistant');
    return ChatMessage(
      id: stringValue(data['id'], newId()),
      role: role,
      content: optionalString(data['content']),
      ts: intValue(data['ts'], nowMs()),
      pending: data['pending'] == true,
      type: optionalString(data['type']),
      npcId: optionalString(data['npcId']),
      npcName: optionalString(data['npcName']),
      npcGender: GenderCodec.parse(data['npcGender']),
      npcIntro: optionalString(data['npcIntro']),
      speakerId: optionalString(data['speakerId']),
      speakerName: optionalString(data['speakerName']),
      characterId: optionalString(data['characterId']),
      branchVersions: branchVersions,
      activeBranchIdx: intValue(
        data['activeBranchIdx'],
        0,
      ).clamp(0, branchVersions.length),
    );
  }

  factory ChatMessage.user(String content) {
    return ChatMessage(
      id: newId(),
      role: 'user',
      content: content,
      ts: nowMs(),
    );
  }

  factory ChatMessage.assistant(
    String content, {
    String speakerId = '',
    String speakerName = '',
    String characterId = '',
    bool pending = false,
    String? id,
  }) {
    return ChatMessage(
      id: id ?? newId(),
      role: 'assistant',
      content: content,
      ts: nowMs(),
      pending: pending,
      speakerId: speakerId,
      speakerName: speakerName,
      characterId: characterId,
    );
  }

  factory ChatMessage.sceneEvent(String type, TempCharacter npc) {
    return ChatMessage(
      id: newId(),
      role: 'scene_event',
      content: '',
      ts: nowMs(),
      type: type,
      npcId: npc.id,
      npcName: npc.name,
      npcGender: npc.gender,
      npcIntro: npc.intro,
    );
  }

  final String id;
  final String role;
  final String content;
  final int ts;
  final bool pending;
  final String type;
  final String npcId;
  final String npcName;
  final Gender npcGender;
  final String npcIntro;
  final String speakerId;
  final String speakerName;
  final String characterId;
  final List<BranchVersion> branchVersions;
  final int activeBranchIdx;

  bool get isChatMessage => role == 'user' || role == 'assistant';

  ChatMessage copyWith({
    String? id,
    String? role,
    String? content,
    int? ts,
    bool? pending,
    String? type,
    String? npcId,
    String? npcName,
    Gender? npcGender,
    String? npcIntro,
    String? speakerId,
    String? speakerName,
    String? characterId,
    List<BranchVersion>? branchVersions,
    int? activeBranchIdx,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      role: role ?? this.role,
      content: content ?? this.content,
      ts: ts ?? this.ts,
      pending: pending ?? this.pending,
      type: type ?? this.type,
      npcId: npcId ?? this.npcId,
      npcName: npcName ?? this.npcName,
      npcGender: npcGender ?? this.npcGender,
      npcIntro: npcIntro ?? this.npcIntro,
      speakerId: speakerId ?? this.speakerId,
      speakerName: speakerName ?? this.speakerName,
      characterId: characterId ?? this.characterId,
      branchVersions: branchVersions ?? this.branchVersions,
      activeBranchIdx: activeBranchIdx ?? this.activeBranchIdx,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'role': role,
    'content': content,
    'ts': ts,
    'pending': pending,
    if (type.isNotEmpty) 'type': type,
    if (npcId.isNotEmpty) 'npcId': npcId,
    if (npcName.isNotEmpty) 'npcName': npcName,
    if (npcGender != Gender.unspecified) 'npcGender': npcGender.wireName,
    if (npcIntro.isNotEmpty) 'npcIntro': npcIntro,
    if (speakerId.isNotEmpty) 'speakerId': speakerId,
    if (speakerName.isNotEmpty) 'speakerName': speakerName,
    if (characterId.isNotEmpty) 'characterId': characterId,
    if (branchVersions.isNotEmpty)
      'branchVersions': branchVersions
          .map((branch) => branch.toJson())
          .toList(),
    if (branchVersions.isNotEmpty) 'activeBranchIdx': activeBranchIdx,
  };
}

class ChatRecord {
  const ChatRecord({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    required this.messages,
    required this.tempCharacters,
  });

  factory ChatRecord.empty([String title = 'Чат']) {
    final ts = nowMs();
    return ChatRecord(
      id: newId(),
      title: title,
      createdAt: ts,
      updatedAt: ts,
      messages: const [],
      tempCharacters: const [],
    );
  }

  factory ChatRecord.fromJson(Object? raw, [String fallbackTitle = 'Чат']) {
    if (raw is Iterable) {
      final chat = ChatRecord.empty(fallbackTitle);
      return chat.copyWith(messages: raw.map(ChatMessage.fromJson).toList());
    }
    final data = jsonMap(raw);
    final messagesSource = data['messages'] is Iterable
        ? data['messages']
        : data['history'];
    final messages = messagesSource is Iterable
        ? messagesSource.map(ChatMessage.fromJson).toList()
        : <ChatMessage>[];
    final createdAt = intValue(data['createdAt'], nowMs());
    final updatedAt = intValue(
      data['updatedAt'],
      messages.isNotEmpty ? messages.last.ts : createdAt,
    );
    return ChatRecord(
      id: stringValue(data['id'], newId()),
      title: stringValue(data['title'], fallbackTitle),
      createdAt: createdAt,
      updatedAt: updatedAt,
      messages: messages,
      tempCharacters: data['tempCharacters'] is Iterable
          ? (data['tempCharacters'] as Iterable)
                .map(TempCharacter.fromJson)
                .toList()
          : const [],
    );
  }

  final String id;
  final String title;
  final int createdAt;
  final int updatedAt;
  final List<ChatMessage> messages;
  final List<TempCharacter> tempCharacters;

  ChatRecord copyWith({
    String? id,
    String? title,
    int? createdAt,
    int? updatedAt,
    List<ChatMessage>? messages,
    List<TempCharacter>? tempCharacters,
  }) {
    return ChatRecord(
      id: id ?? this.id,
      title: title ?? this.title,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      messages: messages ?? this.messages,
      tempCharacters: tempCharacters ?? this.tempCharacters,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'title': title,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
    'messages': messages.map((message) => message.toJson()).toList(),
    'tempCharacters': tempCharacters.map((npc) => npc.toJson()).toList(),
  };
}

class ConversationBucket {
  const ConversationBucket({required this.activeChatId, required this.chats});

  factory ConversationBucket.fromJson(Object? raw, [String characterId = '']) {
    if (raw is Iterable) {
      final chat = ChatRecord.fromJson(raw, 'Чат 1');
      return ConversationBucket(activeChatId: chat.id, chats: [chat]);
    }
    final data = jsonMap(raw);
    final chats = data['chats'] is Iterable
        ? (data['chats'] as Iterable)
              .mapIndexed(
                (index, chat) => ChatRecord.fromJson(chat, 'Чат ${index + 1}'),
              )
              .toList()
        : <ChatRecord>[];
    if (chats.isEmpty) {
      final chat = ChatRecord.empty('Чат 1');
      return ConversationBucket(activeChatId: chat.id, chats: [chat]);
    }
    var activeChatId = optionalString(data['activeChatId']);
    if (!chats.any((chat) => chat.id == activeChatId)) {
      activeChatId = chats.first.id;
    }
    return ConversationBucket(activeChatId: activeChatId, chats: chats);
  }

  final String activeChatId;
  final List<ChatRecord> chats;

  ChatRecord get activeChat =>
      chats.firstWhereOrNull((chat) => chat.id == activeChatId) ?? chats.first;

  ConversationBucket copyWith({String? activeChatId, List<ChatRecord>? chats}) {
    return ConversationBucket(
      activeChatId: activeChatId ?? this.activeChatId,
      chats: chats ?? this.chats,
    );
  }

  JsonMap toJson() => {
    'activeChatId': activeChatId,
    'chats': chats.map((chat) => chat.toJson()).toList(),
  };
}

class GroupChat {
  const GroupChat({
    required this.id,
    required this.title,
    required this.characterIds,
    required this.messages,
    required this.createdAt,
    required this.updatedAt,
  });

  factory GroupChat.create(String title, List<String> characterIds) {
    final ts = nowMs();
    return GroupChat(
      id: newId(),
      title: title.trim().isEmpty ? 'Мульти-чат' : title.trim(),
      characterIds: characterIds,
      messages: const [],
      createdAt: ts,
      updatedAt: ts,
    );
  }

  factory GroupChat.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final createdAt = intValue(data['createdAt'], nowMs());
    return GroupChat(
      id: stringValue(data['id'], newId()),
      title: stringValue(data['title'], 'Мульти-чат'),
      characterIds: stringList(data['characterIds']),
      messages: data['messages'] is Iterable
          ? (data['messages'] as Iterable).map(ChatMessage.fromJson).toList()
          : const [],
      createdAt: createdAt,
      updatedAt: intValue(data['updatedAt'], createdAt),
    );
  }

  final String id;
  final String title;
  final List<String> characterIds;
  final List<ChatMessage> messages;
  final int createdAt;
  final int updatedAt;

  GroupChat copyWith({
    String? id,
    String? title,
    List<String>? characterIds,
    List<ChatMessage>? messages,
    int? createdAt,
    int? updatedAt,
  }) {
    return GroupChat(
      id: id ?? this.id,
      title: title ?? this.title,
      characterIds: characterIds ?? this.characterIds,
      messages: messages ?? this.messages,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'title': title,
    'characterIds': characterIds,
    'messages': messages.map((message) => message.toJson()).toList(),
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class SavedPrompt {
  const SavedPrompt({
    required this.id,
    required this.title,
    required this.text,
    required this.folderId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SavedPrompt.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final ts = intValue(data['createdAt'], nowMs());
    return SavedPrompt(
      id: stringValue(data['id'], newId()),
      title: stringValue(data['title'], 'Промт'),
      text: optionalString(data['text']),
      folderId: optionalString(data['folderId']),
      createdAt: ts,
      updatedAt: intValue(data['updatedAt'], ts),
    );
  }

  final String id;
  final String title;
  final String text;
  final String folderId;
  final int createdAt;
  final int updatedAt;

  SavedPrompt copyWith({
    String? title,
    String? text,
    String? folderId,
    int? updatedAt,
  }) {
    return SavedPrompt(
      id: id,
      title: title ?? this.title,
      text: text ?? this.text,
      folderId: folderId ?? this.folderId,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  JsonMap toJson() => {
    'id': id,
    'title': title,
    'text': text,
    'folderId': folderId,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class PromptFolder {
  const PromptFolder({
    required this.id,
    required this.name,
    required this.createdAt,
  });

  factory PromptFolder.fromJson(Object? raw) {
    final data = jsonMap(raw);
    return PromptFolder(
      id: stringValue(data['id'], newId()),
      name: stringValue(data['name'], 'Папка'),
      createdAt: intValue(data['createdAt'], nowMs()),
    );
  }

  final String id;
  final String name;
  final int createdAt;

  PromptFolder copyWith({String? name}) =>
      PromptFolder(id: id, name: name ?? this.name, createdAt: createdAt);

  JsonMap toJson() => {'id': id, 'name': name, 'createdAt': createdAt};
}

class AppSettings {
  const AppSettings({
    required this.provider,
    required this.modelId,
    required this.temperature,
    required this.maxMessagesForPrompt,
  });

  factory AppSettings.defaultValue() {
    return const AppSettings(
      provider: AiProviderKind.mistral,
      modelId: 'mistral-small-latest',
      temperature: 0.75,
      maxMessagesForPrompt: 40,
    );
  }

  factory AppSettings.fromJson(Object? raw) {
    final data = jsonMap(raw);
    final provider = AiProviderCodec.parse(data['provider']);
    final rawModel = optionalString(data['modelId']);
    return AppSettings(
      provider: provider,
      modelId: rawModel.isEmpty ? provider.defaultModel : rawModel,
      temperature: (data['temperature'] is num)
          ? (data['temperature'] as num).toDouble()
          : 0.75,
      maxMessagesForPrompt: intValue(
        data['maxMessagesForPrompt'],
        40,
      ).clamp(8, 120),
    );
  }

  final AiProviderKind provider;
  final String modelId;
  final double temperature;
  final int maxMessagesForPrompt;

  AppSettings copyWith({
    AiProviderKind? provider,
    String? modelId,
    double? temperature,
    int? maxMessagesForPrompt,
  }) {
    final nextProvider = provider ?? this.provider;
    return AppSettings(
      provider: nextProvider,
      modelId:
          modelId ??
          (provider == null ? this.modelId : nextProvider.defaultModel),
      temperature: temperature ?? this.temperature,
      maxMessagesForPrompt: maxMessagesForPrompt ?? this.maxMessagesForPrompt,
    );
  }

  JsonMap toJson() => {
    'provider': provider.name,
    'modelId': modelId,
    'temperature': temperature,
    'maxMessagesForPrompt': maxMessagesForPrompt,
  };
}

class AppData {
  const AppData({
    required this.profile,
    required this.characters,
    required this.selectedCharacterId,
    required this.conversations,
    required this.groupChats,
    required this.activeGroupChatId,
    required this.savedPrompts,
    required this.promptFolders,
    required this.settings,
    required this.schemaVersion,
  });

  factory AppData.initial() {
    final character = CharacterProfile.defaultValue();
    final chat = ChatRecord.empty('Чат 1').copyWith(
      messages: [
        ChatMessage.assistant(
          character.initialMessage,
          speakerId: character.id,
          speakerName: character.name,
          characterId: character.id,
        ),
      ],
    );
    return AppData(
      profile: UserProfile.defaultValue(),
      characters: [character],
      selectedCharacterId: character.id,
      conversations: {
        character.id: ConversationBucket(activeChatId: chat.id, chats: [chat]),
      },
      groupChats: const [],
      activeGroupChatId: '',
      savedPrompts: const [],
      promptFolders: const [],
      settings: AppSettings.defaultValue(),
      schemaVersion: 1,
    );
  }

  factory AppData.fromJson(Object? raw) {
    final wrapper = jsonMap(raw);
    final data = wrapper['data'] is Map ? jsonMap(wrapper['data']) : wrapper;
    var characters = data['characters'] is Iterable
        ? (data['characters'] as Iterable)
              .map(CharacterProfile.fromJson)
              .toList()
        : <CharacterProfile>[];
    if (characters.isEmpty) characters = [CharacterProfile.defaultValue()];

    final conversationsRaw = jsonMap(data['conversations']);
    final conversations = <String, ConversationBucket>{};
    for (final character in characters) {
      conversations[character.id] = ConversationBucket.fromJson(
        conversationsRaw[character.id],
        character.id,
      );
    }

    var selectedCharacterId = optionalString(data['selectedCharacterId']);
    if (!characters.any((character) => character.id == selectedCharacterId)) {
      selectedCharacterId = characters.first.id;
    }

    final provider = AiProviderCodec.parse(
      data['provider'] ?? jsonMap(data['settings'])['provider'],
    );
    final settings = AppSettings.fromJson({
      ...jsonMap(data['settings']),
      'provider': provider.name,
      'modelId': data['modelId'] ?? jsonMap(data['settings'])['modelId'],
    });

    final groups = data['groupChats'] is Iterable
        ? (data['groupChats'] as Iterable)
              .map(GroupChat.fromJson)
              .where((group) => group.characterIds.length >= 2)
              .toList()
        : <GroupChat>[];
    var activeGroupChatId = optionalString(data['activeGroupChatId']);
    if (!groups.any((group) => group.id == activeGroupChatId)) {
      activeGroupChatId = groups.firstOrNull?.id ?? '';
    }

    return AppData(
      profile: UserProfile.fromJson(data['profile']),
      characters: characters,
      selectedCharacterId: selectedCharacterId,
      conversations: conversations,
      groupChats: groups,
      activeGroupChatId: activeGroupChatId,
      savedPrompts: data['savedPrompts'] is Iterable
          ? (data['savedPrompts'] as Iterable)
                .map(SavedPrompt.fromJson)
                .where((prompt) => prompt.text.trim().isNotEmpty)
                .toList()
          : const [],
      promptFolders: data['promptFolders'] is Iterable
          ? (data['promptFolders'] as Iterable)
                .map(PromptFolder.fromJson)
                .toList()
          : const [],
      settings: settings,
      schemaVersion: intValue(data['schemaVersion'], 1),
    );
  }

  final UserProfile profile;
  final List<CharacterProfile> characters;
  final String selectedCharacterId;
  final Map<String, ConversationBucket> conversations;
  final List<GroupChat> groupChats;
  final String activeGroupChatId;
  final List<SavedPrompt> savedPrompts;
  final List<PromptFolder> promptFolders;
  final AppSettings settings;
  final int schemaVersion;

  CharacterProfile? get selectedCharacter =>
      characters.firstWhereOrNull((item) => item.id == selectedCharacterId);

  ConversationBucket? bucketFor(String characterId) =>
      conversations[characterId];

  ChatRecord? activeChatFor(String characterId) =>
      conversations[characterId]?.activeChat;

  AppData copyWith({
    UserProfile? profile,
    List<CharacterProfile>? characters,
    String? selectedCharacterId,
    Map<String, ConversationBucket>? conversations,
    List<GroupChat>? groupChats,
    String? activeGroupChatId,
    List<SavedPrompt>? savedPrompts,
    List<PromptFolder>? promptFolders,
    AppSettings? settings,
    int? schemaVersion,
  }) {
    return AppData(
      profile: profile ?? this.profile,
      characters: characters ?? this.characters,
      selectedCharacterId: selectedCharacterId ?? this.selectedCharacterId,
      conversations: conversations ?? this.conversations,
      groupChats: groupChats ?? this.groupChats,
      activeGroupChatId: activeGroupChatId ?? this.activeGroupChatId,
      savedPrompts: savedPrompts ?? this.savedPrompts,
      promptFolders: promptFolders ?? this.promptFolders,
      settings: settings ?? this.settings,
      schemaVersion: schemaVersion ?? this.schemaVersion,
    );
  }

  JsonMap toJson() => {
    'schemaVersion': schemaVersion,
    'profile': profile.toJson(),
    'characters': characters.map((character) => character.toJson()).toList(),
    'selectedCharacterId': selectedCharacterId,
    'conversations': conversations.map(
      (key, value) => MapEntry(key, value.toJson()),
    ),
    'groupChats': groupChats.map((group) => group.toJson()).toList(),
    'activeGroupChatId': activeGroupChatId,
    'savedPrompts': savedPrompts.map((prompt) => prompt.toJson()).toList(),
    'promptFolders': promptFolders.map((folder) => folder.toJson()).toList(),
    'settings': settings.toJson(),
    'provider': settings.provider.name,
    'modelId': settings.modelId,
  };

  JsonMap toBackupJson() => {
    'format': 'nlmw-backup',
    'version': 2,
    'exportedAt': DateTime.now().toIso8601String(),
    'data': toJson(),
  };

  String encode() => jsonEncode(toJson());
}
