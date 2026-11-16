// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';

import '../data/local_store.dart';

/// Tours the visitor saved with the heart ("Đã lưu"). Kept on the device.
class SavedController extends ChangeNotifier {
  SavedController(this._store) : _ids = _store.loadSavedTours();
  final LocalStore _store;
  Set<String> _ids;

  Set<String> get ids => Set.unmodifiable(_ids);
  bool isSaved(String tourId) => _ids.contains(tourId);

  Future<void> toggle(String tourId) async {
    _ids = _ids.contains(tourId) ? ({..._ids}..remove(tourId)) : {..._ids, tourId};
    notifyListeners();
    await _store.saveSavedTours(_ids);
  }
}
