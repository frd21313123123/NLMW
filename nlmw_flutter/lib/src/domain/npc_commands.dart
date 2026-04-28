import 'models.dart';

class NpcCommand {
  const NpcCommand.create({
    required this.name,
    required this.gender,
    required this.intro,
  }) : type = 'create';

  const NpcCommand.remove({required this.name})
    : type = 'remove',
      gender = Gender.unspecified,
      intro = '';

  final String type;
  final String name;
  final Gender gender;
  final String intro;
}

class NpcCommandParseResult {
  const NpcCommandParseResult({
    required this.displayText,
    required this.commands,
  });

  final String displayText;
  final List<NpcCommand> commands;
}

final _npcCreateRe = RegExp(r'\[\[NPC_CREATE:\s*([^\]]+)\]\]', multiLine: true);
final _npcRemoveRe = RegExp(r'\[\[NPC_REMOVE:\s*([^\]]+)\]\]', multiLine: true);
final _attrRe = RegExp(r'''(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;]+))''');

NpcCommandParseResult parseNpcCommands(String rawContent) {
  final commands = <NpcCommand>[];

  for (final match in _npcCreateRe.allMatches(rawContent)) {
    final attrs = _parseAttrs(match.group(1) ?? '');
    final name = attrs['name']?.trim() ?? '';
    if (name.isEmpty) continue;
    commands.add(
      NpcCommand.create(
        name: name,
        gender: GenderCodec.parse(attrs['gender']),
        intro: attrs['intro']?.trim() ?? '',
      ),
    );
  }

  for (final match in _npcRemoveRe.allMatches(rawContent)) {
    final attrs = _parseAttrs(match.group(1) ?? '');
    final name = attrs['name']?.trim() ?? '';
    if (name.isEmpty) continue;
    commands.add(NpcCommand.remove(name: name));
  }

  final displayText = rawContent
      .replaceAll(_npcCreateRe, '')
      .replaceAll(_npcRemoveRe, '')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();

  return NpcCommandParseResult(displayText: displayText, commands: commands);
}

Map<String, String> _parseAttrs(String raw) {
  final out = <String, String>{};
  for (final match in _attrRe.allMatches(raw)) {
    final key = (match.group(1) ?? '').trim().toLowerCase();
    final value = (match.group(2) ?? match.group(3) ?? match.group(4) ?? '')
        .trim();
    if (key.isNotEmpty) out[key] = value;
  }
  return out;
}
