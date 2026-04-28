import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class WebColors {
  static const bg = Color(0xFF111112);
  static const surface = Color(0xFF181819);
  static const surface2 = Color(0xFF232324);
  static const surface3 = Color(0xFF2C2C2F);
  static const text = Color(0xFFF3F1EF);
  static const muted = Color(0xFF9F9B97);
  static const muted2 = Color(0xFF6C6864);
  static const accent = Color(0xFF7D6CF8);
  static const accentSoft = Color(0x33246BFF);
  static const accentText = Color(0xFFC9B8FF);
  static const accent2 = Color(0xFF6DE1C1);
  static const danger = Color(0xFFFF4466);
  static const border = Color(0x0FFFFFFF);
  static const border2 = Color(0x1AFFFFFF);
  static const chatUser = Color(0xE0131314);
  static const chatBot = Color(0xC7100D0C);
  static const chatPanel = Color(0x8C7F6754);
}

class WebText {
  static const fontFamily = 'Inter';

  static const title = TextStyle(
    fontSize: 20,
    height: 1.1,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.2,
    color: WebColors.text,
  );

  static const body = TextStyle(
    fontSize: 15,
    height: 1.45,
    color: WebColors.text,
  );

  static const muted = TextStyle(fontSize: 13, color: WebColors.muted);
}

InputDecoration webInputDecoration(
  String hint, {
  Widget? prefixIcon,
  String? label,
}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    prefixIcon: prefixIcon,
    labelStyle: const TextStyle(color: WebColors.muted, fontSize: 13),
    hintStyle: const TextStyle(color: WebColors.muted),
    filled: true,
    fillColor: WebColors.surface2,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: WebColors.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: WebColors.accent, width: 1.3),
    ),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
  );
}

class WebBlurPanel extends StatelessWidget {
  const WebBlurPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(8),
    this.radius = 16,
    this.color = WebColors.chatPanel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: WebColors.border2),
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

class WebIconButton extends StatelessWidget {
  const WebIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    this.tooltip,
    this.panel = false,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final bool panel;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        fixedSize: const Size(40, 40),
        backgroundColor: panel ? const Color(0x0AFFFFFF) : Colors.transparent,
        foregroundColor: WebColors.text,
        shape: const CircleBorder(side: BorderSide(color: WebColors.border)),
      ),
      icon: Icon(icon, size: 22),
    );
  }
}

class WebSearchField extends StatelessWidget {
  const WebSearchField({
    super.key,
    required this.hint,
    this.onChanged,
    this.controller,
    this.onSubmitted,
  });

  final String hint;
  final ValueChanged<String>? onChanged;
  final TextEditingController? controller;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      onSubmitted: onSubmitted,
      style: WebText.body,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: WebColors.muted),
        prefixIcon: const Icon(Icons.search, color: WebColors.muted, size: 20),
        filled: true,
        fillColor: const Color(0xFF1F1F21),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
        constraints: const BoxConstraints(minHeight: 44, maxHeight: 44),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: WebColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: WebColors.border2),
        ),
      ),
    );
  }
}

class WebBottomNav extends StatelessWidget {
  const WebBottomNav({super.key, required this.current});

  final String current;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        height: 64,
        decoration: const BoxDecoration(
          color: Color(0xF5111112),
          border: Border(top: BorderSide(color: WebColors.border)),
        ),
        child: Row(
          children: [
            _Tab(
              icon: Icons.forum,
              active: current == 'chats',
              onTap: () => context.go('/'),
            ),
            _Tab(
              icon: Icons.travel_explore,
              active: current == 'polybuzz',
              onTap: () => context.go('/polybuzz'),
            ),
            _Tab(
              icon: Icons.add_circle,
              active: current == 'plus',
              isPlus: true,
              onTap: () => context.go('/character/new'),
            ),
            _Tab(
              icon: Icons.person,
              active: current == 'profile',
              onTap: () => context.go('/profile'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.active,
    required this.onTap,
    this.isPlus = false,
  });

  final IconData icon;
  final bool active;
  final bool isPlus;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkResponse(
        onTap: onTap,
        radius: 34,
        child: Center(
          child: Icon(
            icon,
            size: isPlus ? 30 : 25,
            color: active || isPlus
                ? WebColors.accentText
                : const Color(0xA8FFFFFF),
          ),
        ),
      ),
    );
  }
}

class WebPage extends StatelessWidget {
  const WebPage({
    super.key,
    required this.child,
    this.bottomNav,
    this.safeTop = true,
  });

  final Widget child;
  final String? bottomNav;
  final bool safeTop;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      color: WebColors.bg,
      child: Column(
        children: [
          Expanded(child: child),
          if (bottomNav != null) WebBottomNav(current: bottomNav!),
        ],
      ),
    );
    return Scaffold(
      backgroundColor: WebColors.bg,
      body: safeTop ? SafeArea(bottom: false, child: content) : content,
    );
  }
}

class WebCard extends StatelessWidget {
  const WebCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: WebColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: WebColors.border),
      ),
      child: child,
    );
  }
}
