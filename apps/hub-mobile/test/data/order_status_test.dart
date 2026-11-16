// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/vietqr/vietqr.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/booking.dart';
import 'package:hub_mobile/data/models/order.dart';

NewOrder _draft({int qty = 2, String productId = 'prod-01'}) => NewOrder(
  customerId: 'c1',
  htxCode: 'tan-cuong',
  recipient: 'A',
  phone: '0912345678',
  address: 'Hà Nội',
  lines: [OrderLine(productId: productId, name: 'Chè', unit: 'hộp', unitPrice: 180000, quantity: qty)],
  method: PaymentMethod.vietQr,
);

void main() {
  group('OrderStatus transitions', () {
    test('forward path', () {
      expect(OrderStatus.pending.forward, OrderStatus.confirmed);
      expect(OrderStatus.confirmed.forward, OrderStatus.shipping);
      expect(OrderStatus.shipping.forward, OrderStatus.completed);
      expect(OrderStatus.completed.forward, isNull);
    });
    test('allowed and forbidden moves', () {
      expect(OrderStatus.pending.canMoveTo(OrderStatus.cancelled), isTrue);
      expect(OrderStatus.confirmed.canMoveTo(OrderStatus.cancelled), isTrue);
      expect(OrderStatus.shipping.canMoveTo(OrderStatus.cancelled), isFalse);
      expect(OrderStatus.pending.canMoveTo(OrderStatus.shipping), isFalse);
      expect(OrderStatus.completed.canMoveTo(OrderStatus.pending), isFalse);
    });
    test('final states have no way out', () {
      expect(OrderStatus.completed.isFinal, isTrue);
      expect(OrderStatus.cancelled.isFinal, isTrue);
      expect(OrderStatus.pending.isFinal, isFalse);
    });
    test('Order.moveTo throws on an illegal step', () {
      final o = MockHubRepository();
      expect(o.listOrders('tan-cuong').then((l) => l.first.moveTo(OrderStatus.completed)), throwsA(isA<StateError>()));
    });
    test('booking transitions', () {
      expect(BookingStatus.pending.canMoveTo(BookingStatus.confirmed), isTrue);
      expect(BookingStatus.pending.canMoveTo(BookingStatus.completed), isFalse);
      expect(BookingStatus.cancelled.next, isEmpty);
    });
  });

  group('MockHubRepository rules', () {
    test('placing an order deducts stock; cancelling returns it', () async {
      final repo = MockHubRepository();
      final before = (await repo.listProducts()).firstWhere((p) => p.id == 'prod-01').stock;
      final order = await repo.placeOrder(_draft(qty: 5));
      expect((await repo.listProducts()).firstWhere((p) => p.id == 'prod-01').stock, before - 5);
      await repo.updateOrderStatus(order.id, OrderStatus.cancelled);
      expect((await repo.listProducts()).firstWhere((p) => p.id == 'prod-01').stock, before);
    });

    test('cannot order more than the stock, and nothing is deducted on failure', () async {
      final repo = MockHubRepository();
      final before = (await repo.listProducts()).firstWhere((p) => p.id == 'prod-03').stock;
      await expectLater(repo.placeOrder(_draft(qty: before + 1, productId: 'prod-03')), throwsA(isA<HubException>()));
      expect((await repo.listProducts()).firstWhere((p) => p.id == 'prod-03').stock, before);
    });

    test('illegal status change is refused with a Vietnamese message', () async {
      final repo = MockHubRepository();
      final order = await repo.placeOrder(_draft());
      await expectLater(
        repo.updateOrderStatus(order.id, OrderStatus.completed),
        throwsA(isA<HubException>().having((e) => e.message, 'message', contains('Không thể chuyển'))),
      );
    });

    test('recording the full payment settles the order and confirms it', () async {
      final repo = MockHubRepository();
      final order = await repo.placeOrder(_draft(qty: 1));
      expect(order.status, OrderStatus.pending);
      await repo.recordPayment(reference: order.code, amount: order.total, recordedBy: 'Hoa');
      final after = (await repo.listOrders('tan-cuong')).firstWhere((o) => o.id == order.id);
      expect(after.paymentStatus, PaymentStatus.paid);
      expect(after.status, OrderStatus.confirmed);
      final ledger = await repo.listPayments('tan-cuong');
      expect(ledger.single.amount, order.total);
      expect(ledger.single.recordedBy, 'Hoa');
    });

    test('a partial payment does not settle; a refund is a negative entry', () async {
      final repo = MockHubRepository();
      final order = await repo.placeOrder(_draft(qty: 1));
      await repo.recordPayment(reference: order.code, amount: 1000, recordedBy: 'Hoa');
      final now = (await repo.listOrders('tan-cuong')).firstWhere((o) => o.id == order.id);
      expect(now.paymentStatus, isNot(PaymentStatus.paid));
      expect(now.status, OrderStatus.pending);
      await repo.recordPayment(reference: order.code, amount: -1000, recordedBy: 'Hoa');
      expect((await repo.listPayments('tan-cuong')).length, 2);
      expect((await repo.summary('tan-cuong')).revenue, 0);
      await expectLater(
        repo.recordPayment(reference: order.code, amount: 0, recordedBy: 'x'),
        throwsA(isA<HubException>()),
      );
      await expectLater(
        repo.recordPayment(reference: 'nope', amount: 5, recordedBy: 'x'),
        throwsA(isA<HubException>()),
      );
    });

    test('booking takes seats, confirms on payment, then the travel company can check in', () async {
      final repo = MockHubRepository();
      final before = (await repo.listDepartures('tour-01')).firstWhere((d) => d.id == 'dep-02').seatsLeft;
      final b = await repo.createBooking(
        const NewBooking(
          customerId: 'c1',
          tourId: 'tour-01',
          departureId: 'dep-02',
          contactName: 'A',
          phone: '0912345678',
          adults: 2,
          children: 1,
        ),
      );
      expect(b.total, 2 * 350000 + 200000);
      expect((await repo.listDepartures('tour-01')).firstWhere((d) => d.id == 'dep-02').seatsLeft, before - 3);
      await expectLater(repo.checkIn(b.id), throwsA(isA<HubException>())); // not confirmed yet
      await repo.recordPayment(reference: b.code, amount: b.total, recordedBy: 'Hoa');
      final checked = await repo.checkIn(b.id);
      expect(checked.checkedIn, isTrue);
      expect(checked.status, BookingStatus.confirmed);
    });

    test('a full departure refuses more guests', () async {
      final repo = MockHubRepository();
      await expectLater(
        repo.createBooking(
          const NewBooking(
            customerId: 'c1',
            tourId: 'tour-02',
            departureId: 'dep-03',
            contactName: 'A',
            phone: '0912345678',
            adults: 3,
            children: 0,
          ),
        ),
        throwsA(isA<HubException>()),
      );
    });

    test('the travel company cancels a booking and the seats go back', () async {
      final repo = MockHubRepository();
      final before = (await repo.listDepartures('tour-01')).firstWhere((d) => d.id == 'dep-02').seatsLeft;
      final b = await repo.createBooking(
        const NewBooking(
          customerId: 'c1',
          tourId: 'tour-01',
          departureId: 'dep-02',
          contactName: 'A',
          phone: '0912345678',
          adults: 2,
          children: 0,
        ),
      );
      final cancelled = await repo.cancelBooking(b.id);
      expect(cancelled.status, BookingStatus.cancelled);
      expect((await repo.listDepartures('tour-01')).firstWhere((d) => d.id == 'dep-02').seatsLeft, before);
      await expectLater(repo.cancelBooking(b.id), throwsA(isA<HubException>()));
      await expectLater(repo.checkIn(b.id), throwsA(isA<HubException>()));
    });

    test('a checked-in group cannot be cancelled', () async {
      final repo = MockHubRepository();
      await repo.checkIn('bk-01');
      await expectLater(repo.cancelBooking('bk-01'), throwsA(isA<HubException>()));
    });

    test('tour money is in the tour ledger, never in the cooperative ledger or revenue', () async {
      final repo = MockHubRepository();
      final order = await repo.placeOrder(_draft(qty: 1));
      await repo.recordPayment(reference: order.code, amount: order.total, recordedBy: 'Hoa');
      await repo.recordPayment(reference: 'TOUR P3N8ZD', amount: 1400000, recordedBy: 'Công ty');
      final htxLedger = await repo.listPayments('tan-cuong');
      expect(htxLedger.map((p) => p.reference), [order.code]);
      expect((await repo.summary('tan-cuong')).revenue, order.total);
      final tourLedger = await repo.listTourPayments();
      expect(tourLedger.map((p) => p.reference), ['TOUR P3N8ZD']);
      expect(isTourReference('TOUR P3N8ZD'), isTrue);
      expect(isTourReference(order.code), isFalse);
    });

    test('the demo travel company has a VietQR bank from the app list', () async {
      final company = await MockHubRepository().getTourCompany();
      expect(company.name, 'Công ty Lữ hành Xứ Chè (demo)');
      expect(bankByBin(company.bankBin), isNotNull);
      expect(company.bankAccount, isNot((await MockHubRepository().getHtx('tan-cuong')).bankAccount));
    });

    test('article review: only pending articles can be approved or rejected', () async {
      final repo = MockHubRepository();
      final pending = await repo.listPendingArticles();
      expect(pending, isNotEmpty);
      final done = await repo.reviewArticle(pending.first.id, approve: true);
      expect(done.status.name, 'published');
      await expectLater(repo.reviewArticle(pending.first.id, approve: true), throwsA(isA<HubException>()));
      expect((await repo.listPublishedArticles()).any((a) => a.id == pending.first.id), isTrue);
    });

    test('codes are unique', () async {
      final repo = MockHubRepository();
      final codes = <String>{};
      for (var i = 0; i < 50; i++) {
        codes.add((await repo.placeOrder(_draft(qty: 1))).code);
        if (i == 30) break;
      }
      expect(codes.length, 31);
    });
  });
}
