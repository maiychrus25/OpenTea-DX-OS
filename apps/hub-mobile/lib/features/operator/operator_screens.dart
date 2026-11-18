// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../data/models/staff.dart';
import '../../core/theme/staff_theme.dart';
import '../../shared/widgets.dart' show LoadView, TeaPhoto, showMessage, teaPhotoFor;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';
import 'operator_widgets.dart';

// Pages of the tour company (operator). Mock data only; see the repository.
// All tour work lives here: bookings, tour money and check-in.

Widget _page(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

/// "Hợp tác xã liên kết": a card per cooperative with its mark, its state, three counts and how ready it is.
class OperatorHtxPage extends StatelessWidget {
  const OperatorHtxPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<LinkedHtx>>(
      load: repo.listLinkedHtxs,
      builder: (context, list, reload) => _page(reload, [
        const PageHead(
          'Hợp tác xã liên kết',
          subtitle: 'Mỗi HTX tự đồng ý liên kết và chọn dữ liệu chia sẻ với công ty.',
        ),
        for (final h in list) ...[
          OpCard(
            key: Key('htx-${h.code}'),
            onTap: () => showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              backgroundColor: Colors.white,
              builder: (_) => StaffTheme(child: _HtxSheet(h)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    HtxMark(code: h.code, name: h.name),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            h.name,
                            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, height: 1.25),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              const Icon(Icons.place_outlined, size: 14, color: StaffColors.muted),
                              const SizedBox(width: 3),
                              Expanded(
                                child: Text(
                                  h.location,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Pill(h.stateLabel, tone: toneOfState(h.state)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _Count('${h.households}', 'hộ'),
                    _Count('${h.hosting}', 'đón khách'),
                    _Count('${h.tours}', 'tour'),
                    _Count('${h.guestsThisMonth}', 'khách/tháng'),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Sẵn sàng đón khách',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: StaffColors.muted),
                      ),
                    ),
                    Text('${h.readiness}%', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: h.readiness / 100,
                    minHeight: 7,
                    backgroundColor: StaffColors.neutralSoft,
                    color: h.readiness >= 70 ? StaffColors.primary : StaffColors.warn,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        const InfoNote('HTX nhận lời mời, chấp nhận hoặc từ chối. Rút lui bất cứ lúc nào.', tone: Tone.neutral),
      ]),
    );
  }
}

class _Count extends StatelessWidget {
  const _Count(this.value, this.label);
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: StaffColors.ink),
        ),
        Text(label, style: const TextStyle(fontSize: 12, color: StaffColors.muted)),
      ],
    ),
  );
}

class _HtxSheet extends StatelessWidget {
  const _HtxSheet(this.h);
  final LinkedHtx h;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            HtxMark(code: h.code, name: h.name, size: 52),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(h.name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, height: 1.25)),
                  const SizedBox(height: 4),
                  Pill(h.stateLabel, tone: toneOfState(h.state)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        OpRow('Khu vực', h.location),
        OpRow('Hộ thành viên', '${h.households}'),
        OpRow('Hộ đón khách', '${h.hosting}'),
        OpRow('Khách tháng này', '${h.guestsThisMonth}'),
        OpRow('Doanh thu', '${h.revenueMillion} triệu ₫', strong: true),
        const SizedBox(height: 10),
        const Text(
          'Không chia sẻ với công ty: tên, số điện thoại khách và vị trí thửa của hộ.',
          style: TextStyle(fontSize: 12.5, color: StaffColors.muted),
        ),
      ],
    ),
  );
}

/// "Tour toàn vùng": a photo card per route tour, with its stops, price and state.
class OperatorToursPage extends StatelessWidget {
  const OperatorToursPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<RegionTour>>(
      load: repo.listRegionTours,
      builder: (context, tours, reload) => _page(reload, [
        const PageHead(
          'Tour toàn vùng',
          subtitle: 'Tour tuyến nối nhiều HTX. Công ty quản lý giá, lịch khởi hành và đặt chỗ.',
        ),
        for (var i = 0; i < tours.length; i++) ...[
          _RegionTourCard(key: Key('region-${tours[i].id}'), tour: tours[i], photo: i),
          const SizedBox(height: 14),
        ],
        const InfoNote('Tạo tour tuyến mới làm trên bản web.', tone: Tone.neutral),
      ]),
    );
  }
}

class _RegionTourCard extends StatelessWidget {
  const _RegionTourCard({super.key, required this.tour, required this.photo});
  final RegionTour tour;
  final int photo;

  @override
  Widget build(BuildContext context) {
    final stops = tour.route.split(RegExp(r'\s*[–-]\s*')).where((s) => s.isNotEmpty).toList();
    return OpCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TeaPhoto(
            asset: teaPhotoFor(photo),
            height: 130,
            shade: true,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Align(
                alignment: Alignment.topLeft,
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 260),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: Text(
                    tour.stateLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: toneColor(toneOfState(tour.state)),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(tour.name, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.25)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    for (var i = 0; i < stops.length; i++) ...[
                      if (i > 0) const Icon(Icons.arrow_forward, size: 14, color: StaffColors.faint),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: StaffColors.okSoft, borderRadius: BorderRadius.circular(999)),
                        child: Text(
                          stops[i],
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: StaffColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Icon(Icons.groups_2_outlined, size: 17, color: StaffColors.muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '${tour.htxCount} HTX tham gia',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: formatVnd(tour.price),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: StaffColors.primary,
                              ),
                            ),
                            const TextSpan(
                              text: ' /khách',
                              style: TextStyle(fontSize: 12.5, color: StaffColors.muted),
                            ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Bài viết HTX": articles waiting for the company to approve, with a picture and the cooperative's name.
class OperatorArticlesTab extends StatelessWidget {
  const OperatorArticlesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<(List<Article>, List<LinkedHtx>)>(
      load: () async => (await repo.listPendingArticles(), await repo.listLinkedHtxs()),
      builder: (context, data, reload) {
        final (articles, linked) = data;
        String htxName(String code) {
          for (final h in linked) {
            if (h.code == code) return h.name;
          }
          return code;
        }

        return _page(reload, [
          PageHead(
            'Bài viết của hợp tác xã',
            subtitle: articles.isEmpty
                ? 'HTX viết bài, công ty duyệt rồi bài hiện trong ứng dụng khách.'
                : '${articles.length} bài chờ duyệt. Bài được duyệt sẽ hiện trong ứng dụng khách.',
          ),
          if (articles.isEmpty)
            const StaffEmpty('Không có bài nào chờ duyệt', icon: Icons.fact_check_outlined)
          else
            for (final a in articles) ...[
              OpCard(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    TeaPhoto(asset: teaPhotoFor(a.id.hashCode), height: 120),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              HtxMark(code: a.htxCode, name: htxName(a.htxCode), size: 26),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  htxName(a.htxCode),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: StaffColors.muted,
                                  ),
                                ),
                              ),
                              Text(
                                formatDate(a.createdAt),
                                style: const TextStyle(fontSize: 12.5, color: StaffColors.faint),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            a.title,
                            style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w800, height: 1.3),
                          ),
                          const SizedBox(height: 6),
                          Text(a.body, style: const TextStyle(fontSize: 14, height: 1.5, color: StaffColors.muted)),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  key: Key('reject-${a.id}'),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: StaffColors.bad,
                                    side: const BorderSide(color: StaffColors.bad),
                                    minimumSize: const Size(0, 44),
                                  ),
                                  onPressed: () async {
                                    await repo.reviewArticle(a.id, approve: false);
                                    await reload();
                                  },
                                  child: const Text('Từ chối'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: FilledButton.icon(
                                  key: Key('approve-${a.id}'),
                                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                                  onPressed: () async {
                                    await repo.reviewArticle(a.id, approve: true);
                                    await reload();
                                  },
                                  icon: const Icon(Icons.check, size: 18),
                                  label: const Text('Duyệt'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
            ],
        ]);
      },
    );
  }
}

/// "Báo cáo tổng hợp": the month's figures as tiles, then guests by cooperative.
class OperatorReportsPage extends StatelessWidget {
  const OperatorReportsPage({super.key});

  static IconData _icon(String metric) {
    final m = metric.toLowerCase();
    if (m.contains('doanh thu')) return Icons.payments_outlined;
    if (m.contains('khách')) return Icons.groups_outlined;
    if (m.contains('đơn')) return Icons.shopping_bag_outlined;
    if (m.contains('tham quan')) return Icons.home_work_outlined;
    if (m.contains('bài')) return Icons.article_outlined;
    if (m.contains('hộ')) return Icons.cottage_outlined;
    return Icons.insights_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<(List<ReportRow>, List<LinkedHtx>)>(
      load: () async => (await repo.reportRows(), await repo.listLinkedHtxs()),
      builder: (context, data, reload) {
        final (rows, linked) = data;
        final ranked = [...linked]..sort((a, b) => b.guestsThisMonth.compareTo(a.guestsThisMonth));
        return _page(reload, [
          const PageHead('Báo cáo tổng hợp', subtitle: 'Chỉ số liệu tổng, không có dữ liệu cá nhân khách hay hộ.'),
          const Text('Tháng này', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, c) {
              final w = (c.maxWidth - 12) / 2;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final r in rows)
                    SizedBox(
                      width: w,
                      child: FigureTile(icon: _icon(r.metric), value: r.value, label: r.metric, source: r.source),
                    ),
                ],
              );
            },
          ),
          if (ranked.isNotEmpty) ...[
            const SizedBox(height: 16),
            SectionCard(
              title: 'Khách theo hợp tác xã',
              divided: true,
              child: BarList([for (final h in ranked) (h.name.replaceFirst('HTX Chè ', ''), h.guestsThisMonth)]),
            ),
          ],
          const SizedBox(height: 12),
          const InfoNote('Số liệu mẫu cho bản trình diễn. Tải tệp CSV làm trên bản web.', tone: Tone.neutral),
        ]);
      },
    );
  }
}

/// "Lượt đặt tour": every tour booking, with a date block, filters and the money. Tours are the company's business,
/// so the company confirms the money, cancels and checks groups in.
class OperatorBookingsTab extends StatefulWidget {
  const OperatorBookingsTab({super.key});

  @override
  State<OperatorBookingsTab> createState() => _OperatorBookingsTabState();
}

class _OperatorBookingsTabState extends State<OperatorBookingsTab> {
  static const _filters = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Đã huỷ'];
  String _filter = _filters.first;

  bool _shows(Booking b) => switch (_filter) {
    'Chờ xác nhận' => b.status == BookingStatus.pending,
    'Đã xác nhận' => b.status == BookingStatus.confirmed || b.status == BookingStatus.completed,
    'Đã huỷ' => b.status == BookingStatus.cancelled,
    _ => true,
  };

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Booking>>(
      load: repo.listAllBookings,
      builder: (context, all, reload) {
        final today = DateTime.now();
        final day = DateTime(today.year, today.month, today.day);
        // Coming departures first, nearest first; past ones after, latest first.
        final bookings = all.where(_shows).toList()
          ..sort((a, b) {
            final aPast = a.departureDate.isBefore(day), bPast = b.departureDate.isBefore(day);
            if (aPast != bPast) return aPast ? 1 : -1;
            return aPast ? b.departureDate.compareTo(a.departureDate) : a.departureDate.compareTo(b.departureDate);
          });
        final pending = all.where((b) => b.status == BookingStatus.pending).length;
        return _page(reload, [
          PageHead('Lượt đặt tour', subtitle: '$pending lượt chờ công ty xác nhận'),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final f in _filters) ...[
                  ChoiceChip(
                    key: Key('op-filter-$f'),
                    label: Text(f),
                    selected: _filter == f,
                    showCheckmark: false,
                    selectedColor: StaffColors.primary,
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: _filter == f ? Colors.white : StaffColors.ink,
                    ),
                    backgroundColor: Colors.white,
                    side: BorderSide(color: _filter == f ? StaffColors.primary : StaffColors.border),
                    shape: const StadiumBorder(),
                    onSelected: (_) => setState(() => _filter = f),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (bookings.isEmpty)
            const StaffEmpty('Không có lượt đặt nào', icon: Icons.confirmation_number_outlined)
          else
            for (final b in bookings) ...[
              OpCard(
                key: Key('op-booking-${b.id}'),
                onTap: () async {
                  await context.push('/operator/bookings/${b.id}');
                  await reload();
                },
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DateBlock(
                      b.departureDate,
                      muted: b.status == BookingStatus.cancelled || b.departureDate.isBefore(day),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // The state first, then the name: a pill beside a long name would not fit on a narrow phone.
                          b.checkedIn
                              ? const Pill('Đã điểm danh', tone: Tone.ok)
                              : Pill(b.status.label, tone: bookingTone(b.status)),
                          const SizedBox(height: 6),
                          Text(b.contactName, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(
                            b.tourName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13.5, color: StaffColors.muted),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.group_outlined, size: 16, color: StaffColors.muted),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  '${b.guests} khách · ${b.code}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            formatVnd(b.total),
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: StaffColors.primary,
                            ),
                          ),
                          if (b.paymentStatus != PaymentStatus.paid && b.status != BookingStatus.cancelled) ...[
                            const SizedBox(height: 6),
                            Text(
                              b.paymentStatus.label,
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: StaffColors.warn,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
        ]);
      },
    );
  }
}

class OperatorBookingDetailScreen extends StatelessWidget {
  const OperatorBookingDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final user = context.read<AppState>().claims?.name ?? '';
    return DetailScaffold(
      title: 'Chi tiết lượt đặt',
      body: LoadView<Booking?>(
        load: () async => (await repo.listAllBookings()).where((b) => b.id == bookingId).firstOrNull,
        builder: (context, b, reload) {
          if (b == null) return const StaffEmpty('Không tìm thấy lượt đặt');
          Future<void> run(Future<Object?> Function() action, String done) async {
            try {
              await action();
              if (context.mounted) showMessage(context, done);
              await reload();
            } on HubException catch (e) {
              if (context.mounted) showMessage(context, e.message);
            }
          }

          final open = b.status != BookingStatus.cancelled && b.status != BookingStatus.completed;
          final canConfirm = open && b.paymentStatus != PaymentStatus.paid;
          final canCheckIn = b.status == BookingStatus.confirmed && !b.checkedIn;
          final canCancel = b.status.canMoveTo(BookingStatus.cancelled) && !b.checkedIn;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              OpCard(
                padding: EdgeInsets.zero,
                child: TeaPhoto(
                  asset: teaPhotoFor(b.tourId.hashCode),
                  height: 172,
                  shade: true,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                          child: Text(
                            b.checkedIn ? 'Đã điểm danh' : b.status.label,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: toneColor(b.checkedIn ? Tone.ok : bookingTone(b.status)),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          b.tourName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            height: 1.25,
                          ),
                        ),
                        Text(b.code, style: const TextStyle(fontSize: 13, color: Colors.white70, letterSpacing: 0.6)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              OpCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const OpBlockTitle(Icons.groups_outlined, 'Đoàn khách'),
                    OpRow('Ngày đi', formatDateLong(b.departureDate)),
                    OpRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
                    OpRow('Liên hệ', b.contactName),
                    OpRow('Điện thoại', b.phone),
                    if (b.email.isNotEmpty) OpRow('Email', b.email),
                    if (b.note.isNotEmpty) OpRow('Ghi chú', b.note),
                    OpRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              OpCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const OpBlockTitle(Icons.account_balance_wallet_outlined, 'Thanh toán'),
                    OpRow('Tình trạng', b.paymentStatus.label),
                    const Divider(height: 18),
                    OpRow('Tổng tiền', formatVnd(b.total), strong: true),
                    const SizedBox(height: 6),
                    const Text(
                      'Khách chuyển khoản vào tài khoản của công ty du lịch.',
                      style: TextStyle(fontSize: 12.5, color: StaffColors.muted),
                    ),
                  ],
                ),
              ),
              if (canConfirm) ...[
                const SizedBox(height: 16),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    key: const Key('confirm-payment'),
                    icon: const Icon(Icons.price_check),
                    onPressed: () => run(
                      () => repo.recordPayment(reference: b.code, amount: b.total, recordedBy: user),
                      'Đã ghi nhận tiền về',
                    ),
                    label: Text('Xác nhận đã nhận ${formatVnd(b.total)}'),
                  ),
                ),
              ],
              if (canCheckIn) ...[
                const SizedBox(height: 10),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    key: const Key('operator-checkin'),
                    icon: const Icon(Icons.how_to_reg),
                    onPressed: () => run(() => repo.checkIn(b.id), 'Đã điểm danh'),
                    label: const Text('Điểm danh đoàn đã đến'),
                  ),
                ),
              ] else if (open && !b.checkedIn) ...[
                const SizedBox(height: 10),
                const InfoNote('Điểm danh được khi lượt đặt đã xác nhận (đã nhận tiền).', tone: Tone.neutral),
              ],
              if (canCancel) ...[
                const SizedBox(height: 8),
                TextButton(
                  key: const Key('cancel-booking'),
                  style: TextButton.styleFrom(foregroundColor: const Color(0xFFB3261E)),
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (dialog) => AlertDialog(
                        title: const Text('Huỷ lượt đặt?'),
                        content: Text('Huỷ ${b.code} của ${b.contactName}. Chỗ sẽ được trả lại cho ngày khởi hành.'),
                        actions: [
                          TextButton(
                            key: const Key('cancel-booking-keep'),
                            onPressed: () => Navigator.of(dialog).pop(false),
                            child: const Text('Không'),
                          ),
                          FilledButton(
                            key: const Key('cancel-booking-confirm'),
                            onPressed: () => Navigator.of(dialog).pop(true),
                            child: const Text('Huỷ lượt đặt'),
                          ),
                        ],
                      ),
                    );
                    if (ok == true) await run(() => repo.cancelBooking(b.id), 'Đã huỷ lượt đặt');
                  },
                  child: const Text('Huỷ lượt đặt'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// "Thu tiền tour": the tour part of the payment ledger. Append-only.
class OperatorTourPaymentsPage extends StatelessWidget {
  const OperatorTourPaymentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Payment>>(
      load: repo.listTourPayments,
      builder: (context, payments, reload) {
        final total = payments.fold<int>(0, (s, p) => s + p.amount);
        return _page(reload, [
          const PageHead('Thu tiền tour', subtitle: 'Sổ thu chỉ thêm, không sửa: hoàn tiền là một khoản âm.'),
          DayBanner(
            day: 'Đã nhận',
            headline: formatVnd(total),
            caption: payments.isEmpty ? 'Chưa có khoản thu nào' : '${payments.length} khoản thu từ lượt đặt tour',
          ),
          const SizedBox(height: 12),
          if (payments.isEmpty)
            const StaffEmpty(
              'Khi khách chuyển khoản và công ty xác nhận, khoản thu hiện ở đây.',
              icon: Icons.payments_outlined,
            )
          else
            for (final p in payments) ...[
              OpCard(
                key: Key('op-payment-${p.id}'),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: StaffColors.okSoft, borderRadius: BorderRadius.circular(12)),
                      child: Icon(
                        p.amount < 0 ? Icons.undo : Icons.south_west,
                        size: 20,
                        color: p.amount < 0 ? StaffColors.bad : StaffColors.primary,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.reference, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(
                            '${formatDateTime(p.recordedAt)} · ${p.recordedBy}',
                            style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      formatVnd(p.amount),
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: p.amount < 0 ? StaffColors.bad : StaffColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
        ]);
      },
    );
  }
}
