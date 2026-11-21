// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/foundation.dart';

import '../data/local_store.dart';
import '../data/models/cart.dart';
import '../data/models/catalog.dart';
import '../data/models/order.dart';

/// Cart kept on the device; survives restarts and works offline.
class CartController extends ChangeNotifier {
  CartController(this._store) : _cart = Cart(_store.loadCart());
  final LocalStore _store;
  final Cart _cart;

  List<CartLine> get lines => _cart.lines;
  bool get isEmpty => _cart.isEmpty;
  int get itemCount => _cart.itemCount;
  int get total => _cart.total;
  String? get htxCode => _cart.htxCode;

  Future<CartAddResult> add(Product product, {int quantity = 1}) async {
    final result = _cart.add(product, quantity: quantity);
    if (result == CartAddResult.added) await _persist();
    return result;
  }

  Future<void> setQuantity(String productId, int quantity) async {
    _cart.setQuantity(productId, quantity);
    await _persist();
  }

  Future<void> clear() async {
    _cart.clear();
    await _persist();
  }

  List<OrderLine> toOrderLines() => _cart.toOrderLines();

  Future<void> _persist() async {
    notifyListeners();
    await _store.saveCart(_cart.lines);
  }
}
