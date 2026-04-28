import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

class LocalDocuments extends Table {
  TextColumn get key => text()();
  TextColumn get jsonValue => text().named('json_value')();
  IntColumn get updatedAt => integer().named('updated_at')();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

@DriftDatabase(tables: [LocalDocuments])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  AppDatabase.defaults() : super(driftDatabase(name: 'nlmw_chat'));

  @override
  int get schemaVersion => 1;

  Future<String?> readDocument(String key) async {
    final row = await (select(
      localDocuments,
    )..where((tbl) => tbl.key.equals(key))).getSingleOrNull();
    return row?.jsonValue;
  }

  Future<void> writeDocument(String key, String jsonValue) async {
    await into(localDocuments).insertOnConflictUpdate(
      LocalDocumentsCompanion.insert(
        key: key,
        jsonValue: jsonValue,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<void> deleteDocument(String key) async {
    await (delete(localDocuments)..where((tbl) => tbl.key.equals(key))).go();
  }
}
