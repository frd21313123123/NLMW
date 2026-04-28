import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../domain/models.dart';
import '../../state/app_controller.dart';
import '../web_theme.dart';
import '../widgets/app_avatar.dart';
import '../widgets/controller_gate.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        return DefaultTabController(
          length: 2,
          child: WebPage(
            bottomNav: 'chats',
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: WebSearchField(
                          hint: 'Поиск',
                          onChanged: (value) => setState(() => query = value),
                        ),
                      ),
                      const SizedBox(width: 10),
                      WebIconButton(
                        tooltip: 'Промты',
                        icon: Icons.library_books,
                        onPressed: () => context.go('/prompts'),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Container(
                    height: 36,
                    decoration: BoxDecoration(
                      color: WebColors.surface,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: WebColors.border),
                    ),
                    child: TabBar(
                      dividerColor: Colors.transparent,
                      indicatorSize: TabBarIndicatorSize.tab,
                      labelColor: WebColors.text,
                      unselectedLabelColor: WebColors.muted,
                      indicator: BoxDecoration(
                        color: WebColors.surface2,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      tabs: const [
                        Tab(text: 'Личные'),
                        Tab(text: 'Мульти'),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      _PersonalChats(query: query),
                      const _GroupChats(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _PersonalChats extends StatelessWidget {
  const _PersonalChats({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final q = query.trim().toLowerCase();
        final characters = controller.data.characters.where((character) {
          if (q.isEmpty) return true;
          return character.name.toLowerCase().contains(q) ||
              character.intro.toLowerCase().contains(q) ||
              character.tags.join(' ').toLowerCase().contains(q);
        }).toList();

        if (characters.isEmpty) {
          return const Center(
            child: Text('Ничего не найдено', style: WebText.muted),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          itemCount: characters.length,
          itemBuilder: (context, index) {
            final character = characters[index];
            final chat = controller.data.activeChatFor(character.id);
            final last = chat?.messages.lastWhere(
              (message) => message.isChatMessage,
              orElse: () => ChatMessage.assistant(character.initialMessage),
            );
            return _ChatRow(
              avatar: AppAvatar(
                imagePath: character.avatarPath,
                label: character.name,
                radius: 26,
              ),
              title: character.name,
              subtitle: last?.content.trim().isNotEmpty == true
                  ? last!.content
                  : character.intro,
              trailing: IconButton(
                tooltip: 'Редактировать',
                icon: const Icon(Icons.more_horiz, color: WebColors.muted),
                onPressed: () => context.go('/character/${character.id}'),
              ),
              onTap: () async {
                await controller.selectCharacter(character.id);
                if (context.mounted) context.go('/chat/${character.id}');
              },
            );
          },
        );
      },
    );
  }
}

class _GroupChats extends StatelessWidget {
  const _GroupChats();

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final groups = controller.data.groupChats;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: SizedBox(
                width: double.infinity,
                height: 46,
                child: OutlinedButton.icon(
                  onPressed: () => _showCreateGroup(context, controller),
                  icon: const Icon(Icons.group_add),
                  label: const Text('Создать мульти-чат'),
                ),
              ),
            ),
            Expanded(
              child: groups.isEmpty
                  ? const Center(
                      child: Text(
                        'Мульти-чаты пока не созданы',
                        style: WebText.muted,
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                      itemCount: groups.length,
                      itemBuilder: (context, index) {
                        final group = groups[index];
                        final names = group.characterIds
                            .map(
                              (id) => controller.data.characters
                                  .where((character) => character.id == id)
                                  .firstOrNull
                                  ?.name,
                            )
                            .whereType<String>()
                            .join(', ');
                        return _ChatRow(
                          avatar: const CircleAvatar(
                            radius: 26,
                            backgroundColor: WebColors.surface2,
                            child: Icon(Icons.groups, color: WebColors.text),
                          ),
                          title: group.title,
                          subtitle: names,
                          trailing: Text(
                            DateFormat('dd.MM').format(
                              DateTime.fromMillisecondsSinceEpoch(
                                group.updatedAt,
                              ),
                            ),
                            style: WebText.muted,
                          ),
                          onTap: () => context.go('/group/${group.id}'),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showCreateGroup(
    BuildContext context,
    AppController controller,
  ) async {
    final selected = <String>{};
    final titleController = TextEditingController(text: 'Мульти-чат');
    final result = await showDialog<List<String>>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: WebColors.surface,
              title: const Text('Новый мульти-чат'),
              content: SizedBox(
                width: double.maxFinite,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: titleController,
                      decoration: const InputDecoration(labelText: 'Название'),
                    ),
                    const SizedBox(height: 12),
                    Flexible(
                      child: ListView(
                        shrinkWrap: true,
                        children: [
                          for (final character in controller.data.characters)
                            CheckboxListTile(
                              value: selected.contains(character.id),
                              title: Text(character.name),
                              onChanged: (value) {
                                setState(() {
                                  if (value == true) {
                                    selected.add(character.id);
                                  } else {
                                    selected.remove(character.id);
                                  }
                                });
                              },
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  onPressed: selected.length >= 2
                      ? () => Navigator.pop(context, selected.toList())
                      : null,
                  child: const Text('Создать'),
                ),
              ],
            );
          },
        );
      },
    );
    if (result == null) return;
    final group = await controller.createGroupChat(
      titleController.text,
      result,
    );
    if (context.mounted) context.go('/group/${group.id}');
  }
}

class _ChatRow extends StatelessWidget {
  const _ChatRow({
    required this.avatar,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  final Widget avatar;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        child: Row(
          children: [
            avatar,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: WebColors.text,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: WebColors.muted,
                      fontSize: 13,
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
