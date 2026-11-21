// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';

import '../data/hub_repository.dart';
import '../data/local_store.dart';
import '../data/models/booking.dart';
import '../data/models/order.dart';

/// The signed-in customer's orders and tickets. They are written to the device
/// as soon as they are created and read from there first, so they open without
/// a network; [refresh] then merges what the server says.
class ActivityController extends ChangeNotifier {
  ActivityController(this._repo, this._store);
  final HubRepository _repo;
  final LocalStore _store;

  String? _userId;
  List<Order> _orders = [];
  List<Booking> _bookings = [];
  bool _offline = false;

  List<Order> get orders => List.unmodifiable(_orders);
  List<Booking> get bookings => List.unmodifiable(_bookings);

  /// True when the last refresh failed and the lists come from the device.
  bool get offline => _offline;

  /// Switches user (or signs out with null) and loads that user's saved data.
  void bind(String? userId) {
    if (userId == _userId) return;
    _userId = userId;
    _offline = false;
    if (userId == null) {
      _orders = [];
      _bookings = [];
    } else {
      _orders = _store.loadOrders(userId);
      _bookings = _store.loadBookings(userId);
    }
    notifyListeners();
  }

  Order? orderById(String id) => _orders.where((o) => o.id == id).firstOrNull;
  Booking? bookingById(String id) => _bookings.where((b) => b.id == id).firstOrNull;
  Order? orderByCode(String code) => _orders.where((o) => o.code == code).firstOrNull;
  Booking? bookingByCode(String code) => _bookings.where((b) => b.code == code).firstOrNull;

  Future<Order> placeOrder(NewOrder draft) async {
    final order = await _repo.placeOrder(draft);
    _orders = [order, ..._orders];
    await _persist();
    return order;
  }

  Future<Booking> createBooking(NewBooking draft) async {
    final booking = await _repo.createBooking(draft);
    _bookings = [booking, ..._bookings];
    await _persist();
    return booking;
  }

  /// "Tôi đã chuyển khoản". Offline it still records the claim on the device
  /// and reports false so the screen can say it will be confirmed later.
  Future<bool> claimPayment(String reference) async {
    var sent = true;
    try {
      await _repo.claimPayment(reference);
    } on HubException {
      rethrow;
    } catch (_) {
      sent = false;
    }
    _orders = [
      for (final o in _orders)
        o.code == reference && o.paymentStatus == PaymentStatus.unpaid
            ? o.copyWith(paymentStatus: PaymentStatus.claimed)
            : o,
    ];
    _bookings = [
      for (final b in _bookings)
        // A tour booking is confirmed as soon as the money is reported.
        b.code == reference && b.paymentStatus == PaymentStatus.unpaid
            ? b.copyWith(paymentStatus: PaymentStatus.paid, status: BookingStatus.confirmed)
            : b,
    ];
    await _persist();
    return sent;
  }

  /// Merges the server lists into the saved ones: the server's copy of an item
  /// wins, items only known to the device are kept.
  Future<void> refresh() async {
    final id = _userId;
    if (id == null) return;
    try {
      final remoteOrders = await _repo.listMyOrders(id);
      final remoteBookings = await _repo.listMyBookings(id);
      _orders = _merge(_orders, remoteOrders, (o) => o.id, (a, b) => b.createdAt.compareTo(a.createdAt));
      _bookings = _merge(_bookings, remoteBookings, (b) => b.id, (a, b) => b.createdAt.compareTo(a.createdAt));
      _offline = false;
      await _persist();
    } catch (_) {
      _offline = true;
      notifyListeners();
    }
  }

  static List<T> _merge<T>(List<T> local, List<T> remote, String Function(T) key, int Function(T, T) order) {
    final byId = {for (final item in local) key(item): item};
    for (final item in remote) {
      byId[key(item)] = item;
    }
    return byId.values.toList()..sort(order);
  }

  Future<void> _persist() async {
    notifyListeners();
    final id = _userId;
    if (id == null) return;
    await _store.saveOrders(id, _orders);
    await _store.saveBookings(id, _bookings);
  }
}
