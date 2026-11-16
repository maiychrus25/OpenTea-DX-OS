// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/app/activity_controller.dart';
import 'package:hub_mobile/data/hub_repository.dart';
import 'package:hub_mobile/data/local_store.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/order.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Repository whose network is switched off after creation.
class _FlakyRepo extends MockHubRepository {
  bool online = true;

  @override
  Future<List<Order>> listMyOrders(String customerId) async {
    if (!online) throw Exception('no network');
    return super.listMyOrders(customerId);
  }

  @override
  Future<void> claimPayment(String reference) async {
    if (!online) throw Exception('no network');
    return super.claimPayment(reference);
  }
}

NewOrder _draft() => const NewOrder(
  customerId: 'cus-demo',
  htxCode: 'tan-cuong',
  recipient: 'A',
  phone: '0912345678',
  address: 'Hà Nội',
  lines: [OrderLine(productId: 'prod-01', name: 'Chè', unit: 'hộp', unitPrice: 180000, quantity: 1)],
  method: PaymentMethod.vietQr,
);

void main() {
  late _FlakyRepo repo;
  late LocalStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store = await LocalStore.open();
    repo = _FlakyRepo();
  });

  test('a new order and booking are written to the device at once', () async {
    final activity = ActivityController(repo, store)..bind('cus-demo');
    final order = await activity.placeOrder(_draft());
    final booking = await activity.createBooking(
      const NewBooking(
        customerId: 'cus-demo',
        tourId: 'tour-01',
        departureId: 'dep-02',
        contactName: 'A',
        phone: '0912345678',
        adults: 1,
        children: 0,
      ),
    );
    expect(store.loadOrders('cus-demo').map((o) => o.id), contains(order.id));
    expect(store.loadBookings('cus-demo').map((b) => b.id), contains(booking.id));
  });

  test('a fresh controller opens the saved orders and tickets with no network', () async {
    final first = ActivityController(repo, store)..bind('cus-demo');
    final order = await first.placeOrder(_draft());
    repo.online = false;

    final second = ActivityController(repo, store)..bind('cus-demo');
    expect(second.orderById(order.id), isNotNull);
    await second.refresh();
    expect(second.offline, isTrue);
    expect(second.orderById(order.id)?.code, order.code); // still there
  });

  test('refresh merges the server copy over the saved one and clears offline', () async {
    final activity = ActivityController(repo, store)..bind('cus-demo');
    final order = await activity.placeOrder(_draft());
    await repo.recordPayment(reference: order.code, amount: order.total, recordedBy: 'Hoa');
    expect(activity.orderById(order.id)?.paymentStatus, PaymentStatus.unpaid); // device copy is stale
    await activity.refresh();
    expect(activity.offline, isFalse);
    expect(activity.orderById(order.id)?.paymentStatus, PaymentStatus.paid);
    expect(store.loadOrders('cus-demo').firstWhere((o) => o.id == order.id).paymentStatus, PaymentStatus.paid);
  });

  test('claiming a payment offline still marks it on the device and reports not sent', () async {
    final activity = ActivityController(repo, store)..bind('cus-demo');
    final order = await activity.placeOrder(_draft());
    repo.online = false;
    expect(await activity.claimPayment(order.code), isFalse);
    expect(activity.orderById(order.id)?.paymentStatus, PaymentStatus.claimed);
  });

  test('data is separated per user and cleared on sign out', () async {
    final activity = ActivityController(repo, store)..bind('cus-demo');
    await activity.placeOrder(_draft());
    activity.bind('other');
    expect(activity.orders, isEmpty);
    activity.bind(null);
    expect(activity.orders, isEmpty);
    activity.bind('cus-demo');
    expect(activity.orders.length, 1);
  });
}
