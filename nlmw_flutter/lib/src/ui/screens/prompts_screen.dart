import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
import '../web_theme.dart';
import '../widgets/controller_gate.dart';

class PromptsScreen extends StatefulWidget {
  const PromptsScreen({super.key});

  @override
  State<PromptsScreen> createState() => _PromptsScreenState();
}

class _PromptsScreenState extends State<PromptsScreen> {
  String folderFilter = '__all__';

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final prompts = controller.data.savedPrompts.where((prompt) {
          if (folderFilter == '__all__') return true;
          return prompt.folderId == folderFilter;
        }).toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
        return WebPage(
          child: Column(
            children: [
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
                  child: Row(
                    children: [
                      WebIconButton(
                        icon: Icons.arrow_back,
                        onPressed: () => context.go('/'),
                      ),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text('Промты', style: WebText.title),
                      ),
                      WebIconButton(
                        tooltip: 'Новая папка',
                        icon: Icons.create_new_folder,
                        onPressed: () => _editFolder(context, controller),
                      ),
                      WebIconButton(
                        tooltip: 'Новый промт',
                        icon: Icons.add,
                        onPressed: () => _editPrompt(context, controller),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  children: [
                    _FilterChip(
                      label: 'Все',
                      selected: folderFilter == '__all__',
                      onTap: () => setState(() => folderFilter = '__all__'),
                    ),
                    _FilterChip(
                      label: 'Без папки',
                      selected: folderFilter.isEmpty,
                      onTap: () => setState(() => folderFilter = ''),
                    ),
                    for (final folder in controller.data.promptFolders)
                      _FilterChip(
                        label: folder.name,
                        selected: folderFilter == folder.id,
                        onTap: () => setState(() => folderFilter = folder.id),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: prompts.isEmpty
                    ? const Center(
                        child: Text(
                          'Сохраненных промтов пока нет',
                          style: WebText.muted,
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        itemCount: prompts.length,
                        itemBuilder: (context, index) {
                          final prompt = prompts[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: WebCard(
                              child: InkWell(
                                onTap: () =>
                                    _editPrompt(context, controller, prompt),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            prompt.title,
                                            style: const TextStyle(
                                              color: WebColors.text,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                        ),
                                        IconButton(
                                          tooltip: 'Копировать',
                                          icon: const Icon(Icons.copy),
                                          color: WebColors.muted,
                                          onPressed: () {
                                            Clipboard.setData(
                                              ClipboardData(text: prompt.text),
                                            );
                                            ScaffoldMessenger.of(
                                              context,
                                            ).showSnackBar(
                                              const SnackBar(
                                                content: Text('Скопировано'),
                                              ),
                                            );
                                          },
                                        ),
                                        IconButton(
                                          tooltip: 'Удалить',
                                          icon: const Icon(Icons.delete),
                                          color: WebColors.muted,
                                          onPressed: () => controller
                                              .deletePrompt(prompt.id),
                                        ),
                                      ],
                                    ),
                                    Text(
                                      prompt.text,
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: WebText.muted,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _editFolder(
    BuildContext context,
    dynamic controller, [
    PromptFolder? folder,
  ]) async {
    final text = TextEditingController(text: folder?.name ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: WebColors.surface,
        title: Text(folder == null ? 'Новая папка' : 'Папка'),
        content: TextField(
          controller: text,
          decoration: webInputDecoration('', label: 'Название'),
        ),
        actions: [
          if (folder != null)
            TextButton(
              onPressed: () => Navigator.pop(context, '__delete__'),
              child: const Text('Удалить'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, text.text.trim()),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
    if (result == null) return;
    if (result == '__delete__' && folder != null) {
      await controller.deletePromptFolder(folder.id);
    } else if (result.trim().isNotEmpty) {
      await controller.savePromptFolder(id: folder?.id, name: result.trim());
    }
  }

  Future<void> _editPrompt(
    BuildContext context,
    dynamic controller, [
    SavedPrompt? prompt,
  ]) async {
    final title = TextEditingController(text: prompt?.title ?? '');
    final text = TextEditingController(text: prompt?.text ?? '');
    var folderId = prompt?.folderId ?? '';
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) => AlertDialog(
            backgroundColor: WebColors.surface,
            title: Text(prompt == null ? 'Новый промт' : 'Промт'),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: title,
                    decoration: webInputDecoration('', label: 'Название'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: folderId,
                    decoration: webInputDecoration('', label: 'Папка'),
                    items: [
                      const DropdownMenuItem(
                        value: '',
                        child: Text('Без папки'),
                      ),
                      for (final folder in controller.data.promptFolders)
                        DropdownMenuItem(
                          value: folder.id,
                          child: Text(folder.name),
                        ),
                    ],
                    onChanged: (value) =>
                        setState(() => folderId = value ?? ''),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: text,
                    minLines: 5,
                    maxLines: 10,
                    decoration: webInputDecoration('', label: 'Текст'),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Отмена'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Сохранить'),
              ),
            ],
          ),
        );
      },
    );
    if (saved == true && text.text.trim().isNotEmpty) {
      await controller.savePrompt(
        id: prompt?.id,
        title: title.text.trim().isEmpty ? 'Промт' : title.text.trim(),
        text: text.text.trim(),
        folderId: folderId,
      );
    }
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ActionChip(
        label: Text(label),
        onPressed: onTap,
        labelStyle: TextStyle(
          color: selected ? WebColors.text : WebColors.muted,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
        ),
        backgroundColor: selected ? WebColors.surface2 : WebColors.surface,
        side: const BorderSide(color: WebColors.border),
        shape: const StadiumBorder(),
      ),
    );
  }
}
