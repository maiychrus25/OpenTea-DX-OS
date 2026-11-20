// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../core/format/formatting.dart';
import '../core/money/money.dart';
import 'hub_repository.dart';
import 'models/booking.dart';
import 'models/chat.dart';
import 'models/diagnosis.dart';

/// Deterministic keyword lookup over the same sample repository as the pages.
/// Never calls an LLM or fabricates live market data.
class LocalChatAnswerer {
  LocalChatAnswerer(this.repository, {DateTime? now, this.chunkDelay = Duration.zero}) : now = now ?? DateTime.now();
  final HubRepository repository;
  final DateTime now;
  final Duration chunkDelay;
  static const noData = 'Tôi không có dữ liệu cập nhật cho câu hỏi này.';
  static const source = 'Dữ liệu mẫu trong app';

  Stream<ChatEvent> chat({
    required ChatTopic topic,
    required String message,
    ChatContext context = const ChatContext(),
  }) async* {
    final text = '${await _answer(topic, stripDiacritics(message.toLowerCase()), context)}\n\nNguồn: $source.';
    final words = RegExp(r'\S+\s*').allMatches(text).map((m) => m.group(0)!).toList();
    for (var i = 0; i < words.length; i += 8) {
      if (chunkDelay > Duration.zero) await Future<void>.delayed(chunkDelay);
      yield ChatText(words.skip(i).take(8).join());
    }
    yield const ChatDone(sources: [source], model: 'local-data');
  }

  Future<String> _answer(ChatTopic topic, String q, ChatContext context) async {
    bool has(List<String> terms) => terms.any(q.contains);
    if (has(['nen mua', 'nen ban', 'mua hay ban', 'quyet dinh', 'khuyen nghi', 'co nen'])) {
      return 'Trợ lý chỉ cung cấp thông tin, không khuyến nghị mua hoặc bán và không quyết định thay bạn.';
    }
    if (topic == ChatTopic.technical) {
      if (has(['gia', 'bao nhieu tien', 'chi phi', 'mua', 'ban', 'thi truong'])) {
        return 'Chủ đề Kỹ thuật không trả lời giá cả. Hãy chuyển sang Thị trường nếu vai của bạn có chủ đề này.';
      }
      if (has(['benh', 'la che', 'chan doan'])) {
        return 'Các kết quả minh hoạ trong chức năng chẩn đoán:\n${sampleDiseases.map((d) => '• ${d.$1}').join('\n')}\n'
            'Đây không phải chẩn đoán cây của bạn hay hướng dẫn dùng thuốc. Cần cán bộ kỹ thuật xác nhận.';
      }
      if (has(['thua', 'lich', 'thu hai', 'thu hoach'])) {
        if (context.htxCode == null || context.householdId == null) return noData;
        final parcels = await repository.listParcels(context.htxCode!, householdId: context.householdId);
        if (parcels.isEmpty) return noData;
        return 'Thửa đất của hộ trong dữ liệu mẫu:\n${parcels.map((p) {
          final date = p.estimatedHarvestDate;
          final schedule = date == null ? 'chưa có ngày thu hái' : 'dự kiến ${date.day}/${date.month}/${date.year}';
          return '• ${p.code}: ${p.cropType}, ${p.areaHa} ha, $schedule';
        }).join('\n')}\nNgày dự kiến không phải xác nhận đủ điều kiện thu hoạch.';
      }
      if (has(['nhat ky', 'ghi chep'])) {
        return 'Trong Nhật ký đồng ruộng, chọn thửa đất, ngày thực hiện và hoạt động; ghi lại quan sát thực tế. '
            'Theo dõi trạng thái duyệt trong app. Trợ lý không tự xác nhận nhật ký hay thời gian cách ly.';
      }
      return noData;
    }
    if (topic == ChatTopic.market) {
      // Only explicit catalog queries are priced; "giá chè hôm nay" is NOT a catalog price.
      if (has(['hom nay', 'thi truong', 'du bao', 'tuan toi', 'the gioi'])) return noData;
      if (has(['don hang'])) {
        if (context.htxCode == null) return noData;
        return 'HTX có ${(await repository.listOrders(context.htxCode!)).length} đơn hàng trong dữ liệu mẫu hiện có.';
      }
      if (has(['san pham', 'danh muc', 'gian hang'])) return _products();
      return noData;
    }
    if (topic == ChatTopic.tour) {
      if (has(['doanh thu', 'bao cao'])) {
        final rows = await repository.reportRows();
        return 'Báo cáo mẫu, không phải doanh thu thời gian thực:\n${rows.map((r) => '• ${r.metric}: ${r.value} (${r.source})').join('\n')}';
      }
      if (has(['htx', 'hop tac xa', 'lien ket'])) {
        final htxs = await repository.listLinkedHtxs();
        return 'HTX liên kết trong dữ liệu mẫu:\n${htxs.map((h) => '• ${h.name} — ${h.location}, ${h.tours} tour').join('\n')}';
      }
      if (has(['doan', 'dat', 'sap di'])) {
        final today = DateTime(now.year, now.month, now.day);
        final bookings =
            (await repository.listAllBookings())
                .where(
                  (b) =>
                      !b.departureDate.isBefore(today) &&
                      (b.status == BookingStatus.pending || b.status == BookingStatus.confirmed),
                )
                .toList()
              ..sort((a, b) => a.departureDate.compareTo(b.departureDate));
        if (bookings.isEmpty) return 'Chưa có đoàn sắp đi trong dữ liệu mẫu.';
        return 'Các đoàn sắp đi trong dữ liệu mẫu:\n${bookings.map((b) => '• ${b.tourName}: ${b.guests} khách, ${b.departureDate.day}/${b.departureDate.month}/${b.departureDate.year}, ${b.status.label}').join('\n')}';
      }
      if (has(['tour', 'vung', 'tuyen'])) {
        final tours = await repository.listRegionTours();
        return 'Tour toàn vùng (giá mẫu):\n${tours.map((t) => '• ${t.name} — ${t.route}: ${formatVnd(t.price)}').join('\n')}';
      }
      return noData;
    }
    if (has(['thanh toan', 'dat hang', 'vietqr', 'cod'])) {
      return 'Chọn sản phẩm vào giỏ, đăng nhập rồi thanh toán. Đơn sản phẩm hỗ trợ VietQR hoặc COD (trả khi nhận hàng). '
          'Tiền hàng về HTX; tiền tour qua VietQR về công ty du lịch. '
          'Sau khi chuyển khoản, bấm “Tôi đã chuyển khoản”: vé tour được xác nhận ngay, đơn hàng chờ HTX xác nhận. '
          'Tài khoản ngân hàng demo không dùng để chuyển tiền thật.';
    }
    if (has(['tour', 'trai nghiem'])) {
      final tours = await repository.listTours();
      return 'Tour trong app (giá mẫu / người lớn):\n${tours.map((t) => '• ${t.name} — ${t.durationLabel}: ${formatVnd(t.adultPrice)}').join('\n')}';
    }
    if (has(['htx', 'hop tac xa', 'diem den', 'dia diem'])) {
      final lines = <String>[];
      for (final h in await repository.listHtxs()) {
        final sites = await repository.listSites(h.code);
        lines.add('• ${h.name} — ${h.province}: ${sites.map((s) => s.name).join(', ')}');
      }
      return 'HTX và điểm đến trong app:\n${lines.join('\n')}';
    }
    if (has(['san pham', 'gia', 'che', 'tra'])) return _products();
    return noData;
  }

  Future<String> _products() async {
    final htxs = {for (final h in await repository.listHtxs()) h.code: h.name};
    final products = await repository.listProducts();
    return 'Giá danh mục mẫu trong app, không phải giá thị trường cập nhật:\n${products.map((p) => '• ${p.name}: ${formatVnd(p.price)}/${p.unit} — ${htxs[p.htxCode] ?? p.htxCode}').join('\n')}';
  }
}
