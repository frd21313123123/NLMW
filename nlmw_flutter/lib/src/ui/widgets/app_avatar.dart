import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';

ImageProvider? imageProviderFromPath(String value) {
  final path = value.trim();
  if (path.isEmpty) return null;
  if (path.startsWith('data:')) {
    final comma = path.indexOf(',');
    if (comma > 0) {
      try {
        return MemoryImage(
          Uint8List.fromList(base64Decode(path.substring(comma + 1))),
        );
      } catch (_) {
        return null;
      }
    }
  }
  final uri = Uri.tryParse(path);
  if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https')) {
    return NetworkImage(path);
  }
  final file = File(path);
  if (file.existsSync()) return FileImage(file);
  return null;
}

class AppAvatar extends StatelessWidget {
  const AppAvatar({
    super.key,
    required this.imagePath,
    required this.label,
    this.radius = 22,
  });

  final String imagePath;
  final String label;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final provider = imageProviderFromPath(imagePath);
    return CircleAvatar(
      radius: radius,
      backgroundImage: provider,
      child: provider == null
          ? Text(_initial(label), style: TextStyle(fontSize: radius * 0.75))
          : null,
    );
  }

  String _initial(String label) {
    final text = label.trim();
    return text.isEmpty ? '?' : text.characters.first.toUpperCase();
  }
}
