// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/core/core_queries.dart';

// Contract test: every table, column and relationship in the GraphQL documents of the app
// exists in the Prisma schema, the table is exposed by Hasura metadata and the three roles
// (farmer, manager, officer) may select it. It catches drift before a real server does.
// It reads files of the monorepo; outside it (the app copied alone) the test is skipped.

const _prismaPath = '../web/prisma/schema.prisma';
const _metadataDir = '../../platform/hasura/metadata/databases/default/tables';

/// model name -> field name -> type name (without [] and ?).
Map<String, Map<String, String>> _parsePrisma(String text) {
  final models = <String, Map<String, String>>{};
  String? current;
  for (final raw in text.split('\n')) {
    final line = raw.trim();
    final open = RegExp(r'^model\s+(\w+)\s*\{').firstMatch(line);
    if (open != null) {
      current = open.group(1);
      models[current!] = {};
      continue;
    }
    if (line == '}') {
      current = null;
      continue;
    }
    if (current == null || line.isEmpty || line.startsWith('//') || line.startsWith('@@')) continue;
    final f = RegExp(r'^(\w+)\s+(\w+)').firstMatch(line);
    if (f != null) models[current]![f.group(1)!] = f.group(2)!;
  }
  return models;
}

/// Prisma model of each Hasura root field (table name from `@@map`).
Map<String, String> _tableToModel(String text) {
  final map = <String, String>{};
  String? current;
  for (final raw in text.split('\n')) {
    final line = raw.trim();
    final open = RegExp(r'^model\s+(\w+)\s*\{').firstMatch(line);
    if (open != null) current = open.group(1);
    final m = RegExp(r'@@map\("(\w+)"\)').firstMatch(line);
    if (m != null && current != null) map[m.group(1)!] = current;
  }
  return map;
}

/// One selection of a document: field name, its children (null for a scalar).
class _Sel {
  _Sel(this.name);
  final String name;
  final List<_Sel> children = [];
  bool get isScalar => children.isEmpty;
}

/// Parses the selection set of a query document; arguments `( ... )` are removed first.
List<_Sel> _parseSelections(String doc) {
  var text = doc;
  // drop operation variables and field arguments (balanced parentheses)
  final out = StringBuffer();
  var depth = 0;
  for (final ch in text.split('')) {
    if (ch == '(') depth++;
    if (depth == 0) out.write(ch);
    if (ch == ')') depth--;
  }
  text = out.toString();
  final tokens = RegExp(r'\{|\}|\w+').allMatches(text).map((m) => m.group(0)!).toList();
  // skip "query Name"
  var i = tokens.indexOf('{') + 1;
  final root = _Sel('');
  final stack = [root];
  _Sel? last;
  for (; i < tokens.length; i++) {
    final t = tokens[i];
    if (t == '{') {
      stack.add(last!);
    } else if (t == '}') {
      stack.removeLast();
    } else {
      last = _Sel(t);
      stack.last.children.add(last);
    }
  }
  return root.children;
}

void _check(
  List<_Sel> sels,
  String model,
  Map<String, Map<String, String>> prisma,
  List<String> problems, {
  String path = '',
}) {
  for (final s in sels) {
    final type = prisma[model]![s.name];
    if (type == null) {
      problems.add('$path${s.name}: no such field on $model');
      continue;
    }
    if (s.isScalar) {
      if (prisma.containsKey(type)) problems.add('$path${s.name}: a relation selected without fields');
    } else if (!prisma.containsKey(type)) {
      problems.add('$path${s.name}: scalar given a selection set');
    } else {
      _check(s.children, type, prisma, problems, path: '$path${s.name}.');
    }
  }
}

void main() {
  final prismaFile = File(_prismaPath);
  final skip = prismaFile.existsSync() && Directory(_metadataDir).existsSync() ? null : 'monorepo files not found';

  const documents = {
    'htx_profiles': htxProfileQuery,
    'households': householdsQuery,
    'parcels': parcelsQuery,
    'journal_entries': journalQuery,
    'lots': lotsQuery,
    'notifications': notificationsQuery,
  };

  test('every selected column and relation exists in schema.prisma', () {
    final text = prismaFile.readAsStringSync();
    final prisma = _parsePrisma(text);
    final modelOf = _tableToModel(text);
    final problems = <String>[];
    documents.forEach((root, doc) {
      final top = _parseSelections(doc);
      expect(top.map((s) => s.name), [root], reason: 'one root field per document');
      _check(top.single.children, modelOf[root]!, prisma, problems, path: '$root.');
    });
    expect(problems, isEmpty);
  }, skip: skip);

  test('order_by columns exist too', () {
    final text = prismaFile.readAsStringSync();
    final prisma = _parsePrisma(text);
    final modelOf = _tableToModel(text);
    // (root, nested relation or null) -> column of order_by
    final cases = <(String, String?, String)>[];
    documents.forEach((root, doc) {
      for (final m in RegExp(r'(\w+)(?:\([^()]*?order_by:\s*\{\s*(\w+):)').allMatches(doc)) {
        final field = m.group(1)!;
        cases.add(field == root ? (root, null, m.group(2)!) : (root, field, m.group(2)!));
      }
    });
    expect(cases, isNotEmpty);
    for (final (root, nested, column) in cases) {
      final model = nested == null ? modelOf[root]! : prisma[modelOf[root]!]![nested]!;
      expect(prisma[model]!.containsKey(column), isTrue, reason: '$root ${nested ?? ''} order_by $column');
    }
  }, skip: skip);

  test('each root is tracked by Hasura and selectable by farmer, manager and officer', () {
    for (final root in documents.keys) {
      final yaml = File('$_metadataDir/public_$root.yaml').readAsStringSync();
      expect(yaml, contains('name: $root'), reason: root);
      final permissions = yaml.substring(yaml.indexOf('select_permissions:'));
      for (final role in ['farmer', 'manager', 'officer']) {
        expect(permissions, contains('role: $role'), reason: '$root $role');
      }
      expect(permissions, isNot(contains('insert_permissions')));
    }
    // no table used here has any write permission: the app does not mutate the core
    for (final root in documents.keys) {
      final yaml = File('$_metadataDir/public_$root.yaml').readAsStringSync();
      expect(yaml, isNot(contains('insert_permissions')), reason: root);
      expect(yaml, isNot(contains('update_permissions')), reason: root);
    }
  }, skip: skip);

  test('nested relations are declared in the metadata of their table', () {
    const relations = {
      'parcels': ['household', 'crop_cycles'],
      'journal_entries': ['activities', 'parcel'],
      'lots': ['lot_parcels'],
    };
    relations.forEach((root, names) {
      final yaml = File('$_metadataDir/public_$root.yaml').readAsStringSync();
      for (final n in names) {
        expect(yaml, contains('name: $n'), reason: '$root.$n');
      }
    });
    final lotParcels = File('$_metadataDir/public_lot_parcels.yaml').readAsStringSync();
    expect(lotParcels, contains('name: parcel'));
  }, skip: skip);

  test('the documents contain no mutation and no unknown root', () {
    for (final doc in documents.values) {
      expect(doc, isNot(contains('mutation')));
      expect(doc.trimLeft(), startsWith('query'));
    }
  });

  test('the checker itself notices an unknown column and a misused relation', () {
    final prisma = _parsePrisma(prismaFile.readAsStringSync());
    final problems = <String>[];
    final top = _parseSelections('query { parcels { id no_such_column household } }');
    _check(top.single.children, 'Parcel', prisma, problems);
    expect(problems, hasLength(2));
    expect(problems.first, contains('no_such_column'));
  }, skip: skip);
}
