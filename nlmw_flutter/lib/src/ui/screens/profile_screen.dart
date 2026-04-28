import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/models.dart';
import '../widgets/app_avatar.dart';
import '../widgets/controller_gate.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final nameController = TextEditingController();
  final apiKeyController = TextEditingController();
  Gender gender = Gender.unspecified;
  AiProviderKind? lastProvider;

  @override
  void dispose() {
    nameController.dispose();
    apiKeyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        final profile = controller.data.profile;
        if (nameController.text.isEmpty) nameController.text = profile.name;
        gender = profile.gender;
        final provider = controller.data.settings.provider;
        if (lastProvider != provider) {
          lastProvider = provider;
          apiKeyController.text = controller.apiKeyFor(provider);
        }
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: const Text('Профиль и API'),
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: AppAvatar(
                  imagePath: profile.avatarPath,
                  label: profile.name,
                  radius: 42,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Ваше имя'),
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
              FilledButton.icon(
                onPressed: () => controller.updateProfile(
                  profile.copyWith(
                    name: nameController.text.trim(),
                    gender: gender,
                  ),
                ),
                icon: const Icon(Icons.save),
                label: const Text('Сохранить профиль'),
              ),
              const Divider(height: 36),
              DropdownButtonFormField<AiProviderKind>(
                initialValue: provider,
                decoration: const InputDecoration(
                  labelText: 'Источник моделей',
                ),
                items: AiProviderKind.values
                    .map(
                      (item) => DropdownMenuItem(
                        value: item,
                        child: Text(item.label),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) controller.updateProvider(value);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: apiKeyController,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: '${provider.label} API Key',
                ),
                onSubmitted: (value) =>
                    controller.updateApiKey(provider, value),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () =>
                    controller.updateApiKey(provider, apiKeyController.text),
                icon: const Icon(Icons.key),
                label: const Text('Сохранить ключ на телефоне'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: controller.data.settings.modelId,
                decoration: const InputDecoration(labelText: 'Модель'),
                items: controller.models
                    .map(
                      (model) => DropdownMenuItem(
                        value: model.id,
                        child: Text(
                          model.name,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) controller.updateModel(value);
                },
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: controller.refreshModels,
                icon: const Icon(Icons.sync),
                label: const Text('Обновить список моделей'),
              ),
              const Divider(height: 36),
              FilledButton.icon(
                onPressed: () => _exportBackup(context, controller),
                icon: const Icon(Icons.ios_share),
                label: const Text('Экспорт данных'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => _importBackup(context, controller),
                icon: const Icon(Icons.file_open),
                label: const Text('Импорт данных'),
              ),
              const SizedBox(height: 12),
              Text(
                'Ключи API не попадают в экспорт. Чаты, персонажи, промты и настройки хранятся локально на телефоне.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _exportBackup(BuildContext context, dynamic controller) async {
    final dir = await getTemporaryDirectory();
    final file = File(p.join(dir.path, 'nlmw-backup.json'));
    await file.writeAsString(controller.exportBackupText(), flush: true);
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path)], text: 'NLMW backup'),
    );
  }

  Future<void> _importBackup(BuildContext context, dynamic controller) async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    final path = result?.files.single.path;
    if (path == null) return;
    try {
      final text = await File(path).readAsString();
      await controller.importBackupText(text);
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Импорт завершен')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось импортировать: $error')),
        );
      }
    }
  }
}
