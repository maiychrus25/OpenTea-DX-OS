// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'catalog.dart';
import 'order.dart';

class CartLine {
  const CartLine({
    required this.productId,
    required this.htxCode,
    required this.name,
    required this.unit,
    required this.unitPrice,
    required this.quantity,
  });
  final String productId;
  final String htxCode;
  final String name;
  final String unit;
  final int unitPrice;
  final int quantity;
  int get subtotal => unitPrice * quantity;

  CartLine withQuantity(int q) =>
      CartLine(productId: productId, htxCode: htxCode, name: name, unit: unit, unitPrice: unitPrice, quantity: q);

  Map<String, Object?> toJson() => {
    'productId': productId,
    'htxCode': htxCode,
    'name': name,
    'unit': unit,
    'unitPrice': unitPrice,
    'quantity': quantity,
  };

  factory CartLine.fromJson(Map<String, Object?> j) => CartLine(
    productId: j['productId']! as String,
    htxCode: j['htxCode']! as String,
    name: j['name']! as String,
    unit: j['unit']! as String,
    unitPrice: j['unitPrice']! as int,
    quantity: j['quantity']! as int,
  );
}

enum CartAddResult { added, otherHtx, outOfStock }

/// Shopping cart rules. One cart holds the products of one cooperative only,
/// because each cooperative has its own storefront and bank account.
class Cart {
  Cart([List<CartLine> lines = const []]) : _lines = List.of(lines);

  final List<CartLine> _lines;

  List<CartLine> get lines => List.unmodifiable(_lines);
  bool get isEmpty => _lines.isEmpty;
  String? get htxCode => _lines.isEmpty ? null : _lines.first.htxCode;
  int get itemCount => _lines.fold(0, (s, l) => s + l.quantity);
  int get total => _lines.fold(0, (s, l) => s + l.subtotal);

  /// Adds [quantity] of [product]; the quantity in the cart never exceeds the stock.
  CartAddResult add(Product product, {int quantity = 1}) {
    if (htxCode != null && htxCode != product.htxCode) return CartAddResult.otherHtx;
    final index = _lines.indexWhere((l) => l.productId == product.id);
    final current = index < 0 ? 0 : _lines[index].quantity;
    if (current + quantity > product.stock) return CartAddResult.outOfStock;
    if (index < 0) {
      _lines.add(
        CartLine(
          productId: product.id,
          htxCode: product.htxCode,
          name: product.name,
          unit: product.unit,
          unitPrice: product.price,
          quantity: quantity,
        ),
      );
    } else {
      _lines[index] = _lines[index].withQuantity(current + quantity);
    }
    return CartAddResult.added;
  }

  /// Sets the quantity of a line; zero or less removes it.
  void setQuantity(String productId, int quantity) {
    final index = _lines.indexWhere((l) => l.productId == productId);
    if (index < 0) return;
    if (quantity <= 0) {
      _lines.removeAt(index);
    } else {
      _lines[index] = _lines[index].withQuantity(quantity);
    }
  }

  void remove(String productId) => setQuantity(productId, 0);
  void clear() => _lines.clear();

  List<OrderLine> toOrderLines() => [
    for (final l in _lines)
      OrderLine(productId: l.productId, name: l.name, unit: l.unit, unitPrice: l.unitPrice, quantity: l.quantity),
  ];
}
