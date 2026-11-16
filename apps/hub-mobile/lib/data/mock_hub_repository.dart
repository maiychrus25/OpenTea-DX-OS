// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'hub_repository.dart';
import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/order.dart';
import 'seed_data.dart';

/// In-memory implementation over [SeedData]. State lives only as long as the
/// process; it never touches a network. Mirrors the rules the server will own
/// (stock, status transitions, append-only ledger).
class MockHubRepository implements HubRepository {
  MockHubRepository({DateTime? now}) : _now = now ?? DateTime.now() {
    final today = DateTime(_now.year, _now.month, _now.day);
    _departures.addAll(SeedData.departures(today));
    _articles.addAll(SeedData.articles(_now));
    _bookings.addAll(SeedData.bookings(today));
    _orders.addAll(SeedData.orders(_now));
  }

  final DateTime _now;
  int _serial = 100;
  final _departures = <Departure>[];
  final _articles = <Article>[];
  final _bookings = <Booking>[];
  final _orders = <Order>[];
  final _payments = <Payment>[];
  final _stock = <String, int>{for (final p in SeedData.products) p.id: p.stock};

  String _nextId(String prefix) => '$prefix-${_serial++}';

  /// Base-32 of a counter with unambiguous characters (no 0/O, 1/I), so codes never collide.
  String _nextCode(String prefix) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var n = _serial++ * 7919 + 104729;
    final chars = <String>[];
    for (var i = 0; i < 6; i++) {
      chars.add(alphabet[n % 32]);
      n ~/= 32;
    }
    return '$prefix ${chars.reversed.join()}';
  }

  Product _withStock(Product p) => Product(
    id: p.id,
    htxCode: p.htxCode,
    name: p.name,
    unit: p.unit,
    price: p.price,
    stock: _stock[p.id] ?? 0,
    description: p.description,
    gradientSeed: p.gradientSeed,
    householdId: p.householdId,
  );

  @override
  Future<List<Htx>> listHtxs() async => SeedData.htxs;

  @override
  Future<Htx> getHtx(String code) async =>
      SeedData.htxs.firstWhere((h) => h.code == code, orElse: () => throw const HubException('Không tìm thấy HTX'));

  @override
  Future<List<Household>> listHouseholds({String? htxCode}) async => [
    for (final h in SeedData.households)
      if (htxCode == null || h.htxCode == htxCode) h,
  ];

  @override
  Future<Household> getHousehold(String id) async =>
      SeedData.households.firstWhere((h) => h.id == id, orElse: () => throw const HubException('Không tìm thấy hộ'));

  @override
  Future<List<Tour>> listTours({String? htxCode}) async => [
    for (final t in SeedData.tours)
      if (htxCode == null || t.htxCode == htxCode) t,
  ];

  @override
  Future<Tour> getTour(String id) async =>
      SeedData.tours.firstWhere((t) => t.id == id, orElse: () => throw const HubException('Không tìm thấy tour'));

  @override
  Future<List<Departure>> listDepartures(String tourId) async {
    final list = [
      for (final d in _departures)
        if (d.tourId == tourId) d,
    ]..sort((a, b) => a.date.compareTo(b.date));
    return list;
  }

  @override
  Future<List<Product>> listProducts({String? htxCode}) async => [
    for (final p in SeedData.products)
      if (htxCode == null || p.htxCode == htxCode) _withStock(p),
  ];

  @override
  Future<List<Article>> listPublishedArticles() async {
    final list = [
      for (final a in _articles)
        if (a.status == ArticleStatus.published) a,
    ];
    list.sort((a, b) {
      if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.compareTo(a.createdAt);
    });
    return list;
  }

  @override
  Future<Order> placeOrder(NewOrder draft) async {
    if (draft.lines.isEmpty) throw const HubException('Giỏ hàng trống');
    // Check all stock first, then deduct, so a failure leaves nothing half done.
    for (final line in draft.lines) {
      final have = _stock[line.productId] ?? 0;
      if (line.quantity > have) {
        throw HubException('"${line.name}" chỉ còn $have');
      }
    }
    for (final line in draft.lines) {
      _stock[line.productId] = _stock[line.productId]! - line.quantity;
    }
    final order = Order(
      id: _nextId('ord'),
      code: _nextCode('DH'),
      htxCode: draft.htxCode,
      customerId: draft.customerId,
      recipient: draft.recipient,
      phone: draft.phone,
      address: draft.address,
      note: draft.note,
      lines: draft.lines,
      method: draft.method,
      status: OrderStatus.pending,
      paymentStatus: PaymentStatus.unpaid,
      createdAt: DateTime.now(),
    );
    _orders.add(order);
    return order;
  }

  @override
  Future<Booking> createBooking(NewBooking draft) async {
    final tour = await getTour(draft.tourId);
    final index = _departures.indexWhere((d) => d.id == draft.departureId && d.tourId == draft.tourId);
    if (index < 0) throw const HubException('Không tìm thấy ngày khởi hành');
    final dep = _departures[index];
    final guests = draft.adults + draft.children;
    if (draft.adults < 1) throw const HubException('Cần ít nhất một người lớn');
    if (guests > dep.seatsLeft) throw HubException('Ngày này chỉ còn ${dep.seatsLeft} chỗ');
    _departures[index] = Departure(
      id: dep.id,
      tourId: dep.tourId,
      date: dep.date,
      seatsTotal: dep.seatsTotal,
      seatsTaken: dep.seatsTaken + guests,
    );
    final booking = Booking(
      id: _nextId('bk'),
      code: _nextCode('TOUR'),
      htxCode: tour.htxCode,
      householdId: tour.householdId,
      tourId: tour.id,
      tourName: tour.name,
      departureId: dep.id,
      departureDate: dep.date,
      customerId: draft.customerId,
      contactName: draft.contactName,
      phone: draft.phone,
      adults: draft.adults,
      children: draft.children,
      total: draft.adults * tour.adultPrice + draft.children * tour.childPrice,
      status: BookingStatus.pending,
      paymentStatus: PaymentStatus.unpaid,
      createdAt: DateTime.now(),
    );
    _bookings.add(booking);
    return booking;
  }

  @override
  Future<void> claimPayment(String reference) async {
    final oi = _orders.indexWhere((o) => o.code == reference);
    if (oi >= 0) {
      if (_orders[oi].paymentStatus == PaymentStatus.unpaid) {
        _orders[oi] = _orders[oi].copyWith(paymentStatus: PaymentStatus.claimed);
      }
      return;
    }
    final bi = _bookings.indexWhere((b) => b.code == reference);
    if (bi < 0) throw const HubException('Không tìm thấy mã');
    if (_bookings[bi].paymentStatus == PaymentStatus.unpaid) {
      _bookings[bi] = _bookings[bi].copyWith(paymentStatus: PaymentStatus.claimed);
    }
  }

  @override
  Future<List<Order>> listMyOrders(String customerId) async => [
    for (final o in _orders.reversed)
      if (o.customerId == customerId) o,
  ];

  @override
  Future<List<Booking>> listMyBookings(String customerId) async => [
    for (final b in _bookings.reversed)
      if (b.customerId == customerId) b,
  ];

  @override
  Future<List<Booking>> listHouseholdVisits(String householdId) async {
    final list = [
      for (final b in _bookings)
        if (b.householdId == householdId && b.status != BookingStatus.cancelled) b,
    ]..sort((a, b) => a.departureDate.compareTo(b.departureDate));
    return list;
  }

  @override
  Future<Booking> checkIn(String bookingId) async {
    final i = _bookings.indexWhere((b) => b.id == bookingId);
    if (i < 0) throw const HubException('Không tìm thấy lượt đặt');
    if (_bookings[i].status != BookingStatus.confirmed) {
      throw const HubException('Chỉ điểm danh được lượt đặt đã xác nhận');
    }
    return _bookings[i] = _bookings[i].copyWith(checkedIn: true);
  }

  @override
  Future<List<Product>> listHouseholdProducts(String householdId) async => [
    for (final p in SeedData.products)
      if (p.householdId == householdId) _withStock(p),
  ];

  @override
  Future<List<Order>> listOrders(String htxCode) async => [
    for (final o in _orders.reversed)
      if (o.htxCode == htxCode) o,
  ];

  @override
  Future<Order> updateOrderStatus(String orderId, OrderStatus target) async {
    final i = _orders.indexWhere((o) => o.id == orderId);
    if (i < 0) throw const HubException('Không tìm thấy đơn');
    final current = _orders[i];
    final Order updated;
    try {
      updated = current.moveTo(target);
    } on StateError catch (e) {
      throw HubException(e.message);
    }
    if (target == OrderStatus.cancelled) {
      // Cancelling gives the stock back (direction doc §5.3).
      for (final line in current.lines) {
        _stock[line.productId] = (_stock[line.productId] ?? 0) + line.quantity;
      }
    }
    return _orders[i] = updated;
  }

  @override
  Future<List<Booking>> listBookings(String htxCode) async => [
    for (final b in _bookings.reversed)
      if (b.htxCode == htxCode) b,
  ];

  @override
  Future<Payment> recordPayment({required String reference, required int amount, required String recordedBy}) async {
    if (amount == 0) throw const HubException('Số tiền phải khác 0');
    final oi = _orders.indexWhere((o) => o.code == reference);
    final bi = oi >= 0 ? -1 : _bookings.indexWhere((b) => b.code == reference);
    if (oi < 0 && bi < 0) throw const HubException('Không tìm thấy mã');
    final htx = oi >= 0 ? _orders[oi].htxCode : _bookings[bi].htxCode;
    final payment = Payment(
      id: _nextId('pay'),
      htxCode: htx,
      reference: reference,
      amount: amount,
      recordedBy: recordedBy,
      recordedAt: DateTime.now(),
    );
    _payments.add(payment);
    final paid = _payments.where((p) => p.reference == reference).fold(0, (s, p) => s + p.amount);
    if (oi >= 0) {
      final o = _orders[oi];
      if (paid >= o.total) {
        var next = o.copyWith(paymentStatus: PaymentStatus.paid);
        if (next.status == OrderStatus.pending) next = next.moveTo(OrderStatus.confirmed);
        _orders[oi] = next;
      }
    } else {
      final b = _bookings[bi];
      if (paid >= b.total) {
        _bookings[bi] = b.copyWith(
          paymentStatus: PaymentStatus.paid,
          status: b.status == BookingStatus.pending ? BookingStatus.confirmed : b.status,
        );
      }
    }
    return payment;
  }

  @override
  Future<List<Payment>> listPayments(String htxCode) async => [
    for (final p in _payments.reversed)
      if (p.htxCode == htxCode) p,
  ];

  @override
  Future<List<Article>> listArticles(String htxCode) async => [
    for (final a in _articles)
      if (a.htxCode == htxCode) a,
  ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  @override
  Future<Article> submitArticle(String articleId) async {
    final i = _articles.indexWhere((a) => a.id == articleId);
    if (i < 0) throw const HubException('Không tìm thấy bài');
    if (_articles[i].status != ArticleStatus.draft && _articles[i].status != ArticleStatus.rejected) {
      throw const HubException('Chỉ gửi duyệt được bài nháp hoặc bài bị từ chối');
    }
    return _articles[i] = _articles[i].copyWith(status: ArticleStatus.pending);
  }

  @override
  Future<HtxSummary> summary(String htxCode) async {
    final htx = await getHtx(htxCode);
    return HtxSummary(
      htx: htx.name,
      pendingOrders: _orders.where((o) => o.htxCode == htxCode && o.status == OrderStatus.pending).length,
      pendingBookings: _bookings.where((b) => b.htxCode == htxCode && b.status == BookingStatus.pending).length,
      confirmedBookings: _bookings.where((b) => b.htxCode == htxCode && b.status == BookingStatus.confirmed).length,
      revenue: _payments.where((p) => p.htxCode == htxCode).fold(0, (s, p) => s + p.amount),
    );
  }

  @override
  Future<List<HtxSummary>> listLinkedSummaries() async => [for (final h in SeedData.htxs) await summary(h.code)];

  @override
  Future<List<Article>> listPendingArticles() async => [
    for (final a in _articles)
      if (a.status == ArticleStatus.pending) a,
  ];

  @override
  Future<Article> reviewArticle(String articleId, {required bool approve}) async {
    final i = _articles.indexWhere((a) => a.id == articleId);
    if (i < 0) throw const HubException('Không tìm thấy bài');
    if (_articles[i].status != ArticleStatus.pending) throw const HubException('Bài này không ở trạng thái chờ duyệt');
    return _articles[i] = _articles[i].copyWith(status: approve ? ArticleStatus.published : ArticleStatus.rejected);
  }

  @override
  Future<List<Booking>> listAllBookings() async => _bookings.reversed.toList();
}
