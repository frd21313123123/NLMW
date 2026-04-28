import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
import '../web_theme.dart';
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
          return const WebPage(
            child: Center(
              child: Text('Мульти-чат не найден', style: WebText.muted),
            ),
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
          backgroundColor: WebColors.bg,
          body: Stack(
            children: [
              Column(
                children: [
                  SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(6, 8, 6, 8),
                      child: Row(
                        children: [
                          WebIconButton(
                            icon: Icons.arrow_back,
                            onPressed: () => context.go('/'),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(group.title, style: WebText.title),
                                Text(
                                  participants
                                      .map((item) => item.name)
                                      .join(', '),
                                  style: WebText.muted,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 108),
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
                ],
              ),
              Positioned(
                left: 8,
                right: 8,
                bottom: 8,
                child: SafeArea(
                  top: false,
                  child: WebBlurPanel(
                    padding: const EdgeInsets.all(6),
                    radius: 18,
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: inputController,
                            minLines: 1,
                            maxLines: 5,
                            enabled: !controller.generating,
                            style: WebText.body,
                            decoration: const InputDecoration(
                              hintText: 'Сообщение в мульти-чат...',
                              filled: true,
                              fillColor: Color(0x3D000000),
                              border: OutlineInputBorder(
                                borderSide: BorderSide.none,
                                borderRadius: BorderRadius.all(
                                  Radius.circular(14),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 44,
                          height: 44,
                          child: FilledButton(
                            onPressed: controller.generating
                                ? null
                                : () {
                                    final text = inputController.text.trim();
                                    if (text.isEmpty) return;
                                    inputController.clear();
                                    controller.sendGroupMessage(group.id, text);
                                  },
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
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: WebBlurPanel(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            radius: 18,
            color: isUser ? WebColors.chatUser : WebColors.chatBot,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isUser && speaker != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      speaker!.name,
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
                  style: WebText.body,
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
