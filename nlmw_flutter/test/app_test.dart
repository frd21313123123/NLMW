import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nlmw_flutter/src/app.dart';
import 'package:nlmw_flutter/src/data/app_database.dart';
import 'package:nlmw_flutter/src/data/local_repository.dart';
import 'package:nlmw_flutter/src/data/secure_settings.dart';
import 'package:nlmw_flutter/src/domain/models.dart';
import 'package:nlmw_flutter/src/domain/npc_commands.dart';
import 'package:nlmw_flutter/src/domain/prompt_builder.dart';
import 'package:nlmw_flutter/src/services/ai_client.dart';
import 'package:nlmw_flutter/src/services/polybuzz_client.dart';
import 'package:nlmw_flutter/src/services/sse_parser.dart';
import 'package:nlmw_flutter/src/state/app_controller.dart';
import 'package:nlmw_flutter/src/state/app_providers.dart';

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  test('normalizes profile and character records', () {
    final profile = UserProfile.fromJson({'name': '', 'gender': 'ж'});
    final character = CharacterProfile.fromJson({
      'name': 'Eva',
      'gender': 'female',
      'tags': 'city, neon',
      'greeting': 'Hello',
      'scenario': 'Cafe',
    });

    expect(profile.name, 'Вы');
    expect(profile.gender, Gender.female);
    expect(character.name, 'Eva');
    expect(character.tags, ['city', 'neon']);
    expect(character.initialMessage, 'Hello');
    expect(character.backstory, contains('Cafe'));
  });

  test('imports and exports nlmw backup format without api keys', () {
    final original = AppData.initial();
    final backup = original.toBackupJson();
    final imported = AppData.fromJson(backup);

    expect(backup.toString(), isNot(contains('api_key')));
    expect(imported.characters.single.name, original.characters.single.name);
    expect(imported.selectedCharacterId, original.selectedCharacterId);
  });

  test('builds system prompt with character and temp npc context', () {
    final data = AppData.initial();
    final character = data.characters.first;
    final prompt = const PromptBuilder().buildSystemPrompt(
      profile: data.profile,
      character: character,
      tempCharacters: [
        TempCharacter(
          id: 'npc',
          name: 'Mira',
          gender: Gender.female,
          intro: 'Witness',
          avatarPath: '',
          source: 'manual',
          createdAt: 1,
        ),
      ],
    );

    expect(prompt, contains(character.name));
    expect(prompt, contains('Mira'));
    expect(prompt, contains('NPC_CREATE'));
  });

  test('parses SSE data chunks', () {
    final parser = SseDataParser();
    final events = [
      ...parser.addLine('data: {"choices":[{"delta":{"content":"Hel"}}]}'),
      ...parser.addLine(''),
      ...parser.addLine('data: {"choices":[{"delta":{"content":"lo"}}]}'),
      ...parser.addLine(''),
    ];

    expect(events.map(contentDeltaFromSseJson).join(), 'Hello');
  });

  test('parses npc commands and removes command text', () {
    final parsed = parseNpcCommands(
      'Hi [[NPC_CREATE: name="Kai"; gender="male"; intro="guard"]] bye [[NPC_REMOVE: name="Kai"]]',
    );

    expect(parsed.displayText, 'Hi  bye');
    expect(parsed.commands, hasLength(2));
    expect(parsed.commands.first.name, 'Kai');
    expect(parsed.commands.first.gender, Gender.male);
  });

  test('regeneration creates branch versions', () async {
    final controller = await _makeController(
      FakeAiClient(['first answer', 'second answer']),
    );
    await controller.updateApiKey(AiProviderKind.mistral, 'test-key');
    await controller.sendPersonalMessage('Hello');

    final character = controller.data.selectedCharacter!;
    var chat = controller.data.activeChatFor(character.id)!;
    final assistant = chat.messages.lastWhere(
      (message) =>
          message.role == 'assistant' && message.content == 'first answer',
    );

    await controller.regenerateMessage(assistant.id);

    chat = controller.data.activeChatFor(character.id)!;
    final regenerated = chat.messages.firstWhere(
      (message) => message.id == assistant.id,
    );
    expect(regenerated.content, 'second answer');
    expect(
      regenerated.branchVersions.map((branch) => branch.content),
      contains('first answer'),
    );
    expect(
      regenerated.branchVersions.map((branch) => branch.content),
      contains('second answer'),
    );
  });

  testWidgets('chat list renders and opens profile', (tester) async {
    final controller = await _makeController(FakeAiClient());
    await tester.pumpWidget(_testApp(controller));
    await tester.pumpAndSettle();

    expect(find.text('Личные'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.person));
    await tester.pumpAndSettle();
    expect(find.text('Профиль'), findsOneWidget);
  });

  testWidgets('character editor saves a new character', (tester) async {
    final controller = await _makeController(FakeAiClient());
    await tester.pumpWidget(_testApp(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add_circle));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Имя'),
      'Test Character',
    );
    await tester.scrollUntilVisible(
      find.text('Сохранить'),
      700,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.ensureVisible(find.text('Сохранить'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Сохранить'));
    await tester.pumpAndSettle();

    expect(
      controller.data.characters.any(
        (character) => character.name == 'Test Character',
      ),
      isTrue,
    );
  });

  testWidgets('profile settings stores provider api key', (tester) async {
    final controller = await _makeController(FakeAiClient());
    await tester.pumpWidget(_testApp(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.person));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Mistral API Key'),
      'secret',
    );
    await tester.tap(find.text('Сохранить ключ на телефоне'));
    await tester.pumpAndSettle();

    expect(controller.apiKeyFor(AiProviderKind.mistral), 'secret');
  });

  testWidgets('prompt manager can create prompt', (tester) async {
    final controller = await _makeController(FakeAiClient());
    await tester.pumpWidget(_testApp(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.library_books));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Название'),
      'Greeting',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Текст'),
      'Say hello',
    );
    await tester.tap(find.text('Сохранить').last);
    await tester.pumpAndSettle();

    expect(
      controller.data.savedPrompts.any((prompt) => prompt.title == 'Greeting'),
      isTrue,
    );
  });
}

Future<AppController> _makeController(FakeAiClient aiClient) async {
  final database = AppDatabase(NativeDatabase.memory());
  final controller = AppController(
    repository: LocalRepository(database),
    secureSettings: FakeSecureSettingsStore(),
    aiClient: aiClient,
    polybuzzClient: FakePolybuzzClient(),
  );
  await controller.initialize();
  return controller;
}

Widget _testApp(AppController controller) {
  return ProviderScope(
    overrides: [appControllerProvider.overrideWithValue(controller)],
    child: const NlmwApp(),
  );
}

class FakeSecureSettingsStore implements SecureSettingsStore {
  final Map<AiProviderKind, String> keys = {};

  @override
  Future<String> readApiKey(AiProviderKind provider) async =>
      keys[provider] ?? '';

  @override
  Future<void> writeApiKey(AiProviderKind provider, String value) async {
    keys[provider] = value.trim();
  }
}

class FakeAiClient implements AiClient {
  FakeAiClient([List<String>? responses])
    : responses = responses ?? const ['ok'];

  final List<String> responses;
  int calls = 0;

  @override
  Future<List<AiModel>> fetchModels({
    required AiProviderKind provider,
    required String apiKey,
  }) async {
    return [AiModel(id: provider.defaultModel, name: provider.defaultModel)];
  }

  @override
  Stream<String> streamChat({
    required AiProviderKind provider,
    required String apiKey,
    required String model,
    required List<JsonMap> messages,
    required double temperature,
  }) async* {
    final response = responses[calls.clamp(0, responses.length - 1)];
    calls += 1;
    yield response;
  }
}

class FakePolybuzzClient implements PolybuzzClient {
  @override
  String extractSecretSceneId(String rawUrl) => 'fake';

  @override
  Future<PolybuzzCatalogPage> fetchCatalogPage(int page) async {
    return const PolybuzzCatalogPage(items: [], hasMore: false);
  }

  @override
  Future<CharacterProfile> importBySecretSceneId(
    String secretSceneId, {
    String sourceUrl = '',
  }) async {
    return CharacterProfile.defaultValue().copyWith(
      id: 'polybuzz_$secretSceneId',
      name: 'Poly',
    );
  }

  @override
  Future<CharacterProfile> importFromText(String text) async {
    return CharacterProfile.defaultValue().copyWith(
      id: 'polybuzz_fake',
      name: 'Poly',
    );
  }

  @override
  Future<PolybuzzCatalogPage> search(
    String query, {
    int page = 1,
    int pageSize = 24,
  }) async {
    return const PolybuzzCatalogPage(items: [], hasMore: false);
  }
}
