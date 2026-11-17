// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'hub_repository.dart';
import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/diagnosis.dart';
import 'models/order.dart';
import 'models/staff.dart';
import 'staff_seed.dart';
import 'seed_data.dart';

/// In-memory implementation over [SeedData]. State lives only as long as the
/// process; it never touches a network. Mirrors the rules the server will own
/// (stock, status transitions, append-only ledger).
class MockHubRepository implements HubRepository {
  @override
  bool get coreIsSample => true;

  @override
  bool get coreWritable => true;

  @override
  bool get canRejectJournal => true;

  @override
  bool get canRescheduleHarvest => true;

  @override
  bool get canDiagnose => true;

  final _diagnoses = <DiagnosisReport>[];

  // Sample classes of the tea model. The pick depends on the photo, so it is the same for the same picture; it is NOT
  // a real classification.
  static const _sampleDiseases = <(String, double)>[
    ('Đốm nâu (Brown blight)', 0.91),
    ('Thối búp (Bud blight)', 0.84),
    ('Rầy xanh gây cháy lá', 0.72),
    ('Lá khoẻ', 0.95),
    ('Chưa chắc chắn', 0.41),
  ];

  @override
  Future<DiagnosisReport> submitDiagnosis(Uint8List image, {String? parcelId, String? parcelCode}) async {
    final pick = _sampleDiseases[image.length % _sampleDiseases.length];
    final report = DiagnosisReport(
      id: 'dg-${_diagnoses.length + 1}',
      diseaseName: pick.$1,
      confidence: pick.$2,
      submittedAt: _now,
      parcelCode: parcelCode,
      image: image,
    );
    _diagnoses.insert(0, report);
    return report;
  }

  @override
  Future<List<DiagnosisReport>> listDiagnoses() async => List.unmodifiable(_diagnoses);

  MockHubRepository({DateTime? now}) : _now = now ?? DateTime.now() {
    final today = DateTime(_now.year, _now.month, _now.day);
    _departures.addAll(SeedData.departures(today));
    _articles.addAll(SeedData.articles(_now));
    _bookings.addAll(SeedData.bookings(today));
    _orders.addAll(SeedData.orders(_now));
    _parcels.addAll(StaffSeed.parcels(today));
    _journal.addAll(StaffSeed.journal(today));
    _lots.addAll(StaffSeed.lots(today));
    _notifications.addAll(StaffSeed.notifications(_now));
  }

  final DateTime _now;
  int _serial = 100;
  final _departures = <Departure>[];
  final _articles = <Article>[];
  final _bookings = <Booking>[];
  final _orders = <Order>[];
  final _payments = <Payment>[];
  final _parcels = <Parcel>[];
  final _journal = <JournalEntry>[];
  final _lots = <Lot>[];
  final _notifications = <AppNotification>[];
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
    origin: p.origin,
    harvest: p.harvest,
    shelfLife: p.shelfLife,
    storage: p.storage,
    brewing: p.brewing,
  );

  @override
  Future<List<Htx>> listHtxs() async => SeedData.htxs;

  @override
  Future<List<Site>> listSites(String htxCode) async => [
    for (final s in SeedData.sites)
      if (s.htxCode == htxCode) s,
  ];

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
    var index = _departures.indexWhere((d) => d.id == draft.departureId && d.tourId == draft.tourId);
    if (index < 0 && draft.date != null) {
      // A day the customer picked: reuse the tour's departure on that day, or open one with the tour's capacity.
      final day = DateTime(draft.date!.year, draft.date!.month, draft.date!.day);
      final now = DateTime.now();
      if (!day.isAfter(DateTime(now.year, now.month, now.day))) {
        throw const HubException('Hãy chọn một ngày từ ngày mai trở đi');
      }
      index = _departures.indexWhere(
        (d) => d.tourId == tour.id && d.date.year == day.year && d.date.month == day.month && d.date.day == day.day,
      );
      if (index < 0) {
        _departures.add(
          Departure(id: _nextId('dep'), tourId: tour.id, date: day, seatsTotal: tour.maxGuests, seatsTaken: 0),
        );
        index = _departures.length - 1;
      }
    }
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
      email: draft.email,
      note: draft.note,
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
    // A tour booking is confirmed as soon as the customer says the money was sent.
    if (_bookings[bi].paymentStatus == PaymentStatus.unpaid) {
      _bookings[bi] = _bookings[bi].copyWith(paymentStatus: PaymentStatus.paid, status: BookingStatus.confirmed);
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
  Future<TourCompany> getTourCompany() async => SeedData.tourCompany;

  @override
  Future<Booking> cancelBooking(String bookingId) async {
    final i = _bookings.indexWhere((b) => b.id == bookingId);
    if (i < 0) throw const HubException('Không tìm thấy lượt đặt');
    final b = _bookings[i];
    if (!b.status.canMoveTo(BookingStatus.cancelled)) {
      throw const HubException('Không thể huỷ lượt đặt này');
    }
    if (b.checkedIn) throw const HubException('Đoàn đã điểm danh, không huỷ được');
    // Give the seats back to the departure.
    final di = _departures.indexWhere((d) => d.id == b.departureId);
    if (di >= 0) {
      final d = _departures[di];
      _departures[di] = Departure(
        id: d.id,
        tourId: d.tourId,
        date: d.date,
        seatsTotal: d.seatsTotal,
        seatsTaken: (d.seatsTaken - b.guests).clamp(0, d.seatsTotal),
      );
    }
    return _bookings[i] = b.copyWith(status: BookingStatus.cancelled);
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
      if (p.htxCode == htxCode && !isTourReference(p.reference)) p,
  ];

  @override
  Future<List<Payment>> listTourPayments() async => [
    for (final p in _payments.reversed)
      if (isTourReference(p.reference)) p,
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
      revenue: _payments
          .where((p) => p.htxCode == htxCode && !isTourReference(p.reference))
          .fold(0, (s, p) => s + p.amount),
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

  @override
  Future<HtxProfile> getHtxProfile(String htxCode) async => StaffSeed.htxProfiles.firstWhere(
    (h) => h.code == htxCode,
    orElse: () => throw const HubException('Không tìm thấy HTX'),
  );

  bool _inHtx(String householdId, String htxCode) =>
      StaffSeed.members.any((m) => m.householdId == householdId && m.htxCode == htxCode);

  @override
  Future<List<Parcel>> listParcels(String htxCode, {String? householdId}) async => [
    for (final p in _parcels)
      if (_inHtx(p.householdId, htxCode) && (householdId == null || p.householdId == householdId)) p,
  ];

  @override
  Future<List<Member>> listMembers(String htxCode) async => [
    for (final m in StaffSeed.members)
      if (m.htxCode == htxCode) m,
  ];

  @override
  Future<List<JournalEntry>> listJournal(String htxCode, {String? householdId}) async {
    final list = [
      for (final e in _journal)
        if (_inHtx(e.householdId, htxCode) && (householdId == null || e.householdId == householdId)) e,
    ]..sort((a, b) => b.entryDate.compareTo(a.entryDate));
    return list;
  }

  @override
  Future<JournalEntry> reviewJournal(String entryId, {required bool approve}) async {
    final i = _journal.indexWhere((e) => e.id == entryId);
    if (i < 0) throw const HubException('Không tìm thấy nhật ký');
    if (_journal[i].status != JournalStatus.pendingApproval) {
      throw const HubException('Nhật ký này không ở trạng thái chờ duyệt');
    }
    return _journal[i] = _journal[i].copyWith(status: approve ? JournalStatus.approved : JournalStatus.rejected);
  }

  @override
  Future<JournalEntry> addJournal(NewJournalEntry draft) async {
    final pi = _parcels.indexWhere((p) => p.id == draft.parcelId);
    if (pi < 0) throw const HubException('Chưa chọn thửa đất');
    final parcel = _parcels[pi];
    if (draft.activityType == ActivityType.spraying && (draft.productName ?? '').trim().isEmpty) {
      throw const HubException('Phun thuốc cần ghi tên sản phẩm');
    }
    final entry = JournalEntry(
      id: _nextId('jr'),
      parcelId: parcel.id,
      parcelCode: parcel.code,
      cropType: parcel.cropType,
      householdId: parcel.householdId,
      entryDate: draft.entryDate,
      activityType: draft.activityType,
      performedBy: draft.performedBy,
      status: JournalStatus.pendingApproval,
      activityDetail: draft.activityType.label,
      productName: draft.productName,
      dosage: draft.dosage,
      withdrawalDays: draft.withdrawalDays,
      notes: draft.notes,
    );
    _journal.add(entry);
    return entry;
  }

  @override
  Future<Parcel> rescheduleHarvest(String parcelId, DateTime date) async {
    final i = _parcels.indexWhere((p) => p.id == parcelId);
    if (i < 0) throw const HubException('Không tìm thấy thửa đất');
    if (_parcels[i].status == ParcelStatus.harvested) throw const HubException('Thửa đã thu hoạch xong');
    return _parcels[i] = _parcels[i].copyWith(estimatedHarvestDate: date);
  }

  @override
  Future<List<Lot>> listLots(String htxCode) async => htxCode == 'tan-cuong' ? List.of(_lots) : const [];

  @override
  Future<List<AppNotification>> listNotifications(String htxCode, {String? householdId}) async {
    final list = [
      for (final n in _notifications)
        if (householdId == null ? n.forStaff : (n.householdId == null || n.householdId == householdId)) n,
    ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return htxCode == 'tan-cuong' ? list : const [];
  }

  @override
  Future<void> markNotificationRead(String id) async {
    final i = _notifications.indexWhere((n) => n.id == id);
    if (i >= 0) _notifications[i] = _notifications[i].copyWith(isRead: true);
  }

  @override
  Future<void> markAllNotificationsRead(String htxCode, {String? householdId}) async {
    for (final n in await listNotifications(htxCode, householdId: householdId)) {
      await markNotificationRead(n.id);
    }
  }

  @override
  Future<void> announce({required String title, required String body}) async {
    if (title.trim().isEmpty || body.trim().isEmpty) throw const HubException('Cần nhập tiêu đề và nội dung.');
    _notifications.add(
      AppNotification(
        id: 'nt-announce-${_notifications.length + 1}',
        kind: NotificationKind.announcement,
        title: title.trim(),
        body: body.trim(),
        createdAt: _now,
      ),
    );
  }

  @override
  Future<List<BulletinItem>> listBulletins() async => StaffSeed.bulletins(_now);

  @override
  Future<List<MarketPrice>> listMarketPrices() async => StaffSeed.marketPrices;

  @override
  Future<WeatherNow> currentWeather(String htxCode) async => StaffSeed.weather;

  @override
  Future<List<LinkedHtx>> listLinkedHtxs() async => StaffSeed.linkedHtxs;

  @override
  Future<List<RegionTour>> listRegionTours() async => StaffSeed.regionTours;

  @override
  Future<List<ReportRow>> reportRows() async => StaffSeed.reportRows;
}
