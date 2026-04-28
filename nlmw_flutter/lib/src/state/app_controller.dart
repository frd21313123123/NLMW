import 'dart:convert';

import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';

import '../data/local_repository.dart';
import '../data/secure_settings.dart';
import '../domain/models.dart';
import '../domain/npc_commands.dart';
import '../domain/prompt_builder.dart';
import '../services/ai_client.dart';
import '../services/polybuzz_client.dart';

class AppController extends ChangeNotifier {
  AppController({
    required LocalRepository repository,
    required SecureSettingsStore secureSettings,
    required AiClient aiClient,
    required PolybuzzClient polybuzzClient,
    PromptBuilder promptBuilder = const PromptBuilder(),
  }) : _repository = repository,
       _secureSettings = secureSettings,
       _aiClient = aiClient,
       _polybuzzClient = polybuzzClient,
       _promptBuilder = promptBuilder;

  final LocalRepository _repository;
  final SecureSettingsStore _secureSettings;
  final AiClient _aiClient;
  final PolybuzzClient _polybuzzClient;
  final PromptBuilder _promptBuilder;

  AppData data = AppData.initial();
  bool initialized = false;
  bool generating = false;
  String status = '';
  List<AiModel> models = const [];
  final Map<AiProviderKind, String> _apiKeys = {};

  String apiKeyFor(AiProviderKind provider) => _apiKeys[provider] ?? '';

  Future<void> initialize() async {
    data = await _repository.loadAppData();
    data = _ensureInitialMessages(data);
    _apiKeys[AiProviderKind.mistral] = await _secureSettings.readApiKey(
      AiProviderKind.mistral,
    );
    _apiKeys[AiProviderKind.openrouter] = await _secureSettings.readApiKey(
      AiProviderKind.openrouter,
    );
    initialized = true;
    notifyListeners();
    await _persist();
    await refreshModels();
  }

  Future<void> refreshModels() async {
    final provider = data.settings.provider;
    models = await _aiClient.fetchModels(
      provider: provider,
      apiKey: apiKeyFor(provider),
    );
    notifyListeners();
  }

  Future<void> updateApiKey(AiProviderKind provider, String key) async {
    _apiKeys[provider] = key.trim();
    await _secureSettings.writeApiKey(provider, key);
    if (data.settings.provider == provider) await refreshModels();
    notifyListeners();
  }

  Future<void> updateProvider(AiProviderKind provider) async {
    data = data.copyWith(settings: data.settings.copyWith(provider: provider));
    await _persist();
    notifyListeners();
    await refreshModels();
  }

  Future<void> updateModel(String modelId) async {
    data = data.copyWith(settings: data.settings.copyWith(modelId: modelId));
    await _persistAndNotify();
  }

  Future<void> updateProfile(UserProfile profile) async {
    data = data.copyWith(profile: profile);
    await _persistAndNotify();
  }

  Future<void> upsertCharacter(CharacterProfile character) async {
    final now = nowMs();
    final next = character.copyWith(updatedAt: now);
    final chars = [...data.characters];
    final idx = chars.indexWhere((item) => item.id == next.id);
    if (idx == -1) {
      chars.insert(0, next);
    } else {
      chars[idx] = next;
    }
    final conversations = Map<String, ConversationBucket>.from(
      data.conversations,
    );
    conversations.putIfAbsent(
      next.id,
      () => ConversationBucket.fromJson(null, next.id),
    );
    data = data.copyWith(
      characters: chars,
      selectedCharacterId: next.id,
      conversations: conversations,
    );
    data = _ensureInitialMessages(data);
    await _persistAndNotify();
  }

  Future<void> deleteCharacter(String id) async {
    if (data.characters.length <= 1) return;
    final chars = data.characters.where((item) => item.id != id).toList();
    final conversations = Map<String, ConversationBucket>.from(
      data.conversations,
    )..remove(id);
    final groupChats = data.groupChats
        .map(
          (group) => group.copyWith(
            characterIds: group.characterIds.where((cid) => cid != id).toList(),
          ),
        )
        .where((group) => group.characterIds.length >= 2)
        .toList();
    data = data.copyWith(
      characters: chars,
      selectedCharacterId:
          chars.any((item) => item.id == data.selectedCharacterId)
          ? data.selectedCharacterId
          : chars.first.id,
      conversations: conversations,
      groupChats: groupChats,
      activeGroupChatId:
          groupChats.any((item) => item.id == data.activeGroupChatId)
          ? data.activeGroupChatId
          : '',
    );
    await _persistAndNotify();
  }

  Future<void> selectCharacter(String id) async {
    if (!data.characters.any((item) => item.id == id)) return;
    data = data.copyWith(selectedCharacterId: id);
    await _persistAndNotify();
  }

  Future<void> createChatForCharacter(String characterId) async {
    final bucket =
        data.conversations[characterId] ??
        ConversationBucket.fromJson(null, characterId);
    final chat = ChatRecord.empty('Чат ${bucket.chats.length + 1}');
    final nextBucket = bucket.copyWith(
      activeChatId: chat.id,
      chats: [chat, ...bucket.chats],
    );
    data = data.copyWith(
      conversations: {...data.conversations, characterId: nextBucket},
    );
    data = _ensureInitialMessages(data);
    await _persistAndNotify();
  }

  Future<void> setActiveChat(String characterId, String chatId) async {
    final bucket = data.conversations[characterId];
    if (bucket == null || !bucket.chats.any((chat) => chat.id == chatId)) {
      return;
    }
    data = data.copyWith(
      conversations: {
        ...data.conversations,
        characterId: bucket.copyWith(activeChatId: chatId),
      },
    );
    await _persistAndNotify();
  }

  Future<void> clearActiveChat() async {
    final character = data.selectedCharacter;
    if (character == null) return;
    final chat = data.activeChatFor(character.id);
    if (chat == null) return;
    final cleared = chat.copyWith(
      messages: const [],
      tempCharacters: const [],
      updatedAt: nowMs(),
    );
    _replaceChat(character.id, cleared);
    data = _ensureInitialMessages(data);
    await _persistAndNotify();
  }

  Future<void> sendPersonalMessage(String text) async {
    final character = data.selectedCharacter;
    if (character == null || generating || text.trim().isEmpty) return;
    final apiKey = apiKeyFor(data.settings.provider);
    if (apiKey.isEmpty) {
      status = 'Введите API key для ${data.settings.provider.label}.';
      notifyListeners();
      return;
    }

    generating = true;
    status = 'Генерирую ответ...';
    notifyListeners();

    try {
      var chat = data.activeChatFor(character.id) ?? ChatRecord.empty();
      chat = chat.copyWith(
        messages: [...chat.messages, ChatMessage.user(text.trim())],
        updatedAt: nowMs(),
      );
      _replaceChat(character.id, chat);
      await _persistAndNotify();

      final speakers = _speakersForTurn(character, chat, text);
      for (final speaker in speakers) {
        await _streamSpeaker(character, speaker);
      }
      status = '';
    } catch (error) {
      await _appendAssistantError(
        character.id,
        'Не удалось получить ответ: $error',
      );
      status = error.toString();
    } finally {
      generating = false;
      await _persistAndNotify();
    }
  }

  Future<void> regenerateMessage(String messageId) async {
    final character = data.selectedCharacter;
    if (character == null || generating) return;
    var chat = data.activeChatFor(character.id);
    if (chat == null) return;
    final idx = chat.messages.indexWhere(
      (message) => message.id == messageId && message.role == 'assistant',
    );
    if (idx < 0) return;
    final original = chat.messages[idx];
    final tail = chat.messages.sublist(idx + 1);
    final branches = [
      ...original.branchVersions,
      BranchVersion(content: original.content, tail: tail),
    ];
    final pending = original.copyWith(
      content: '',
      pending: true,
      branchVersions: branches,
      activeBranchIdx: branches.length,
    );
    chat = chat.copyWith(
      messages: [...chat.messages.take(idx), pending],
      updatedAt: nowMs(),
    );
    _replaceChat(character.id, chat);
    generating = true;
    notifyListeners();

    try {
      final speaker = _speakerFromMessage(character, original);
      final generated = await _streamIntoMessage(
        character,
        speaker,
        pending.id,
        baseText: '',
      );
      final finalBranches = [
        ...branches,
        BranchVersion(content: generated, tail: const []),
      ];
      _updateMessage(character.id, pending.id, (message) {
        return message.copyWith(
          content: generated,
          pending: false,
          branchVersions: finalBranches,
          activeBranchIdx: finalBranches.length - 1,
          ts: nowMs(),
        );
      });
    } catch (error) {
      _updateMessage(character.id, pending.id, (message) {
        return message.copyWith(
          content: 'Не удалось перегенерировать: $error',
          pending: false,
        );
      });
    } finally {
      generating = false;
      await _persistAndNotify();
    }
  }

  Future<void> continueLastAnswer({bool thoughts = false}) async {
    final character = data.selectedCharacter;
    if (character == null || generating) return;
    final chat = data.activeChatFor(character.id);
    if (chat == null || chat.messages.isEmpty) return;
    final idx = chat.messages.lastIndexWhere(
      (message) => message.role == 'assistant' && !message.pending,
    );
    if (idx < 0) return;
    final last = chat.messages[idx];
    generating = true;
    _updateMessage(
      character.id,
      last.id,
      (message) => message.copyWith(pending: true),
    );
    notifyListeners();
    try {
      final prompt = thoughts
          ? 'Продолжи предыдущий ответ как внутренние мысли персонажа, без обращения к собеседнику.'
          : 'Продолжи свой предыдущий ответ без повторов.';
      final speaker = _speakerFromMessage(character, last);
      final generated = await _streamIntoMessage(
        character,
        speaker,
        last.id,
        baseText: thoughts ? '${last.content}\n\n{{THOUGHTS}}\n' : last.content,
        extraMessages: [
          {'role': 'user', 'content': prompt},
        ],
      );
      _updateMessage(
        character.id,
        last.id,
        (message) =>
            message.copyWith(content: generated, pending: false, ts: nowMs()),
      );
    } catch (error) {
      _updateMessage(character.id, last.id, (message) {
        return message.copyWith(
          content: '${message.content}\n\n(продолжение прервано: $error)',
          pending: false,
        );
      });
    } finally {
      generating = false;
      await _persistAndNotify();
    }
  }

  Future<void> switchMessageBranch(String messageId, int direction) async {
    final character = data.selectedCharacter;
    if (character == null) return;
    final chat = data.activeChatFor(character.id);
    if (chat == null) return;
    final idx = chat.messages.indexWhere((message) => message.id == messageId);
    if (idx < 0) return;
    final message = chat.messages[idx];
    if (message.branchVersions.length <= 1) return;
    final nextIdx = (message.activeBranchIdx + direction)
        .clamp(0, message.branchVersions.length - 1)
        .toInt();
    final branch = message.branchVersions[nextIdx];
    final nextMessage = message.copyWith(
      content: branch.content,
      activeBranchIdx: nextIdx,
    );
    final nextMessages = [
      ...chat.messages.take(idx),
      nextMessage,
      ...branch.tail,
    ];
    _replaceChat(
      character.id,
      chat.copyWith(messages: nextMessages, updatedAt: nowMs()),
    );
    await _persistAndNotify();
  }

  Future<void> addTempCharacter(String characterId, TempCharacter npc) async {
    final chat = data.activeChatFor(characterId);
    if (chat == null) return;
    final exists = chat.tempCharacters.any(
      (item) =>
          item.id == npc.id ||
          item.name.toLowerCase() == npc.name.toLowerCase(),
    );
    if (exists) return;
    final next = chat.copyWith(
      tempCharacters: [...chat.tempCharacters, npc],
      messages: [...chat.messages, ChatMessage.sceneEvent('npc_joined', npc)],
      updatedAt: nowMs(),
    );
    _replaceChat(characterId, next);
    await _persistAndNotify();
  }

  Future<void> removeTempCharacter(String characterId, String npcId) async {
    final chat = data.activeChatFor(characterId);
    if (chat == null) return;
    final npc = chat.tempCharacters.firstWhereOrNull(
      (item) => item.id == npcId,
    );
    if (npc == null) return;
    final next = chat.copyWith(
      tempCharacters: chat.tempCharacters
          .where((item) => item.id != npcId)
          .toList(),
      messages: [...chat.messages, ChatMessage.sceneEvent('npc_left', npc)],
      updatedAt: nowMs(),
    );
    _replaceChat(characterId, next);
    await _persistAndNotify();
  }

  Future<GroupChat> createGroupChat(
    String title,
    List<String> characterIds,
  ) async {
    final cleanIds = characterIds
        .toSet()
        .where((id) => data.characters.any((character) => character.id == id))
        .toList();
    if (cleanIds.length < 2) {
      throw Exception('Выберите минимум двух персонажей.');
    }
    var group = GroupChat.create(title, cleanIds);
    final greetings = <ChatMessage>[];
    for (final id in cleanIds) {
      final character = data.characters.firstWhere((item) => item.id == id);
      final content = character.initialMessage.trim().isEmpty
          ? 'Привет. Я ${character.name}.'
          : character.initialMessage;
      greetings.add(
        ChatMessage.assistant(
          content,
          speakerId: id,
          speakerName: character.name,
          characterId: id,
        ),
      );
    }
    group = group.copyWith(messages: greetings, updatedAt: nowMs());
    data = data.copyWith(
      groupChats: [group, ...data.groupChats],
      activeGroupChatId: group.id,
    );
    await _persistAndNotify();
    return group;
  }

  Future<void> sendGroupMessage(String groupId, String text) async {
    if (generating || text.trim().isEmpty) return;
    final apiKey = apiKeyFor(data.settings.provider);
    if (apiKey.isEmpty) {
      status = 'Введите API key для ${data.settings.provider.label}.';
      notifyListeners();
      return;
    }
    var group = data.groupChats.firstWhereOrNull((item) => item.id == groupId);
    if (group == null) return;
    group = group.copyWith(
      messages: [...group.messages, ChatMessage.user(text.trim())],
      updatedAt: nowMs(),
    );
    _replaceGroup(group);
    generating = true;
    status = 'Генерирую мульти-чат...';
    notifyListeners();

    try {
      for (final characterId in group.characterIds) {
        final character = data.characters.firstWhereOrNull(
          (item) => item.id == characterId,
        );
        if (character == null) continue;
        await _streamGroupSpeaker(groupId, character);
      }
      status = '';
    } catch (error) {
      status = error.toString();
    } finally {
      generating = false;
      await _persistAndNotify();
    }
  }

  Future<void> savePrompt({
    String? id,
    required String title,
    required String text,
    String folderId = '',
  }) async {
    final now = nowMs();
    final prompts = [...data.savedPrompts];
    final idx = id == null
        ? -1
        : prompts.indexWhere((prompt) => prompt.id == id);
    if (idx == -1) {
      prompts.insert(
        0,
        SavedPrompt(
          id: newId(),
          title: title,
          text: text,
          folderId: folderId,
          createdAt: now,
          updatedAt: now,
        ),
      );
    } else {
      prompts[idx] = prompts[idx].copyWith(
        title: title,
        text: text,
        folderId: folderId,
        updatedAt: now,
      );
    }
    data = data.copyWith(savedPrompts: prompts);
    await _persistAndNotify();
  }

  Future<void> deletePrompt(String id) async {
    data = data.copyWith(
      savedPrompts: data.savedPrompts
          .where((prompt) => prompt.id != id)
          .toList(),
    );
    await _persistAndNotify();
  }

  Future<void> savePromptFolder({String? id, required String name}) async {
    final folders = [...data.promptFolders];
    final idx = id == null
        ? -1
        : folders.indexWhere((folder) => folder.id == id);
    if (idx == -1) {
      folders.add(PromptFolder(id: newId(), name: name, createdAt: nowMs()));
    } else {
      folders[idx] = folders[idx].copyWith(name: name);
    }
    data = data.copyWith(promptFolders: folders);
    await _persistAndNotify();
  }

  Future<void> deletePromptFolder(String id) async {
    data = data.copyWith(
      promptFolders: data.promptFolders
          .where((folder) => folder.id != id)
          .toList(),
      savedPrompts: data.savedPrompts
          .map(
            (prompt) => prompt.folderId == id
                ? prompt.copyWith(folderId: '', updatedAt: nowMs())
                : prompt,
          )
          .toList(),
    );
    await _persistAndNotify();
  }

  Future<List<PolybuzzItem>> loadPolybuzzCatalogPage(int page) async {
    final cacheKey = 'polybuzz:catalog:$page';
    final cached = await _repository.readCache(cacheKey);
    final cachedAt = intValue(cached?['cachedAt'], 0);
    if (cached != null &&
        nowMs() - cachedAt < const Duration(hours: 6).inMilliseconds) {
      final items = cached['items'] is List
          ? (cached['items'] as List).map(PolybuzzItem.fromJson).toList()
          : <PolybuzzItem>[];
      if (items.isNotEmpty) return items;
    }
    final result = await _polybuzzClient.fetchCatalogPage(page);
    await _repository.writeCache(cacheKey, {
      'cachedAt': nowMs(),
      'items': result.items.map((item) => item.toJson()).toList(),
      'hasMore': result.hasMore,
    });
    return result.items;
  }

  Future<List<PolybuzzItem>> searchPolybuzz(
    String query, {
    int page = 1,
  }) async {
    final result = await _polybuzzClient.search(query, page: page);
    return result.items;
  }

  Future<void> importPolybuzzText(String text) async {
    final character = await _polybuzzClient.importFromText(text);
    await upsertCharacter(character);
  }

  Future<void> importBackupText(String text) async {
    final decoded = jsonDecode(text);
    data = await _repository.importBackup(decoded);
    data = _ensureInitialMessages(data);
    await _persistAndNotify();
  }

  String exportBackupText() {
    return const JsonEncoder.withIndent('  ').convert(data.toBackupJson());
  }

  List<_Speaker> _speakersForTurn(
    CharacterProfile character,
    ChatRecord chat,
    String userText,
  ) {
    final lower = userText.toLowerCase();
    final speakers = <_Speaker>[_Speaker.main(character)];
    if (lower.contains('@all') || lower.contains('все')) {
      speakers.addAll(chat.tempCharacters.map(_Speaker.temp));
      return speakers;
    }
    for (final npc in chat.tempCharacters) {
      if (lower.contains(npc.name.toLowerCase())) {
        speakers.add(_Speaker.temp(npc));
      }
    }
    return speakers;
  }

  Future<void> _streamSpeaker(
    CharacterProfile character,
    _Speaker speaker,
  ) async {
    final pending = ChatMessage.assistant(
      '',
      id: newId(),
      pending: true,
      speakerId: speaker.id,
      speakerName: speaker.name,
      characterId: character.id,
    );
    final chat = data.activeChatFor(character.id);
    if (chat == null) return;
    _replaceChat(
      character.id,
      chat.copyWith(messages: [...chat.messages, pending], updatedAt: nowMs()),
    );
    notifyListeners();
    final generated = await _streamIntoMessage(
      character,
      speaker,
      pending.id,
      baseText: '',
    );
    final parsed = parseNpcCommands(generated);
    _updateMessage(character.id, pending.id, (message) {
      return message.copyWith(
        content: parsed.displayText.isEmpty ? generated : parsed.displayText,
        pending: false,
        ts: nowMs(),
      );
    });
    _applyNpcCommands(character.id, parsed.commands);
    await _persistAndNotify();
  }

  Future<String> _streamIntoMessage(
    CharacterProfile character,
    _Speaker speaker,
    String messageId, {
    required String baseText,
    List<JsonMap> extraMessages = const [],
  }) async {
    final chat = data.activeChatFor(character.id);
    if (chat == null) return baseText;
    var generated = '';
    final messages = _promptBuilder.buildMessages(
      profile: data.profile,
      character: character,
      chat: chat,
      speaker: speaker.tempCharacter,
      extraMessages: extraMessages,
      maxMessages: data.settings.maxMessagesForPrompt,
    );
    await for (final delta in _aiClient.streamChat(
      provider: data.settings.provider,
      apiKey: apiKeyFor(data.settings.provider),
      model: data.settings.modelId,
      messages: messages,
      temperature: data.settings.temperature,
    )) {
      generated += delta;
      _updateMessage(
        character.id,
        messageId,
        (message) => message.copyWith(content: baseText + generated),
      );
      notifyListeners();
    }
    return baseText + generated;
  }

  Future<void> _streamGroupSpeaker(
    String groupId,
    CharacterProfile character,
  ) async {
    var group = data.groupChats.firstWhereOrNull((item) => item.id == groupId);
    if (group == null) return;
    final pending = ChatMessage.assistant(
      '',
      pending: true,
      speakerId: character.id,
      speakerName: character.name,
      characterId: character.id,
    );
    group = group.copyWith(
      messages: [...group.messages, pending],
      updatedAt: nowMs(),
    );
    _replaceGroup(group);
    notifyListeners();
    var generated = '';
    final participants = group.characterIds
        .map(
          (id) => data.characters.firstWhereOrNull(
            (character) => character.id == id,
          ),
        )
        .whereType<CharacterProfile>()
        .toList();
    final messages = _promptBuilder.buildGroupMessages(
      profile: data.profile,
      speaker: character,
      allCharacters: participants,
      group: group,
    );
    await for (final delta in _aiClient.streamChat(
      provider: data.settings.provider,
      apiKey: apiKeyFor(data.settings.provider),
      model: data.settings.modelId,
      messages: messages,
      temperature: data.settings.temperature,
    )) {
      generated += delta;
      _updateGroupMessage(
        groupId,
        pending.id,
        (message) => message.copyWith(content: generated),
      );
      notifyListeners();
    }
    _updateGroupMessage(
      groupId,
      pending.id,
      (message) =>
          message.copyWith(content: generated, pending: false, ts: nowMs()),
    );
  }

  void _applyNpcCommands(String characterId, List<NpcCommand> commands) {
    var chat = data.activeChatFor(characterId);
    if (chat == null || commands.isEmpty) return;
    var tempCharacters = [...chat.tempCharacters];
    var messages = [...chat.messages];
    for (final command in commands) {
      if (command.type == 'create') {
        if (tempCharacters.any(
          (npc) => npc.name.toLowerCase() == command.name.toLowerCase(),
        )) {
          continue;
        }
        final npc = TempCharacter(
          id: newId(),
          name: command.name,
          gender: command.gender,
          intro: command.intro,
          avatarPath: '',
          source: 'auto',
          createdAt: nowMs(),
        );
        tempCharacters.add(npc);
        messages.add(ChatMessage.sceneEvent('npc_joined', npc));
      } else {
        final idx = tempCharacters.indexWhere(
          (npc) => npc.name.toLowerCase() == command.name.toLowerCase(),
        );
        if (idx < 0) continue;
        final npc = tempCharacters.removeAt(idx);
        messages.add(ChatMessage.sceneEvent('npc_left', npc));
      }
    }
    chat = chat.copyWith(
      tempCharacters: tempCharacters,
      messages: messages,
      updatedAt: nowMs(),
    );
    _replaceChat(characterId, chat);
  }

  _Speaker _speakerFromMessage(
    CharacterProfile character,
    ChatMessage message,
  ) {
    final npc = data
        .activeChatFor(character.id)
        ?.tempCharacters
        .firstWhereOrNull((item) => item.id == message.speakerId);
    return npc == null ? _Speaker.main(character) : _Speaker.temp(npc);
  }

  Future<void> _appendAssistantError(String characterId, String text) async {
    final chat = data.activeChatFor(characterId);
    if (chat == null) return;
    _replaceChat(
      characterId,
      chat.copyWith(
        messages: [...chat.messages, ChatMessage.assistant(text)],
        updatedAt: nowMs(),
      ),
    );
    await _persistAndNotify();
  }

  void _replaceChat(String characterId, ChatRecord chat) {
    final bucket =
        data.conversations[characterId] ??
        ConversationBucket.fromJson(null, characterId);
    final chats = [...bucket.chats];
    final idx = chats.indexWhere((item) => item.id == chat.id);
    if (idx == -1) {
      chats.insert(0, chat);
    } else {
      chats[idx] = chat;
    }
    data = data.copyWith(
      conversations: {
        ...data.conversations,
        characterId: bucket.copyWith(activeChatId: chat.id, chats: chats),
      },
    );
  }

  void _replaceGroup(GroupChat group) {
    final groups = [...data.groupChats];
    final idx = groups.indexWhere((item) => item.id == group.id);
    if (idx == -1) {
      groups.insert(0, group);
    } else {
      groups[idx] = group;
    }
    data = data.copyWith(groupChats: groups, activeGroupChatId: group.id);
  }

  void _updateMessage(
    String characterId,
    String messageId,
    ChatMessage Function(ChatMessage message) update,
  ) {
    final chat = data.activeChatFor(characterId);
    if (chat == null) return;
    final messages = chat.messages
        .map((message) => message.id == messageId ? update(message) : message)
        .toList();
    _replaceChat(
      characterId,
      chat.copyWith(messages: messages, updatedAt: nowMs()),
    );
  }

  void _updateGroupMessage(
    String groupId,
    String messageId,
    ChatMessage Function(ChatMessage message) update,
  ) {
    final group = data.groupChats.firstWhereOrNull(
      (item) => item.id == groupId,
    );
    if (group == null) return;
    final messages = group.messages
        .map((message) => message.id == messageId ? update(message) : message)
        .toList();
    _replaceGroup(group.copyWith(messages: messages, updatedAt: nowMs()));
  }

  AppData _ensureInitialMessages(AppData source) {
    var changed = false;
    final conversations = Map<String, ConversationBucket>.from(
      source.conversations,
    );
    for (final character in source.characters) {
      final bucket =
          conversations[character.id] ??
          ConversationBucket.fromJson(null, character.id);
      final chats = bucket.chats.map((chat) {
        if (chat.messages.isNotEmpty ||
            character.initialMessage.trim().isEmpty) {
          return chat;
        }
        changed = true;
        return chat.copyWith(
          messages: [
            ChatMessage.assistant(
              character.initialMessage,
              speakerId: character.id,
              speakerName: character.name,
              characterId: character.id,
            ),
          ],
        );
      }).toList();
      conversations[character.id] = bucket.copyWith(chats: chats);
    }
    return changed ? source.copyWith(conversations: conversations) : source;
  }

  Future<void> _persistAndNotify() async {
    await _persist();
    notifyListeners();
  }

  Future<void> _persist() async {
    await _repository.saveAppData(data);
  }
}

class _Speaker {
  _Speaker.main(CharacterProfile character)
    : id = character.id,
      name = character.name,
      tempCharacter = null;

  _Speaker.temp(TempCharacter npc)
    : id = npc.id,
      name = npc.name,
      tempCharacter = npc;

  final String id;
  final String name;
  final TempCharacter? tempCharacter;
}
