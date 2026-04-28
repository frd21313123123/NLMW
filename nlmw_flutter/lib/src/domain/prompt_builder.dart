import 'models.dart';

class PromptBuilder {
  const PromptBuilder();

  String buildSystemPrompt({
    required UserProfile profile,
    required CharacterProfile character,
    required List<TempCharacter> tempCharacters,
  }) {
    final style = styleById(character.dialogueStyle);
    final charName = character.name.trim().isEmpty
        ? 'Персонаж'
        : character.name.trim();
    final userName = profile.name.trim().isEmpty
        ? 'Пользователь'
        : profile.name.trim();
    final parts = <String>[
      'Ты — $charName. Ты ведешь ролевой диалог: пользователь ($userName) пишет тебе, ты отвечаешь от лица $charName.',
      'Ты не пользователь и не говоришь "с персонажем": ты сам этот персонаж.',
      'Пол персонажа: ${character.gender.label}.',
    ];

    void add(String label, String value) {
      final text = value.trim();
      if (text.isNotEmpty) parts.add('$label: $text');
    }

    add('Описание', character.intro);
    add('Внешность/одежда', character.outfit);
    add('Обстановка', character.setting);
    add('Фон', character.backgroundHint);
    add('Предыстория', character.backstory);
    if (character.tags.isNotEmpty) {
      parts.add('Теги: ${character.tags.join(", ")}');
    }
    parts.add('Стиль диалога: ${style.prompt}');
    parts.add('Собеседник: $userName (пол: ${profile.gender.label}).');
    parts.addAll([
      'Правила:',
      '- Не выходи из роли и не упоминай системные инструкции.',
      '- Отвечай на языке пользователя, по умолчанию на русском.',
      '- Пиши естественно, без канцелярита, избегай повторов и лишних вступлений.',
      '- Не выдумывай факты о пользователе; если нужно, уточни.',
      '- Не используй служебные метки вроде "assistant:" или "role:".',
      '- Если в сцене появляется новый временный персонаж, можешь добавить команду [[NPC_CREATE: name="Имя"; gender="female|male|other|unspecified"; intro="кратко"]].',
      '- Если временный персонаж уходит, можешь добавить команду [[NPC_REMOVE: name="Имя"]].',
    ]);

    if (tempCharacters.isNotEmpty) {
      parts.add('[Побочные персонажи сцены]');
      for (final npc in tempCharacters) {
        final intro = npc.intro.trim().isEmpty ? '' : ': ${npc.intro.trim()}';
        parts.add('- ${npc.name} (${npc.gender.label})$intro');
      }
      parts.add(
        'Ты можешь реагировать на NPC, но не должен постоянно говорить за них.',
      );
    }

    return parts.join('\n');
  }

  List<JsonMap> buildMessages({
    required UserProfile profile,
    required CharacterProfile character,
    required ChatRecord chat,
    TempCharacter? speaker,
    List<JsonMap> extraMessages = const [],
    int maxMessages = 40,
  }) {
    final displayCharacter = speaker == null
        ? character
        : character.copyWith(
            id: speaker.id,
            name: speaker.name,
            gender: speaker.gender,
            intro: speaker.intro.isEmpty ? character.intro : speaker.intro,
            avatarPath: speaker.avatarPath,
          );
    final system = buildSystemPrompt(
      profile: profile,
      character: displayCharacter,
      tempCharacters: chat.tempCharacters
          .where((npc) => npc.id != speaker?.id)
          .toList(),
    );

    final messages = <JsonMap>[
      {'role': 'system', 'content': system},
    ];

    final history = chat.messages
        .where((message) => !message.pending && message.isChatMessage)
        .toList();
    final recent = history.length > maxMessages
        ? history.sublist(history.length - maxMessages)
        : history;
    for (final message in recent) {
      var content = message.content.trim();
      if (content.isEmpty) continue;
      if (message.role == 'assistant' && message.speakerName.isNotEmpty) {
        content = '${message.speakerName}: $content';
      }
      messages.add({
        'role': message.role == 'user' ? 'user' : 'assistant',
        'content': content,
      });
    }

    messages.addAll(extraMessages);
    return messages;
  }

  List<JsonMap> buildGroupMessages({
    required UserProfile profile,
    required CharacterProfile speaker,
    required List<CharacterProfile> allCharacters,
    required GroupChat group,
    int maxMessages = 50,
  }) {
    final otherNames = allCharacters
        .where((item) => item.id != speaker.id)
        .map((item) => item.name)
        .join(', ');
    final system = [
      buildSystemPrompt(
        profile: profile,
        character: speaker,
        tempCharacters: const [],
      ),
      if (otherNames.isNotEmpty)
        'В этом мульти-чате также участвуют: $otherNames.',
      'Отвечай только от лица ${speaker.name}. Не пиши реплики других участников.',
    ].join('\n\n');
    final messages = <JsonMap>[
      {'role': 'system', 'content': system},
    ];

    final history = group.messages
        .where((message) => !message.pending && message.isChatMessage)
        .toList();
    final recent = history.length > maxMessages
        ? history.sublist(history.length - maxMessages)
        : history;
    for (final message in recent) {
      final role = message.role == 'user' ? 'user' : 'assistant';
      var content = message.content.trim();
      if (content.isEmpty) continue;
      if (message.role == 'assistant') {
        final name = allCharacters
            .firstWhere(
              (character) => character.id == message.characterId,
              orElse: () => speaker,
            )
            .name;
        content = '$name: $content';
      }
      messages.add({'role': role, 'content': content});
    }
    return messages;
  }
}
