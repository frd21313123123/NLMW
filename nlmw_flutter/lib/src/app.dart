import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'ui/screens/character_editor_screen.dart';
import 'ui/screens/chat_list_screen.dart';
import 'ui/screens/chat_screen.dart';
import 'ui/screens/group_chat_screen.dart';
import 'ui/screens/polybuzz_screen.dart';
import 'ui/screens/profile_screen.dart';
import 'ui/screens/prompts_screen.dart';

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
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1AA37A),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF101418),
        cardTheme: const CardThemeData(
          margin: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
          ),
          filled: true,
        ),
      ),
      routerConfig: router,
    );
  }
}
