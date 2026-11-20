// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter_test/flutter_test.dart';
import 'package:hub_mobile/core/money/money.dart';
import 'package:hub_mobile/data/mock_hub_repository.dart';
import 'package:hub_mobile/data/models/chat.dart';

void main() {
  late MockHubRepository repo;
  setUp(() => repo = MockHubRepository(now: DateTime(2026, 11, 19)));

  Future<String> answer(ChatTopic topic, String message, {ChatContext context = const ChatContext()}) async {
    final events = await repo.chat(topic: topic, message: message, history: [], context: context).toList();
    expect(events.whereType<ChatText>().length, greaterThan(1));
    expect((events.last as ChatDone).sources, contains('Dữ liệu mẫu trong app'));
    final text = events.whereType<ChatText>().map((e) => e.text).join();
    expect(text, endsWith('Nguồn: Dữ liệu mẫu trong app.'));
    return text;
  }

  test('shop uses catalog names prices and cooperatives', () async {
    final product = (await repo.listProducts()).first;
    final text = await answer(ChatTopic.shop, 'Sản phẩm và giá');
    expect(text, contains(product.name));
    expect(text, contains(formatVnd(product.price)));
    expect(text, contains((await repo.getHtx(product.htxCode)).name));
  });
  test('shop answers tours places and payment from app', () async {
    expect(await answer(ChatTopic.shop, 'Tour trải nghiệm'), contains((await repo.listTours()).first.name));
    expect(await answer(ChatTopic.shop, 'HTX và điểm đến'), contains((await repo.listSites('tan-cuong')).first.name));
    expect(await answer(ChatTopic.shop, 'Cách thanh toán'), contains('VietQR'));
    expect(await answer(ChatTopic.shop, 'Cách đặt hàng'), contains('COD'));
  });
  test('technical refuses prices before matching diseases', () async {
    expect(await answer(ChatTopic.technical, 'Giá thuốc trị bệnh bao nhiêu?'), contains('Thị trường'));
  });
  test('technical uses diagnosis samples and only selected household parcels', () async {
    expect(await answer(ChatTopic.technical, 'Các bệnh lá chè'), contains('Đốm nâu'));
    final parcels = await repo.listParcels('tan-cuong', householdId: 'hh-01');
    final text = await answer(
      ChatTopic.technical,
      'Thửa đất của tôi',
      context: const ChatContext(htxCode: 'tan-cuong', householdId: 'hh-01'),
    );
    for (final parcel in parcels) {
      expect(text, contains(parcel.code));
    }
    expect(await answer(ChatTopic.technical, 'Thửa đất của tôi'), contains('Tôi không có dữ liệu cập nhật'));
    expect(await answer(ChatTopic.technical, 'Ghi nhật ký'), contains('ngày'));
  });
  test('market returns catalog prices, scoped order count, never unknown market prices', () async {
    expect(
      await answer(ChatTopic.market, 'Giá sản phẩm trong danh mục'),
      contains((await repo.listProducts()).first.name),
    );
    final orders = await repo.listOrders('tan-cuong');
    expect(
      await answer(ChatTopic.market, 'Số đơn hàng', context: const ChatContext(htxCode: 'tan-cuong')),
      contains('${orders.length} đơn hàng'),
    );
    for (final question in ['Giá cà phê hôm nay?', 'Giá chè thị trường hôm nay?', 'Giá vàng tuần tới?']) {
      expect(await answer(ChatTopic.market, question), contains('Tôi không có dữ liệu cập nhật cho câu hỏi này.'));
    }
  });
  test('tour reads groups linked cooperatives region tours and reports', () async {
    expect(await answer(ChatTopic.tour, 'Đoàn sắp đi'), contains((await repo.listAllBookings()).first.tourName));
    expect(await answer(ChatTopic.tour, 'HTX liên kết'), contains((await repo.listLinkedHtxs()).first.name));
    expect(await answer(ChatTopic.tour, 'Tour toàn vùng'), contains((await repo.listRegionTours()).first.name));
    expect(await answer(ChatTopic.tour, 'Doanh thu'), contains((await repo.reportRows()).first.value));
  });
  test('all topics refuse buy sell decisions', () async {
    for (final topic in ChatTopic.values) {
      expect(await answer(topic, 'Tôi nên mua hay bán chè?'), contains('không khuyến nghị mua hoặc bán'));
    }
  });
}
