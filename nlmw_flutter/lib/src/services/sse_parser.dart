import 'dart:convert';

class SseDataParser {
  String _eventBuffer = '';

  Iterable<String> addLine(String line) sync* {
    if (line.isEmpty) {
      if (_eventBuffer.trim().isNotEmpty) {
        yield _eventBuffer.trimRight();
      }
      _eventBuffer = '';
      return;
    }

    if (line.startsWith('data:')) {
      _eventBuffer += '${line.substring(5).trimLeft()}\n';
    }
  }

  Iterable<String> addChunk(String chunk) sync* {
    for (final line in const LineSplitter().convert(chunk)) {
      yield* addLine(line);
    }
  }

  String? close() {
    final text = _eventBuffer.trimRight();
    _eventBuffer = '';
    return text.isEmpty ? null : text;
  }
}

String? contentDeltaFromSseJson(String jsonText) {
  if (jsonText.trim() == '[DONE]') return null;
  final data = jsonDecode(jsonText);
  if (data is! Map) return null;
  if (data['error'] != null) {
    final error = data['error'];
    if (error is Map) throw Exception(error['message'] ?? error.toString());
    throw Exception(error.toString());
  }
  final choices = data['choices'];
  if (choices is! List || choices.isEmpty) return null;
  final choice = choices.first;
  if (choice is! Map) return null;
  final delta = choice['delta'];
  if (delta is Map && delta['content'] != null) {
    return delta['content'].toString();
  }
  final message = choice['message'];
  if (message is Map && message['content'] != null) {
    return message['content'].toString();
  }
  return null;
}
