import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
import '../widgets/controller_gate.dart';

class GroupChatScreen extends StatefulWidget {
  const GroupChatScreen({super.key, required this.groupId});

  final String groupId;

  @override
  State<GroupChatScreen> createState() => _GroupChatScreenState();
}

class _GroupChatScreenState extends State<GroupChatScreen> {
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
        final group = controller.data.groupChats
            .where((item) => item.id == widget.groupId)
            .firstOrNull;
        if (group == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Мульти-чат не найден')),
          );
        }
        final participants = group.characterIds
            .map(
              (id) => controller.data.characters
                  .where((character) => character.id == id)
                  .firstOrNull,
            )
            .whereType<CharacterProfile>()
            .toList();
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(group.title),
                Text(
                  participants.map((item) => item.name).join(', '),
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          body: Column(
            children: [
              Expanded(
                child: ListView.builder(
                  reverse: true,
                  padding: const EdgeInsets.all(12),
                  itemCount: group.messages.length,
                  itemBuilder: (context, index) {
                    final message =
                        group.messages[group.messages.length - index - 1];
                    final speaker = participants
                        .where((item) => item.id == message.characterId)
                        .firstOrNull;
                    return _GroupBubble(message: message, speaker: speaker);
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
                    child: Text(controller.status),
                  ),
                ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: inputController,
                          minLines: 1,
                          maxLines: 5,
                          enabled: !controller.generating,
                          decoration: const InputDecoration(
                            hintText: 'Сообщение в мульти-чат...',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: controller.generating
                            ? null
                            : () {
                                final text = inputController.text.trim();
                                if (text.isEmpty) return;
                                inputController.clear();
                                controller.sendGroupMessage(group.id, text);
                              },
                        child: const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _GroupBubble extends StatelessWidget {
  const _GroupBubble({required this.message, this.speaker});

  final ChatMessage message;
  final CharacterProfile? speaker;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.84,
        ),
        child: Card(
          color: isUser
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isUser && speaker != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      speaker!.name,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ),
                SelectableText(
                  message.pending && message.content.isEmpty
                      ? '...'
                      : message.content,
                ),
                if (message.pending)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
