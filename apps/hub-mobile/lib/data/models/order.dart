// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

enum PaymentMethod { vietQr, cashOnDelivery }

enum PaymentStatus { unpaid, claimed, paid }

extension PaymentLabels on PaymentStatus {
  String get label => switch (this) {
    PaymentStatus.unpaid => 'Chưa thanh toán',
    PaymentStatus.claimed => 'Khách báo đã chuyển khoản',
    PaymentStatus.paid => 'Đã nhận tiền',
  };
}

/// Order lifecycle (direction doc §5.3): pending, confirmed, shipping, completed, cancelled.
enum OrderStatus { pending, confirmed, shipping, completed, cancelled }

extension OrderStatusRules on OrderStatus {
  String get label => switch (this) {
    OrderStatus.pending => 'Chờ xác nhận',
    OrderStatus.confirmed => 'Đã xác nhận',
    OrderStatus.shipping => 'Đang giao',
    OrderStatus.completed => 'Hoàn tất',
    OrderStatus.cancelled => 'Đã huỷ',
  };

  /// The statuses reachable from this one in one step.
  Set<OrderStatus> get next => switch (this) {
    OrderStatus.pending => {OrderStatus.confirmed, OrderStatus.cancelled},
    OrderStatus.confirmed => {OrderStatus.shipping, OrderStatus.cancelled},
    OrderStatus.shipping => {OrderStatus.completed},
    OrderStatus.completed => const {},
    OrderStatus.cancelled => const {},
  };

  bool canMoveTo(OrderStatus target) => next.contains(target);
  bool get isFinal => next.isEmpty;

  /// The normal forward step shown as the main button, if any.
  OrderStatus? get forward => switch (this) {
    OrderStatus.pending => OrderStatus.confirmed,
    OrderStatus.confirmed => OrderStatus.shipping,
    OrderStatus.shipping => OrderStatus.completed,
    _ => null,
  };
}

class OrderLine {
  const OrderLine({
    required this.productId,
    required this.name,
    required this.unit,
    required this.unitPrice,
    required this.quantity,
  });
  final String productId;
  final String name;
  final String unit;
  final int unitPrice;
  final int quantity;
  int get subtotal => unitPrice * quantity;

  Map<String, Object?> toJson() => {
    'productId': productId,
    'name': name,
    'unit': unit,
    'unitPrice': unitPrice,
    'quantity': quantity,
  };

  factory OrderLine.fromJson(Map<String, Object?> j) => OrderLine(
    productId: j['productId']! as String,
    name: j['name']! as String,
    unit: j['unit']! as String,
    unitPrice: j['unitPrice']! as int,
    quantity: j['quantity']! as int,
  );
}

class Order {
  const Order({
    required this.id,
    required this.code,
    required this.htxCode,
    required this.customerId,
    required this.recipient,
    required this.phone,
    required this.address,
    required this.lines,
    required this.method,
    required this.status,
    required this.paymentStatus,
    required this.createdAt,
    this.note = '',
  });

  final String id;

  /// Short code shown to people and used as the bank transfer note.
  final String code;
  final String htxCode;
  final String customerId;
  final String recipient;
  final String phone;
  final String address;
  final String note;
  final List<OrderLine> lines;
  final PaymentMethod method;
  final OrderStatus status;
  final PaymentStatus paymentStatus;
  final DateTime createdAt;

  int get total => lines.fold(0, (sum, l) => sum + l.subtotal);

  Order copyWith({OrderStatus? status, PaymentStatus? paymentStatus}) => Order(
    id: id,
    code: code,
    htxCode: htxCode,
    customerId: customerId,
    recipient: recipient,
    phone: phone,
    address: address,
    note: note,
    lines: lines,
    method: method,
    status: status ?? this.status,
    paymentStatus: paymentStatus ?? this.paymentStatus,
    createdAt: createdAt,
  );

  /// Moves to [target] or throws [StateError] when the step is not allowed.
  Order moveTo(OrderStatus target) {
    if (!status.canMoveTo(target)) {
      throw StateError('Không thể chuyển đơn từ "${status.label}" sang "${target.label}"');
    }
    return copyWith(status: target);
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'code': code,
    'htxCode': htxCode,
    'customerId': customerId,
    'recipient': recipient,
    'phone': phone,
    'address': address,
    'note': note,
    'lines': [for (final l in lines) l.toJson()],
    'method': method.name,
    'status': status.name,
    'paymentStatus': paymentStatus.name,
    'createdAt': createdAt.toIso8601String(),
  };

  factory Order.fromJson(Map<String, Object?> j) => Order(
    id: j['id']! as String,
    code: j['code']! as String,
    htxCode: j['htxCode']! as String,
    customerId: j['customerId']! as String,
    recipient: j['recipient']! as String,
    phone: j['phone']! as String,
    address: j['address']! as String,
    note: (j['note'] as String?) ?? '',
    lines: [for (final l in (j['lines']! as List)) OrderLine.fromJson((l as Map).cast<String, Object?>())],
    method: PaymentMethod.values.byName(j['method']! as String),
    status: OrderStatus.values.byName(j['status']! as String),
    paymentStatus: PaymentStatus.values.byName(j['paymentStatus']! as String),
    createdAt: DateTime.parse(j['createdAt']! as String),
  );
}
