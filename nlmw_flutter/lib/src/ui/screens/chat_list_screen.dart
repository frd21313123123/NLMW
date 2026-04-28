import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../domain/models.dart';
import '../../state/app_controller.dart';
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
          child: Scaffold(
            appBar: AppBar(
              title: const Text('NLMW Chat'),
              actions: [
                IconButton(
                  tooltip: 'PolyBuzz',
                  onPressed: () => context.go('/polybuzz'),
                  icon: const Icon(Icons.travel_explore),
                ),
                IconButton(
                  tooltip: 'Промты',
                  onPressed: () => context.go('/prompts'),
                  icon: const Icon(Icons.library_books),
                ),
                IconButton(
                  tooltip: 'Профиль',
                  onPressed: () => context.go('/profile'),
                  icon: const Icon(Icons.person),
                ),
              ],
              bottom: const TabBar(
                tabs: [
                  Tab(text: 'Личные'),
                  Tab(text: 'Мульти'),
                ],
              ),
            ),
            floatingActionButton: FloatingActionButton(
              onPressed: () => context.go('/character/new'),
              child: const Icon(Icons.add),
            ),
            body: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: TextField(
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Поиск персонажей',
                    ),
                    onChanged: (value) => setState(() => query = value),
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
          return const Center(child: Text('Ничего не найдено'));
        }
        return ListView.builder(
          itemCount: characters.length,
          itemBuilder: (context, index) {
            final character = characters[index];
            final chat = controller.data.activeChatFor(character.id);
            final last = chat?.messages.lastWhere(
              (message) => message.isChatMessage,
              orElse: () => ChatMessage.assistant(character.initialMessage),
            );
            return Card(
              child: ListTile(
                leading: AppAvatar(
                  imagePath: character.avatarPath,
                  label: character.name,
                ),
                title: Text(
                  character.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(
                  last?.content.trim().isNotEmpty == true
                      ? last!.content
                      : character.intro,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: IconButton(
                  tooltip: 'Редактировать',
                  icon: const Icon(Icons.edit),
                  onPressed: () => context.go('/character/${character.id}'),
                ),
                onTap: () async {
                  await controller.selectCharacter(character.id);
                  if (context.mounted) context.go('/chat/${character.id}');
                },
              ),
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
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: FilledButton.icon(
                onPressed: () => _showCreateGroup(context, controller),
                icon: const Icon(Icons.group_add),
                label: const Text('Создать мульти-чат'),
              ),
            ),
            Expanded(
              child: groups.isEmpty
                  ? const Center(child: Text('Мульти-чаты пока не созданы'))
                  : ListView.builder(
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
                        return Card(
                          child: ListTile(
                            leading: const CircleAvatar(
                              child: Icon(Icons.groups),
                            ),
                            title: Text(group.title),
                            subtitle: Text(names),
                            trailing: Text(
                              DateFormat('dd.MM').format(
                                DateTime.fromMillisecondsSinceEpoch(
                                  group.updatedAt,
                                ),
                              ),
                            ),
                            onTap: () => context.go('/group/${group.id}'),
                          ),
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

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
