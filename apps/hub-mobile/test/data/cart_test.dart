// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/data/models/cart.dart';
import 'package:hub_mobile/data/models/catalog.dart';

Product _p(String id, {String htx = 'a', int price = 100000, int stock = 10}) => Product(
  id: id,
  htxCode: htx,
  name: 'SP $id',
  unit: 'hộp',
  price: price,
  stock: stock,
  description: '',
  gradientSeed: 0,
);

void main() {
  test('adding merges lines and totals correctly', () {
    final cart = Cart();
    expect(cart.add(_p('1', price: 180000), quantity: 2), CartAddResult.added);
    expect(cart.add(_p('1', price: 180000)), CartAddResult.added);
    expect(cart.add(_p('2', price: 95000)), CartAddResult.added);
    expect(cart.lines.length, 2);
    expect(cart.itemCount, 4);
    expect(cart.total, 3 * 180000 + 95000);
  });

  test('stock is a hard limit, including what is already in the cart', () {
    final cart = Cart();
    expect(cart.add(_p('1', stock: 3), quantity: 3), CartAddResult.added);
    expect(cart.add(_p('1', stock: 3)), CartAddResult.outOfStock);
    expect(cart.itemCount, 3);
    expect(cart.add(_p('9', stock: 0)), CartAddResult.outOfStock);
  });

  test('one cart holds one cooperative only', () {
    final cart = Cart();
    cart.add(_p('1', htx: 'a'));
    expect(cart.add(_p('2', htx: 'b')), CartAddResult.otherHtx);
    expect(cart.htxCode, 'a');
    cart.clear();
    expect(cart.add(_p('2', htx: 'b')), CartAddResult.added);
    expect(cart.htxCode, 'b');
  });

  test('setQuantity changes, and zero or less removes', () {
    final cart = Cart()..add(_p('1'));
    cart.setQuantity('1', 5);
    expect(cart.itemCount, 5);
    cart.setQuantity('1', 0);
    expect(cart.isEmpty, isTrue);
    cart.add(_p('2'));
    cart.remove('2');
    expect(cart.isEmpty, isTrue);
    cart.setQuantity('missing', 3); // no effect, no crash
  });

  test('keeps the price at the time of adding and converts to order lines', () {
    final cart = Cart()..add(_p('1', price: 120000), quantity: 2);
    final lines = cart.toOrderLines();
    expect(lines.single.unitPrice, 120000);
    expect(lines.single.subtotal, 240000);
  });

  test('cart line json round trips', () {
    final line = Cart().lines;
    expect(line, isEmpty);
    final l = (Cart()..add(_p('1'), quantity: 2)).lines.single;
    final back = CartLine.fromJson(l.toJson());
    expect(back.productId, '1');
    expect(back.quantity, 2);
    expect(back.subtotal, l.subtotal);
  });
}
