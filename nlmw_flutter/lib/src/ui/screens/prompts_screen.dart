import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../domain/models.dart';
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
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: const Text('Промты'),
            actions: [
              IconButton(
                tooltip: 'Новая папка',
                onPressed: () => _editFolder(context, controller),
                icon: const Icon(Icons.create_new_folder),
              ),
              IconButton(
                tooltip: 'Новый промт',
                onPressed: () => _editPrompt(context, controller),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
          body: Column(
            children: [
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  children: [
                    ChoiceChip(
                      label: const Text('Все'),
                      selected: folderFilter == '__all__',
                      onSelected: (_) =>
                          setState(() => folderFilter = '__all__'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Без папки'),
                      selected: folderFilter.isEmpty,
                      onSelected: (_) => setState(() => folderFilter = ''),
                    ),
                    for (final folder in controller.data.promptFolders) ...[
                      const SizedBox(width: 8),
                      ChoiceChip(
                        label: Text(folder.name),
                        selected: folderFilter == folder.id,
                        onSelected: (_) =>
                            setState(() => folderFilter = folder.id),
                      ),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: prompts.isEmpty
                    ? const Center(child: Text('Сохраненных промтов пока нет'))
                    : ListView.builder(
                        itemCount: prompts.length,
                        itemBuilder: (context, index) {
                          final prompt = prompts[index];
                          return Card(
                            child: ListTile(
                              title: Text(prompt.title),
                              subtitle: Text(
                                prompt.text,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () =>
                                  _editPrompt(context, controller, prompt),
                              trailing: Wrap(
                                children: [
                                  IconButton(
                                    tooltip: 'Копировать',
                                    icon: const Icon(Icons.copy),
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
                                    onPressed: () =>
                                        controller.deletePrompt(prompt.id),
                                  ),
                                ],
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
        title: Text(folder == null ? 'Новая папка' : 'Папка'),
        content: TextField(
          controller: text,
          decoration: const InputDecoration(labelText: 'Название'),
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
            title: Text(prompt == null ? 'Новый промт' : 'Промт'),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: title,
                    decoration: const InputDecoration(labelText: 'Название'),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: folderId,
                    decoration: const InputDecoration(labelText: 'Папка'),
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
                    decoration: const InputDecoration(labelText: 'Текст'),
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
