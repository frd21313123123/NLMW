import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../services/polybuzz_client.dart';
import '../widgets/app_avatar.dart';
import '../widgets/controller_gate.dart';

class PolybuzzScreen extends StatefulWidget {
  const PolybuzzScreen({super.key});

  @override
  State<PolybuzzScreen> createState() => _PolybuzzScreenState();
}

class _PolybuzzScreenState extends State<PolybuzzScreen> {
  final searchController = TextEditingController();
  final importController = TextEditingController();
  final items = <PolybuzzItem>[];
  int page = 1;
  bool loading = false;
  String error = '';
  String lastQuery = '';

  @override
  void dispose() {
    searchController.dispose();
    importController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ControllerGate(
      builder: (context, controller) {
        if (items.isEmpty && !loading && error.isEmpty) {
          Future.microtask(() => _load(controller, reset: true));
        }
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => context.go('/'),
            ),
            title: const Text('PolyBuzz'),
          ),
          body: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: searchController,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Поиск PolyBuzz',
                        ),
                        onSubmitted: (_) => _load(controller, reset: true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: loading
                          ? null
                          : () => _load(controller, reset: true),
                      child: const Icon(Icons.search),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: importController,
                        decoration: const InputDecoration(
                          hintText: 'Ссылка PolyBuzz или JSON карточки',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: loading
                          ? null
                          : () async {
                              await _importText(
                                context,
                                controller,
                                importController.text,
                              );
                            },
                      child: const Text('Импорт'),
                    ),
                  ],
                ),
              ),
              if (error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    error,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.72,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: items.length + 1,
                  itemBuilder: (context, index) {
                    if (index == items.length) {
                      return Center(
                        child: loading
                            ? const CircularProgressIndicator()
                            : OutlinedButton.icon(
                                onPressed: () => _load(controller),
                                icon: const Icon(Icons.expand_more),
                                label: const Text('Еще'),
                              ),
                      );
                    }
                    final item = items[index];
                    return Card(
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => _importText(context, controller, item.url),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: _PolyImage(item: item)),
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleSmall,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    item.brief,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodySmall,
                                  ),
                                ],
                              ),
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

  Future<void> _load(dynamic controller, {bool reset = false}) async {
    if (loading) return;
    setState(() {
      loading = true;
      error = '';
      if (reset) {
        page = 1;
        items.clear();
      }
    });
    try {
      final query = searchController.text.trim();
      final result = query.isEmpty
          ? await controller.loadPolybuzzCatalogPage(page)
          : await controller.searchPolybuzz(query, page: page);
      setState(() {
        lastQuery = query;
        page += 1;
        items.addAll(result);
      });
    } catch (err) {
      setState(() => error = err.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _importText(
    BuildContext context,
    dynamic controller,
    String text,
  ) async {
    if (text.trim().isEmpty) return;
    setState(() {
      loading = true;
      error = '';
    });
    try {
      await controller.importPolybuzzText(text);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Персонаж импортирован локально')),
        );
        context.go('/chat/${controller.data.selectedCharacterId}');
      }
    } catch (err) {
      setState(() => error = err.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }
}

class _PolyImage extends StatelessWidget {
  const _PolyImage({required this.item});

  final PolybuzzItem item;

  @override
  Widget build(BuildContext context) {
    final provider = imageProviderFromPath(item.avatar);
    if (provider == null) {
      return Center(
        child: AppAvatar(imagePath: '', label: item.name, radius: 36),
      );
    }
    return SizedBox.expand(
      child: Image(
        image: provider,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Center(
          child: AppAvatar(imagePath: '', label: item.name, radius: 36),
        ),
      ),
    );
  }
}
