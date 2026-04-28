import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/app_controller.dart';
import '../../state/app_providers.dart';

class ControllerGate extends ConsumerWidget {
  const ControllerGate({super.key, required this.builder});

  final Widget Function(BuildContext context, AppController controller) builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(appControllerProvider);
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        if (!controller.initialized) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return builder(context, controller);
      },
    );
  }
}
