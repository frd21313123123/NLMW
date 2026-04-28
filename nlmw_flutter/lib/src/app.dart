import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'ui/screens/character_editor_screen.dart';
import 'ui/screens/chat_list_screen.dart';
import 'ui/screens/chat_screen.dart';
import 'ui/screens/group_chat_screen.dart';
import 'ui/screens/polybuzz_screen.dart';
import 'ui/screens/profile_screen.dart';
import 'ui/screens/prompts_screen.dart';
import 'ui/web_theme.dart';

class NlmwApp extends StatelessWidget {
  const NlmwApp({super.key});

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (context, state) => const ChatListScreen()),
        GoRoute(
          path: '/chat/:id',
          builder: (context, state) =>
              ChatScreen(characterId: state.pathParameters['id'] ?? ''),
        ),
        GoRoute(
          path: '/group/:id',
          builder: (context, state) =>
              GroupChatScreen(groupId: state.pathParameters['id'] ?? ''),
        ),
        GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfileScreen(),
        ),
        GoRoute(
          path: '/character/new',
          builder: (context, state) => const CharacterEditorScreen(),
        ),
        GoRoute(
          path: '/character/:id',
          builder: (context, state) =>
              CharacterEditorScreen(characterId: state.pathParameters['id']),
        ),
        GoRoute(
          path: '/polybuzz',
          builder: (context, state) => const PolybuzzScreen(),
        ),
        GoRoute(
          path: '/prompts',
          builder: (context, state) => const PromptsScreen(),
        ),
      ],
    );

    return MaterialApp.router(
      title: 'NLMW Chat',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: WebText.fontFamily,
        colorScheme: ColorScheme.fromSeed(
          seedColor: WebColors.accent,
          brightness: Brightness.dark,
          surface: WebColors.surface,
          primary: WebColors.accent,
          secondary: WebColors.accent2,
        ),
        scaffoldBackgroundColor: WebColors.bg,
        appBarTheme: const AppBarTheme(
          backgroundColor: WebColors.bg,
          foregroundColor: WebColors.text,
          elevation: 0,
          centerTitle: false,
          scrolledUnderElevation: 0,
        ),
        cardTheme: const CardThemeData(
          color: WebColors.surface,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(16)),
          ),
        ),
        textTheme: const TextTheme(
          titleLarge: TextStyle(
            color: WebColors.text,
            fontSize: 20,
            fontWeight: FontWeight.w800,
          ),
          titleMedium: TextStyle(
            color: WebColors.text,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
          bodyMedium: TextStyle(color: WebColors.text, fontSize: 15),
          bodySmall: TextStyle(color: WebColors.muted, fontSize: 13),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: WebColors.surface2,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: WebColors.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: WebColors.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: WebColors.accent),
          ),
          labelStyle: const TextStyle(color: WebColors.muted),
          hintStyle: const TextStyle(color: WebColors.muted),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: WebColors.accent,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: WebColors.text,
            side: const BorderSide(color: WebColors.border2),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      routerConfig: router,
    );
  }
}
