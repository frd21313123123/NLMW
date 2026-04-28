import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../domain/models.dart';
import '../widgets/app_avatar.dart';
import '../widgets/controller_gate.dart';

class CharacterEditorScreen extends StatefulWidget {
  const CharacterEditorScreen({super.key, this.characterId});

  final String? characterId;

  @override
  State<CharacterEditorScreen> createState() => _CharacterEditorScreenState();
}

class _CharacterEditorScreenState extends State<CharacterEditorScreen> {
  final name = TextEditingController();
  final intro = TextEditingController();
  final tags = TextEditingController();
  final backgroundHint = TextEditingController();
  final outfit = TextEditingController();
  final setting = TextEditingController();
  final backstory = TextEditingController();
  final initial = TextEditingController();
  Gender gender = Gender.unspecified;
  String visibility = 'public';
  String dialogueStyle = 'natural';
  String avatarPath = '';
  String backgroundPath = '';
  CharacterProfile? loaded;

  @override
  void dispose() {
    for (final controller in [
      name,
      intro,
      tags,
      backgroundHint,
      outfit,
      setting,
      backstory,
      initial,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final existing = widget.characterId == null
            ? null
            : controller.data.characters
                  .where((item) => item.id == widget.characterId)
                  .firstOrNull;
        final character = existing ?? CharacterProfile.defaultValue();
        if (loaded?.id != character.id) _load(character);
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: Text(existing == null ? 'Новый персонаж' : 'Персонаж'),
            actions: [
              if (existing != null)
                IconButton(
                  tooltip: 'Удалить',
                  onPressed: () async {
                    await controller.deleteCharacter(existing.id);
                    if (context.mounted) context.go('/');
                  },
                  icon: const Icon(Icons.delete),
                ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: AppAvatar(
                  imagePath: avatarPath,
                  label: name.text,
                  radius: 48,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(
                        (path) => setState(() => avatarPath = path),
                      ),
                      icon: const Icon(Icons.face),
                      label: const Text('Аватар'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(
                        (path) => setState(() => backgroundPath = path),
                      ),
                      icon: const Icon(Icons.image),
                      label: const Text('Фон'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Имя'),
              ),
              const SizedBox(height: 12),
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
              const SizedBox(height: 12),
              TextField(
                controller: intro,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Краткое описание',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: tags,
                decoration: const InputDecoration(
                  labelText: 'Теги через запятую',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: dialogueStyle,
                decoration: const InputDecoration(labelText: 'Стиль диалога'),
                items: dialogueStyles
                    .map(
                      (style) => DropdownMenuItem(
                        value: style.id,
                        child: Text(style.label),
                      ),
                    )
                    .toList(),
                onChanged: (value) =>
                    setState(() => dialogueStyle = value ?? 'natural'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: initial,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(
                  labelText: 'Первое сообщение',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: setting,
                minLines: 2,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'Обстановка'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: backgroundHint,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Описание фона'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: outfit,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Внешность/одежда',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: backstory,
                minLines: 4,
                maxLines: 9,
                decoration: const InputDecoration(
                  labelText: 'Предыстория для модели',
                ),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () async {
                  final saved = character.copyWith(
                    name: name.text.trim().isEmpty
                        ? character.name
                        : name.text.trim(),
                    gender: gender,
                    intro: intro.text.trim(),
                    visibility: visibility,
                    tags: stringList(tags.text, max: 8),
                    avatarPath: avatarPath,
                    backgroundPath: backgroundPath,
                    backgroundHint: backgroundHint.text.trim(),
                    outfit: outfit.text.trim(),
                    setting: setting.text.trim(),
                    backstory: backstory.text.trim(),
                    dialogueStyle: dialogueStyle,
                    initialMessage: initial.text.trim(),
                    updatedAt: nowMs(),
                  );
                  await controller.upsertCharacter(saved);
                  if (context.mounted) context.go('/chat/${saved.id}');
                },
                icon: const Icon(Icons.save),
                label: const Text('Сохранить'),
              ),
            ],
          ),
        );
      },
    );
  }

  void _load(CharacterProfile character) {
    loaded = character;
    name.text = character.name;
    intro.text = character.intro;
    tags.text = character.tags.join(', ');
    backgroundHint.text = character.backgroundHint;
    outfit.text = character.outfit;
    setting.text = character.setting;
    backstory.text = character.backstory;
    initial.text = character.initialMessage;
    gender = character.gender;
    visibility = character.visibility;
    dialogueStyle = styleById(character.dialogueStyle).id;
    avatarPath = character.avatarPath;
    backgroundPath = character.backgroundPath;
  }

  Future<void> _pickImage(ValueChanged<String> onPicked) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1800,
    );
    if (picked != null) onPicked(picked.path);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
