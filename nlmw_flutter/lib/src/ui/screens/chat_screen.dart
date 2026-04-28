import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
import '../web_theme.dart';
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
          return const WebPage(
            child: Center(
              child: Text('Персонаж не найден', style: WebText.muted),
            ),
          );
        }
        if (controller.data.selectedCharacterId != character.id) {
          Future.microtask(() => controller.selectCharacter(character.id));
        }
        final chat = controller.data.activeChatFor(character.id);
        final bg = imageProviderFromPath(character.backgroundPath);
        return Scaffold(
          backgroundColor: WebColors.bg,
          body: Stack(
            children: [
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: WebColors.bg,
                    image: bg == null
                        ? null
                        : DecorationImage(
                            image: bg,
                            fit: BoxFit.cover,
                            colorFilter: ColorFilter.mode(
                              Colors.black.withValues(alpha: 0.58),
                              BlendMode.darken,
                            ),
                          ),
                  ),
                ),
              ),
              Positioned.fill(
                child: Column(
                  children: [
                    _ChatHeader(
                      character: character,
                      onBack: () => context.go('/'),
                      onNewChat: () =>
                          controller.createChatForCharacter(character.id),
                      onNpc: () =>
                          _showNpcDialog(context, controller, character.id),
                      onEdit: () => context.go('/character/${character.id}'),
                    ),
                    if (chat != null && chat.tempCharacters.isNotEmpty)
                      _NpcStrip(
                        chat: chat,
                        onRemove: (npcId) =>
                            controller.removeTempCharacter(character.id, npcId),
                      ),
                    Expanded(
                      child: chat == null
                          ? const Center(
                              child: Text(
                                'Чат не найден',
                                style: WebText.muted,
                              ),
                            )
                          : ListView.builder(
                              reverse: true,
                              padding: const EdgeInsets.fromLTRB(
                                12,
                                8,
                                12,
                                116,
                              ),
                              itemCount: chat.messages.length,
                              itemBuilder: (context, index) {
                                final message = chat
                                    .messages[chat.messages.length - index - 1];
                                return _MessageBubble(
                                  message: message,
                                  character: character,
                                  onRegenerate: message.role == 'assistant'
                                      ? () => controller.regenerateMessage(
                                          message.id,
                                        )
                                      : null,
                                  onBranchPrev:
                                      message.branchVersions.length > 1
                                      ? () => controller.switchMessageBranch(
                                          message.id,
                                          -1,
                                        )
                                      : null,
                                  onBranchNext:
                                      message.branchVersions.length > 1
                                      ? () => controller.switchMessageBranch(
                                          message.id,
                                          1,
                                        )
                                      : null,
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 8,
                right: 8,
                bottom: 8,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (controller.status.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
                        child: Text(controller.status, style: WebText.muted),
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
            ],
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
              backgroundColor: WebColors.surface,
              title: const Text('Добавить NPC'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: webInputDecoration('', label: 'Имя'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<Gender>(
                    initialValue: gender,
                    decoration: webInputDecoration('', label: 'Пол'),
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
                    decoration: webInputDecoration('', label: 'Описание'),
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

class _ChatHeader extends StatelessWidget {
  const _ChatHeader({
    required this.character,
    required this.onBack,
    required this.onNewChat,
    required this.onNpc,
    required this.onEdit,
  });

  final CharacterProfile character;
  final VoidCallback onBack;
  final VoidCallback onNewChat;
  final VoidCallback onNpc;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 8, 6, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xD9000000), Color(0x00000000)],
          ),
        ),
        child: Row(
          children: [
            WebIconButton(icon: Icons.arrow_back, onPressed: onBack),
            AppAvatar(
              imagePath: character.avatarPath,
              label: character.name,
              radius: 18,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                character.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: WebColors.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            WebIconButton(
              tooltip: 'Новый чат',
              icon: Icons.add_comment,
              onPressed: onNewChat,
            ),
            WebIconButton(
              tooltip: 'NPC',
              icon: Icons.person_add,
              onPressed: onNpc,
            ),
            WebIconButton(
              tooltip: 'Настройки персонажа',
              icon: Icons.tune,
              onPressed: onEdit,
            ),
          ],
        ),
      ),
    );
  }
}

class _NpcStrip extends StatelessWidget {
  const _NpcStrip({required this.chat, required this.onRemove});

  final ChatRecord chat;
  final ValueChanged<String> onRemove;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        children: [
          for (final npc in chat.tempCharacters)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: WebBlurPanel(
                padding: const EdgeInsets.fromLTRB(6, 4, 6, 4),
                radius: 18,
                color: const Color(0x99000000),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppAvatar(
                      imagePath: npc.avatarPath,
                      label: npc.name,
                      radius: 13,
                    ),
                    const SizedBox(width: 6),
                    Text(npc.name, style: WebText.muted),
                    const SizedBox(width: 2),
                    InkResponse(
                      onTap: () => onRemove(npc.id),
                      radius: 16,
                      child: const Icon(
                        Icons.close,
                        color: WebColors.muted,
                        size: 16,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
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
          child: WebBlurPanel(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            radius: 999,
            color: const Color(0x66000000),
            child: Text(text, style: WebText.muted),
          ),
        ),
      );
    }
    final isUser = message.role == 'user';
    final speaker =
        message.speakerName.isNotEmpty && message.speakerName != character.name
        ? message.speakerName
        : '';
    final bubble = ConstrainedBox(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.76,
      ),
      child: WebBlurPanel(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        radius: 18,
        color: isUser ? WebColors.chatUser : WebColors.chatBot,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (speaker.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  speaker,
                  style: const TextStyle(
                    color: WebColors.accentText,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            SelectableText(
              message.pending && message.content.isEmpty
                  ? '...'
                  : message.content,
              style: const TextStyle(
                color: WebColors.text,
                fontSize: 15,
                height: 1.38,
              ),
            ),
            if (!isUser)
              _MessageActions(
                message: message,
                onRegenerate: onRegenerate,
                onBranchPrev: onBranchPrev,
                onBranchNext: onBranchNext,
              ),
          ],
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: isUser
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser) ...[
            AppAvatar(
              imagePath: character.avatarPath,
              label: character.name,
              radius: 16,
            ),
            const SizedBox(width: 8),
          ],
          bubble,
          if (isUser) const SizedBox(width: 40),
        ],
      ),
    );
  }
}

class _MessageActions extends StatelessWidget {
  const _MessageActions({
    required this.message,
    this.onRegenerate,
    this.onBranchPrev,
    this.onBranchNext,
  });

  final ChatMessage message;
  final VoidCallback? onRegenerate;
  final VoidCallback? onBranchPrev;
  final VoidCallback? onBranchNext;

  @override
  Widget build(BuildContext context) {
    if (message.pending) {
      return const Padding(
        padding: EdgeInsets.only(top: 8),
        child: SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (onRegenerate == null && onBranchPrev == null) return const SizedBox();
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onRegenerate != null)
            IconButton(
              tooltip: 'Перегенерировать',
              icon: const Icon(Icons.refresh, size: 18),
              color: WebColors.muted,
              onPressed: onRegenerate,
            ),
          if (onBranchPrev != null && onBranchNext != null) ...[
            IconButton(
              tooltip: 'Предыдущая ветка',
              icon: const Icon(Icons.chevron_left, size: 18),
              color: WebColors.muted,
              onPressed: onBranchPrev,
            ),
            Text(
              '${message.activeBranchIdx + 1}/${message.branchVersions.length}',
              style: WebText.muted,
            ),
            IconButton(
              tooltip: 'Следующая ветка',
              icon: const Icon(Icons.chevron_right, size: 18),
              color: WebColors.muted,
              onPressed: onBranchNext,
            ),
          ],
        ],
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
      child: WebBlurPanel(
        padding: const EdgeInsets.fromLTRB(6, 6, 6, 6),
        radius: 18,
        child: Row(
          children: [
            WebIconButton(
              tooltip: 'Продолжить',
              onPressed: enabled ? onContinue : null,
              icon: Icons.keyboard_double_arrow_right,
              panel: true,
            ),
            WebIconButton(
              tooltip: 'Мысли',
              onPressed: enabled ? onThoughts : null,
              icon: Icons.psychology,
              panel: true,
            ),
            const SizedBox(width: 4),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                enabled: enabled,
                style: WebText.body,
                decoration: InputDecoration(
                  hintText: 'Сообщение...',
                  hintStyle: const TextStyle(color: WebColors.muted),
                  filled: true,
                  fillColor: const Color(0x3D000000),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
                onSubmitted: enabled ? _submit : null,
              ),
            ),
            const SizedBox(width: 6),
            SizedBox(
              width: 44,
              height: 44,
              child: FilledButton(
                onPressed: enabled ? () => _submit(controller.text) : null,
                style: FilledButton.styleFrom(
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Icon(Icons.send, size: 20),
              ),
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
