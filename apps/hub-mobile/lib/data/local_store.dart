// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/role/role.dart';
import 'models/booking.dart';
import 'models/cart.dart';
import 'models/order.dart';

/// Everything kept on the device: cart, the signed-in user's orders and
/// tickets (so they open without a network) and the demo session.
/// Values are JSON strings in SharedPreferences.
class LocalStore {
  LocalStore(this._prefs);
  final SharedPreferences _prefs;

  static Future<LocalStore> open() async => LocalStore(await SharedPreferences.getInstance());

  static const _cartKey = 'cart.v1';
  static const _sessionKey = 'session.v1';
  static String _ordersKey(String userId) => 'orders.v1.$userId';
  static String _bookingsKey(String userId) => 'bookings.v1.$userId';

  List<T> _readList<T>(String key, T Function(Map<String, Object?>) decode) {
    final raw = _prefs.getString(key);
    if (raw == null) return [];
    try {
      return [for (final e in (jsonDecode(raw) as List)) decode((e as Map).cast<String, Object?>())];
    } catch (_) {
      return []; // a corrupt entry must not crash the app
    }
  }

  Future<void> _writeList(String key, List<Map<String, Object?>> items) => _prefs.setString(key, jsonEncode(items));

  List<CartLine> loadCart() => _readList(_cartKey, CartLine.fromJson);
  Future<void> saveCart(List<CartLine> lines) => _writeList(_cartKey, [for (final l in lines) l.toJson()]);

  List<Order> loadOrders(String userId) => _readList(_ordersKey(userId), Order.fromJson);
  Future<void> saveOrders(String userId, List<Order> orders) =>
      _writeList(_ordersKey(userId), [for (final o in orders) o.toJson()]);

  List<Booking> loadBookings(String userId) => _readList(_bookingsKey(userId), Booking.fromJson);
  Future<void> saveBookings(String userId, List<Booking> bookings) =>
      _writeList(_bookingsKey(userId), [for (final b in bookings) b.toJson()]);

  /// Demo session only. A real session keeps tokens in secure storage, not here.
  Claims? loadSession() {
    final raw = _prefs.getString(_sessionKey);
    if (raw == null) return null;
    try {
      return Claims.fromJson((jsonDecode(raw) as Map).cast<String, Object?>());
    } catch (_) {
      return null;
    }
  }

  Future<void> saveSession(Claims claims) => _prefs.setString(_sessionKey, jsonEncode(claims.toJson()));
  Future<void> clearSession() => _prefs.remove(_sessionKey);
}
