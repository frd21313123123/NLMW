import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
import '../widgets/app_avatar.dart';
import '../widgets/controller_gate.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.characterId});

  final String characterId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final inputController = TextEditingController();

  @override
  void dispose() {
    inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final character = controller.data.characters
            .where((item) => item.id == widget.characterId)
            .firstOrNull;
        if (character == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Персонаж не найден')),
          );
        }
        if (controller.data.selectedCharacterId != character.id) {
          Future.microtask(() => controller.selectCharacter(character.id));
        }
        final chat = controller.data.activeChatFor(character.id);
        final bg = imageProviderFromPath(character.backgroundPath);
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: Row(
              children: [
                AppAvatar(
                  imagePath: character.avatarPath,
                  label: character.name,
                  radius: 18,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(character.name, overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Новый чат',
                onPressed: () =>
                    controller.createChatForCharacter(character.id),
                icon: const Icon(Icons.add_comment),
              ),
              IconButton(
                tooltip: 'NPC',
                onPressed: () =>
                    _showNpcDialog(context, controller, character.id),
                icon: const Icon(Icons.person_add),
              ),
              IconButton(
                tooltip: 'Настройки персонажа',
                onPressed: () => context.go('/character/${character.id}'),
                icon: const Icon(Icons.tune),
              ),
            ],
          ),
          body: DecoratedBox(
            decoration: BoxDecoration(
              image: bg == null
                  ? null
                  : DecorationImage(
                      image: bg,
                      fit: BoxFit.cover,
                      colorFilter: ColorFilter.mode(
                        Colors.black.withValues(alpha: 0.52),
                        BlendMode.darken,
                      ),
                    ),
            ),
            child: Column(
              children: [
                if (chat != null && chat.tempCharacters.isNotEmpty)
                  SizedBox(
                    height: 52,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      children: [
                        for (final npc in chat.tempCharacters)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: InputChip(
                              avatar: AppAvatar(
                                imagePath: npc.avatarPath,
                                label: npc.name,
                                radius: 12,
                              ),
                              label: Text(npc.name),
                              onDeleted: () => controller.removeTempCharacter(
                                character.id,
                                npc.id,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                Expanded(
                  child: chat == null
                      ? const Center(child: Text('Чат не найден'))
                      : ListView.builder(
                          reverse: true,
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                          itemCount: chat.messages.length,
                          itemBuilder: (context, index) {
                            final message =
                                chat.messages[chat.messages.length - index - 1];
                            return _MessageBubble(
                              message: message,
                              character: character,
                              onRegenerate: message.role == 'assistant'
                                  ? () =>
                                        controller.regenerateMessage(message.id)
                                  : null,
                              onBranchPrev: message.branchVersions.length > 1
                                  ? () => controller.switchMessageBranch(
                                      message.id,
                                      -1,
                                    )
                                  : null,
                              onBranchNext: message.branchVersions.length > 1
                                  ? () => controller.switchMessageBranch(
                                      message.id,
                                      1,
                                    )
                                  : null,
                            );
                          },
                        ),
                ),
                if (controller.status.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        controller.status,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ),
                _Composer(
                  controller: inputController,
                  enabled: !controller.generating,
                  onSend: (text) => controller.sendPersonalMessage(text),
                  onContinue: () => controller.continueLastAnswer(),
                  onThoughts: () =>
                      controller.continueLastAnswer(thoughts: true),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _showNpcDialog(
    BuildContext context,
    dynamic controller,
    String characterId,
  ) async {
    final nameController = TextEditingController();
    final introController = TextEditingController();
    var gender = Gender.unspecified;
    final npc = await showDialog<TempCharacter>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Добавить NPC'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'Имя'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<Gender>(
                    initialValue: gender,
                    decoration: const InputDecoration(labelText: 'Пол'),
                    items: Gender.values
                        .map(
                          (item) => DropdownMenuItem(
                            value: item,
                            child: Text(item.label),
                          ),
                        )
                        .toList(),
                    onChanged: (value) =>
                        setState(() => gender = value ?? Gender.unspecified),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: introController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Описание'),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  onPressed: () {
                    if (nameController.text.trim().isEmpty) return;
                    Navigator.pop(
                      context,
                      TempCharacter(
                        id: newId(),
                        name: nameController.text.trim(),
                        gender: gender,
                        intro: introController.text.trim(),
                        avatarPath: '',
                        source: 'manual',
                        createdAt: nowMs(),
                      ),
                    );
                  },
                  child: const Text('Добавить'),
                ),
              ],
            );
          },
        );
      },
    );
    if (npc != null) await controller.addTempCharacter(characterId, npc);
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.character,
    this.onRegenerate,
    this.onBranchPrev,
    this.onBranchNext,
  });

  final ChatMessage message;
  final CharacterProfile character;
  final VoidCallback? onRegenerate;
  final VoidCallback? onBranchPrev;
  final VoidCallback? onBranchNext;

  @override
  Widget build(BuildContext context) {
    if (message.role == 'scene_event') {
      final text = message.type == 'npc_left'
          ? '${message.npcName} покидает сцену'
          : '${message.npcName} появляется в сцене';
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.28),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(text),
            ),
          ),
        ),
      );
    }
    final isUser = message.role == 'user';
    final align = isUser ? Alignment.centerRight : Alignment.centerLeft;
    final color = isUser
        ? Theme.of(context).colorScheme.primaryContainer
        : Theme.of(context).colorScheme.surfaceContainerHighest;
    final speaker =
        message.speakerName.isNotEmpty && message.speakerName != character.name
        ? message.speakerName
        : '';
    return Align(
      alignment: align,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
        ),
        child: Card(
          color: color.withValues(alpha: 0.92),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (speaker.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      speaker,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                SelectableText(
                  message.pending && message.content.isEmpty
                      ? '...'
                      : message.content,
                ),
                if (!isUser)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (message.pending)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      if (!message.pending && onRegenerate != null)
                        IconButton(
                          tooltip: 'Перегенерировать',
                          icon: const Icon(Icons.refresh),
                          onPressed: onRegenerate,
                        ),
                      if (onBranchPrev != null && onBranchNext != null) ...[
                        IconButton(
                          tooltip: 'Предыдущая ветка',
                          icon: const Icon(Icons.chevron_left),
                          onPressed: onBranchPrev,
                        ),
                        Text(
                          '${message.activeBranchIdx + 1}/${message.branchVersions.length}',
                        ),
                        IconButton(
                          tooltip: 'Следующая ветка',
                          icon: const Icon(Icons.chevron_right),
                          onPressed: onBranchNext,
                        ),
                      ],
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.enabled,
    required this.onSend,
    required this.onContinue,
    required this.onThoughts,
  });

  final TextEditingController controller;
  final bool enabled;
  final ValueChanged<String> onSend;
  final VoidCallback onContinue;
  final VoidCallback onThoughts;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
        child: Row(
          children: [
            IconButton(
              tooltip: 'Продолжить',
              onPressed: enabled ? onContinue : null,
              icon: const Icon(Icons.keyboard_double_arrow_right),
            ),
            IconButton(
              tooltip: 'Мысли',
              onPressed: enabled ? onThoughts : null,
              icon: const Icon(Icons.psychology),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                enabled: enabled,
                decoration: const InputDecoration(hintText: 'Сообщение...'),
                onSubmitted: enabled ? _submit : null,
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: enabled ? () => _submit(controller.text) : null,
              child: const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }

  void _submit(String text) {
    final clean = text.trim();
    if (clean.isEmpty) return;
    controller.clear();
    onSend(clean);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
