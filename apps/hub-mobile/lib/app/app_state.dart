// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';

import '../core/role/role.dart';
import '../data/auth_service.dart';

/// Who is using the app. The router listens to this and re-evaluates its
/// redirects, so a role change moves the user to the right interface.
class AppState extends ChangeNotifier {
  AppState(this._auth);
  final AuthService _auth;

  Session? _session;
  bool _welcomeDone = false;

  Session? get session => _session;
  Claims? get claims => _session?.claims;
  AppRole get role => roleFromClaims(claims);

  /// The first screen ("Xem với tư cách khách" / "Đăng nhập") is shown until
  /// the user picks one, unless a session was restored.
  bool get welcomeDone => _welcomeDone;

  Future<void> restore() async {
    _session = await _auth.restore();
    _welcomeDone = _session != null;
    notifyListeners();
  }

  void continueAsGuest() {
    _welcomeDone = true;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    _session = await _auth.signIn(email, password);
    _welcomeDone = true;
    notifyListeners();
  }

  Future<void> signOut() async {
    await _auth.signOut();
    _session = null;
    _welcomeDone = false;
    notifyListeners();
  }
}
