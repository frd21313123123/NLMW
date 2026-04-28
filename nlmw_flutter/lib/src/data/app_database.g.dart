// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_database.dart';

// ignore_for_file: type=lint
class $LocalDocumentsTable extends LocalDocuments
    with TableInfo<$LocalDocumentsTable, LocalDocument> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocalDocumentsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _jsonValueMeta = const VerificationMeta(
    'jsonValue',
  );
  @override
  late final GeneratedColumn<String> jsonValue = GeneratedColumn<String>(
    'json_value',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, jsonValue, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'local_documents';
  @override
  VerificationContext validateIntegrity(
    Insertable<LocalDocument> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(
        _keyMeta,
        key.isAcceptableOrUnknown(data['key']!, _keyMeta),
      );
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('json_value')) {
      context.handle(
        _jsonValueMeta,
        jsonValue.isAcceptableOrUnknown(data['json_value']!, _jsonValueMeta),
      );
    } else if (isInserting) {
      context.missing(_jsonValueMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  LocalDocument map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalDocument(
      key: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}key'],
      )!,
      jsonValue: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}json_value'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $LocalDocumentsTable createAlias(String alias) {
    return $LocalDocumentsTable(attachedDatabase, alias);
  }
}

class LocalDocument extends DataClass implements Insertable<LocalDocument> {
  final String key;
  final String jsonValue;
  final int updatedAt;
  const LocalDocument({
    required this.key,
    required this.jsonValue,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['json_value'] = Variable<String>(jsonValue);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  LocalDocumentsCompanion toCompanion(bool nullToAbsent) {
    return LocalDocumentsCompanion(
      key: Value(key),
      jsonValue: Value(jsonValue),
      updatedAt: Value(updatedAt),
    );
  }

  factory LocalDocument.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalDocument(
      key: serializer.fromJson<String>(json['key']),
      jsonValue: serializer.fromJson<String>(json['jsonValue']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'jsonValue': serializer.toJson<String>(jsonValue),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  LocalDocument copyWith({String? key, String? jsonValue, int? updatedAt}) =>
      LocalDocument(
        key: key ?? this.key,
        jsonValue: jsonValue ?? this.jsonValue,
        updatedAt: updatedAt ?? this.updatedAt,
      );
  LocalDocument copyWithCompanion(LocalDocumentsCompanion data) {
    return LocalDocument(
      key: data.key.present ? data.key.value : this.key,
      jsonValue: data.jsonValue.present ? data.jsonValue.value : this.jsonValue,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalDocument(')
          ..write('key: $key, ')
          ..write('jsonValue: $jsonValue, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, jsonValue, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalDocument &&
          other.key == this.key &&
          other.jsonValue == this.jsonValue &&
          other.updatedAt == this.updatedAt);
}

class LocalDocumentsCompanion extends UpdateCompanion<LocalDocument> {
  final Value<String> key;
  final Value<String> jsonValue;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const LocalDocumentsCompanion({
    this.key = const Value.absent(),
    this.jsonValue = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocalDocumentsCompanion.insert({
    required String key,
    required String jsonValue,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       jsonValue = Value(jsonValue),
       updatedAt = Value(updatedAt);
  static Insertable<LocalDocument> custom({
    Expression<String>? key,
    Expression<String>? jsonValue,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (jsonValue != null) 'json_value': jsonValue,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocalDocumentsCompanion copyWith({
    Value<String>? key,
    Value<String>? jsonValue,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return LocalDocumentsCompanion(
      key: key ?? this.key,
      jsonValue: jsonValue ?? this.jsonValue,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (jsonValue.present) {
      map['json_value'] = Variable<String>(jsonValue.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocalDocumentsCompanion(')
          ..write('key: $key, ')
          ..write('jsonValue: $jsonValue, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $LocalDocumentsTable localDocuments = $LocalDocumentsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [localDocuments];
}

typedef $$LocalDocumentsTableCreateCompanionBuilder =
    LocalDocumentsCompanion Function({
      required String key,
      required String jsonValue,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$LocalDocumentsTableUpdateCompanionBuilder =
    LocalDocumentsCompanion Function({
      Value<String> key,
      Value<String> jsonValue,
      Value<int> updatedAt,
      Value<int> rowid,
    });

class $$LocalDocumentsTableFilterComposer
    extends Composer<_$AppDatabase, $LocalDocumentsTable> {
  $$LocalDocumentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get jsonValue => $composableBuilder(
    column: $table.jsonValue,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LocalDocumentsTableOrderingComposer
    extends Composer<_$AppDatabase, $LocalDocumentsTable> {
  $$LocalDocumentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key => $composableBuilder(
    column: $table.key,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get jsonValue => $composableBuilder(
    column: $table.jsonValue,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LocalDocumentsTableAnnotationComposer
    extends Composer<_$AppDatabase, $LocalDocumentsTable> {
  $$LocalDocumentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get jsonValue =>
      $composableBuilder(column: $table.jsonValue, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$LocalDocumentsTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $LocalDocumentsTable,
          LocalDocument,
          $$LocalDocumentsTableFilterComposer,
          $$LocalDocumentsTableOrderingComposer,
          $$LocalDocumentsTableAnnotationComposer,
          $$LocalDocumentsTableCreateCompanionBuilder,
          $$LocalDocumentsTableUpdateCompanionBuilder,
          (
            LocalDocument,
            BaseReferences<_$AppDatabase, $LocalDocumentsTable, LocalDocument>,
          ),
          LocalDocument,
          PrefetchHooks Function()
        > {
  $$LocalDocumentsTableTableManager(
    _$AppDatabase db,
    $LocalDocumentsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LocalDocumentsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LocalDocumentsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LocalDocumentsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> key = const Value.absent(),
                Value<String> jsonValue = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LocalDocumentsCompanion(
                key: key,
                jsonValue: jsonValue,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String key,
                required String jsonValue,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => LocalDocumentsCompanion.insert(
                key: key,
                jsonValue: jsonValue,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocalDocumentsTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $LocalDocumentsTable,
      LocalDocument,
      $$LocalDocumentsTableFilterComposer,
      $$LocalDocumentsTableOrderingComposer,
      $$LocalDocumentsTableAnnotationComposer,
      $$LocalDocumentsTableCreateCompanionBuilder,
      $$LocalDocumentsTableUpdateCompanionBuilder,
      (
        LocalDocument,
        BaseReferences<_$AppDatabase, $LocalDocumentsTable, LocalDocument>,
      ),
      LocalDocument,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$LocalDocumentsTableTableManager get localDocuments =>
      $$LocalDocumentsTableTableManager(_db, _db.localDocuments);
}
