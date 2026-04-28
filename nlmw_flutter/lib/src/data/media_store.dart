import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class MediaStore {
  MediaStore({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<String> saveBytes(Uint8List bytes, String extension) async {
    final dir = await _mediaDir();
    final hash = sha256.convert(bytes).toString();
    final safeExt = extension.startsWith('.') ? extension : '.$extension';
    final file = File(p.join(dir.path, '$hash$safeExt'));
    if (!await file.exists()) {
      await file.writeAsBytes(bytes, flush: true);
    }
    return file.path;
  }

  Future<String> saveDataUrl(String dataUrl) async {
    final match = RegExp(
      r'^data:([^;,]+)?(;base64)?,(.*)$',
      dotAll: true,
    ).firstMatch(dataUrl);
    if (match == null) return dataUrl;
    final mime = match.group(1) ?? 'image/jpeg';
    final payload = match.group(3) ?? '';
    final bytes = match.group(2) == null
        ? utf8.encode(Uri.decodeComponent(payload))
        : base64Decode(payload);
    return saveBytes(Uint8List.fromList(bytes), _extensionFromMime(mime));
  }

  Future<String> downloadImage(
    String url, {
    int maxBytes = 3 * 1024 * 1024,
  }) async {
    if (url.trim().isEmpty) return '';
    if (url.startsWith('data:')) return saveDataUrl(url);
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http')) {
      return url;
    }

    final response = await _client.get(
      uri,
      headers: const {
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 NLMWChat/1.0',
        'Referer': 'https://www.polybuzz.ai/',
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) return url;
    final contentType =
        response.headers['content-type']?.split(';').first.trim() ??
        'image/jpeg';
    if (!contentType.startsWith('image/')) return url;
    if (response.bodyBytes.length > maxBytes) return url;
    return saveBytes(response.bodyBytes, _extensionFromMime(contentType));
  }

  Future<Directory> _mediaDir() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory(p.join(root.path, 'media'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  String _extensionFromMime(String mime) {
    return switch (mime.toLowerCase()) {
      'image/png' => '.png',
      'image/webp' => '.webp',
      'image/gif' => '.gif',
      'image/avif' => '.avif',
      _ => '.jpg',
    };
  }
}
