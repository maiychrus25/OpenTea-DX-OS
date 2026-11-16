// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/staff.dart';
import '../../shared/widgets.dart' show LoadView;
import 'farmer_pages.dart' show withdrawalDaysLeft;
import 'staff_format.dart';
import 'staff_widgets.dart';

Widget _scroll(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

Widget _hero(BuildContext context, String name, {Widget? eyebrow, String? subtitle}) {
  final now = DateTime.now();
  return PageHead(
    '${greeting(now)}, $name',
    eyebrow: eyebrow,
    subtitle: subtitle ?? '${_weekday(now)}, ${formatDate(now)}',
  );
}

String _weekday(DateTime d) =>
    const ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][d.weekday - 1];

/// Small summary of the storefront work (orders, bookings, money).
class _ShopSummary extends StatelessWidget {
  const _ShopSummary({required this.summary, required this.base});
  final HtxSummary summary;
  final String base;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Gian hàng',
    child: Column(
      children: [
        _line(context, Icons.receipt_long_outlined, 'Đơn chờ xác nhận', '${summary.pendingOrders}', '$base/orders'),
        _line(
          context,
          Icons.hourglass_bottom,
          'Lượt đặt tour chờ xác nhận',
          '${summary.pendingBookings}',
          '$base/bookings',
        ),
        _line(
          context,
          Icons.event_available,
          'Lượt đặt tour đã xác nhận',
          '${summary.confirmedBookings}',
          '$base/bookings',
        ),
        _line(context, Icons.payments_outlined, 'Đã thu', formatVnd(summary.revenue), '$base/payments'),
      ],
    ),
  );

  Widget _line(BuildContext context, IconData icon, String label, String value, String path) => InkWell(
    onTap: () => context.go(path),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          Icon(icon, size: 20, color: StaffColors.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    ),
  );
}

class _JournalPreview extends StatelessWidget {
  const _JournalPreview({required this.entries, required this.seeAllPath});
  final List<JournalEntry> entries;
  final String seeAllPath;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Nhật ký gần đây',
    onSeeAll: () => context.go(seeAllPath),
    child: entries.isEmpty
        ? const StaffEmpty('Chưa có nhật ký nào')
        : Column(
            children: [
              for (final e in entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${e.parcelCode} · ${e.activityType.label}',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                            ),
                            Text(
                              '${e.cropType} · ${formatDate(e.entryDate)}',
                              style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                            ),
                          ],
                        ),
                      ),
                      Pill(e.status.label, tone: journalTone(e.status)),
                    ],
                  ),
                ),
            ],
          ),
  );
}

// ---------------------------------------------------------------------------
// Manager (trưởng HTX)
// ---------------------------------------------------------------------------

class ManagerDashboard extends StatelessWidget {
  const ManagerDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<_ManagerData>(
      load: () async => _ManagerData(
        members: await scope.repo.listMembers(scope.htx),
        parcels: await scope.repo.listParcels(scope.htx),
        journal: await scope.repo.listJournal(scope.htx),
        lots: await scope.repo.listLots(scope.htx),
        notes: await scope.repo.listNotifications(scope.htx),
        // Storefront and market numbers are sample data; with the real core they are left out.
        prices: scope.coreIsSample ? await scope.repo.listMarketPrices() : null,
        summary: scope.coreIsSample ? await scope.repo.summary(scope.htx) : null,
      ),
      builder: (context, d, reload) {
        final active = d.parcels.where((p) => p.status.isActive).toList();
        final area = d.parcels.fold<double>(0, (s, p) => s + p.areaHa);
        final yieldKg = active.fold<double>(0, (s, p) => s + p.expectedKg);
        final upcoming = [
          for (final p in d.parcels)
            if (p.estimatedHarvestDate != null &&
                p.status != ParcelStatus.harvested &&
                daysUntil(p.estimatedHarvestDate!, now) >= 0)
              p,
        ]..sort((a, b) => a.estimatedHarvestDate!.compareTo(b.estimatedHarvestDate!));
        final pending = d.journal.where((e) => e.status == JournalStatus.pendingApproval).toList();
        final readyLots = d.lots.where((l) => l.status == LotStatus.ready).length;
        final unread = d.notes.where((n) => !n.isRead).length;
        final weekHarvest = upcoming.where((p) => daysUntil(p.estimatedHarvestDate!, now) <= 7).length;
        return _scroll(reload, [
          _hero(context, scope.userName, eyebrow: const Pill('Đang hoạt động', tone: Tone.ok)),
          MetricGrid([
            MetricCard(
              label: 'Thành viên',
              value: '${d.members.length}',
              icon: Icons.groups_outlined,
              onTap: () => context.go('/manager/members'),
            ),
            MetricCard(
              label: 'Vùng canh tác',
              value: fmtHa(area),
              icon: Icons.eco_outlined,
              onTap: () => context.go('/manager/zones'),
            ),
            MetricCard(
              label: 'Thu hái trong 7 ngày',
              value: '$weekHarvest thửa',
              icon: Icons.calendar_month_outlined,
              tone: Tone.warn,
              onTap: () => context.go('/manager/schedule'),
            ),
            MetricCard(
              label: 'Nhật ký chờ duyệt',
              value: '${pending.length}',
              icon: Icons.fact_check_outlined,
              tone: Tone.warn,
              onTap: () => context.go('/manager/journal-approve'),
            ),
            MetricCard(
              label: 'Lô sẵn sàng',
              value: '$readyLots',
              icon: Icons.inventory_2_outlined,
              onTap: () => context.go('/manager/lots'),
            ),
            MetricCard(
              label: 'Thông báo chưa đọc',
              value: '$unread',
              icon: Icons.notifications_none,
              tone: Tone.neutral,
              onTap: () => context.go('/manager/notifications'),
            ),
          ]),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Sản lượng kỳ vọng',
            child: Row(
              children: [
                const Icon(Icons.scale_outlined, color: StaffColors.primary),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '${fmtTon(yieldKg)} từ ${active.length} thửa đang canh tác',
                    style: const TextStyle(fontSize: 14.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Nhật ký chờ duyệt',
            onSeeAll: () => context.go('/manager/journal-approve'),
            child: pending.isEmpty
                ? const StaffEmpty('Không có nhật ký nào chờ duyệt')
                : Column(
                    children: [
                      for (final e in pending.take(3))
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${e.parcelCode} · ${e.activityType.label}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                                    ),
                                    Text(
                                      '${e.performedBy} · ${formatDate(e.entryDate)}',
                                      style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                                    ),
                                  ],
                                ),
                              ),
                              const Pill('Chờ duyệt', tone: Tone.warn),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Lịch thu hái sắp tới',
            onSeeAll: () => context.go('/manager/schedule'),
            child: upcoming.isEmpty
                ? const StaffEmpty('Chưa có lịch thu hái')
                : Column(
                    children: [
                      for (final p in upcoming.take(3))
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${p.code} · ${p.cropType}',
                                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                                    ),
                                    Text(
                                      'Hộ ${p.householdName} · ${fmtTon(p.expectedKg)}',
                                      style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatDate(p.estimatedHarvestDate!).substring(0, 5),
                                style: const TextStyle(fontWeight: FontWeight.w800, color: StaffColors.primary),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 14),
          if (d.summary != null) ...[_ShopSummary(summary: d.summary!, base: '/manager'), const SizedBox(height: 14)],
          if (d.prices != null) _MarketCard(prices: d.prices!),
        ]);
      },
    );
  }
}

class _ManagerData {
  _ManagerData({
    required this.members,
    required this.parcels,
    required this.journal,
    required this.lots,
    required this.notes,
    required this.prices,
    required this.summary,
  });
  final List<Member> members;
  final List<Parcel> parcels;
  final List<JournalEntry> journal;
  final List<Lot> lots;
  final List<AppNotification> notes;
  final List<MarketPrice>? prices;
  final HtxSummary? summary;
}

class _MarketCard extends StatelessWidget {
  const _MarketCard({required this.prices});
  final List<MarketPrice> prices;
  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Chỉ số giá nông sản',
    onSeeAll: () => context.go('/manager/bulletin'),
    seeAllLabel: 'Bản tin',
    child: Column(
      children: [
        for (final m in prices)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(m.commodity, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(m.metric, style: const TextStyle(fontSize: 12.5, color: StaffColors.muted)),
                    ],
                  ),
                ),
                Pill(m.level, tone: m.index >= 110 ? Tone.warn : (m.index >= 100 ? Tone.ok : Tone.neutral)),
              ],
            ),
          ),
        const Align(
          alignment: Alignment.centerLeft,
          child: Text('Nguồn mô phỏng: số liệu mẫu', style: TextStyle(fontSize: 11.5, color: StaffColors.faint)),
        ),
      ],
    ),
  );
}

// ---------------------------------------------------------------------------
// Officer (cán bộ, read-only)
// ---------------------------------------------------------------------------

class OfficerDashboard extends StatelessWidget {
  const OfficerDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<(List<Member>, List<Parcel>, List<JournalEntry>, List<Lot>, HtxSummary?)>(
      load: () async => (
        await scope.repo.listMembers(scope.htx),
        await scope.repo.listParcels(scope.htx),
        await scope.repo.listJournal(scope.htx),
        await scope.repo.listLots(scope.htx),
        scope.coreIsSample ? await scope.repo.summary(scope.htx) : null,
      ),
      builder: (context, d, reload) {
        final pending = d.$3.where((e) => e.status == JournalStatus.pendingApproval).length;
        final active = d.$2.where((p) => p.status.isActive).length;
        final ready = d.$4.where((l) => l.status == LotStatus.ready).length;
        final households = d.$1.where((m) => m.role == MemberRole.farmer).length;
        return _scroll(reload, [
          _hero(
            context,
            scope.userName,
            eyebrow: pending > 0 ? Pill('$pending nhật ký chờ duyệt', tone: Tone.warn) : null,
          ),
          MetricGrid([
            MetricCard(
              label: 'Chờ duyệt',
              value: '$pending',
              icon: Icons.error_outline,
              tone: Tone.warn,
              onTap: () => context.go('/manager/journal'),
            ),
            MetricCard(
              label: 'Thửa đất đang canh tác',
              value: '$active',
              icon: Icons.map_outlined,
              onTap: () => context.go('/manager/zones'),
            ),
            MetricCard(
              label: 'Lô sẵn sàng',
              value: '$ready',
              icon: Icons.inventory_2_outlined,
              tone: Tone.neutral,
              onTap: () => context.go('/manager/lots'),
            ),
            MetricCard(
              label: 'Nông hộ quản lý',
              value: '$households',
              icon: Icons.groups_outlined,
              onTap: () => context.go('/manager/households'),
            ),
          ]),
          const SizedBox(height: 14),
          _JournalPreview(entries: d.$3.take(6).toList(), seeAllPath: '/manager/journal'),
          const SizedBox(height: 14),
          if (d.$5 != null) ...[_ShopSummary(summary: d.$5!, base: '/manager'), const SizedBox(height: 12)],
          const InfoNote('Tài khoản cán bộ chỉ xem, không có nút duyệt hay chỉnh sửa.'),
        ]);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Farmer
// ---------------------------------------------------------------------------

class FarmerDashboard extends StatelessWidget {
  const FarmerDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<_FarmerData>(
      load: () async => _FarmerData(
        parcels: await scope.repo.listParcels(scope.htx, householdId: scope.household),
        journal: await scope.repo.listJournal(scope.htx, householdId: scope.household),
        weather: scope.coreIsSample ? await scope.repo.currentWeather(scope.htx) : null,
        visits: scope.coreIsSample ? await scope.repo.listHouseholdVisits(scope.household ?? '') : null,
      ),
      builder: (context, d, reload) {
        final upcoming = [
          for (final p in d.parcels)
            if (p.estimatedHarvestDate != null &&
                p.status != ParcelStatus.harvested &&
                daysUntil(p.estimatedHarvestDate!, now) >= 0)
              p,
        ]..sort((a, b) => a.estimatedHarvestDate!.compareTo(b.estimatedHarvestDate!));
        final todayTasks =
            d.journal.where((e) => e.status == JournalStatus.rejected).length +
            upcoming.where((p) => daysUntil(p.estimatedHarvestDate!, now) <= 2).length;
        final pendingJournal = d.journal.where((e) => e.status == JournalStatus.pendingApproval).length;
        final nextHarvest = upcoming.isEmpty ? '—' : formatDate(upcoming.first.estimatedHarvestDate!).substring(0, 5);
        final withdrawals = [
          for (final p in d.parcels)
            if (withdrawalDaysLeft(p.id, d.journal, now) > 0) (p.code, withdrawalDaysLeft(p.id, d.journal, now)),
        ];
        final visits = [
          for (final v in d.visits ?? const <Booking>[])
            if (!v.departureDate.isBefore(dayOf(now))) v,
        ];
        return _scroll(reload, [
          PageHead('${greeting(now)}, ${scope.userName}', subtitle: 'Chúc bạn một ngày làm việc hiệu quả!'),
          Row(
            children: [
              if (scope.coreWritable) ...[
                Expanded(
                  child: FilledButton(
                    key: const Key('farmer-new-journal'),
                    onPressed: () => context.push('/farmer/journal/new'),
                    child: const Text('Ghi nhật ký mới', textAlign: TextAlign.center, style: TextStyle(fontSize: 14)),
                  ),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: OutlinedButton(
                  onPressed: () => context.go('/farmer/journal'),
                  child: const Text('Xem lịch sử', style: TextStyle(fontSize: 14)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          MetricGrid([
            MetricCard(
              label: 'Thửa đất của tôi',
              value: '${d.parcels.length}',
              icon: Icons.eco_outlined,
              onTap: () => context.go('/farmer/parcels'),
            ),
            MetricCard(
              label: 'Việc hôm nay',
              value: '$todayTasks',
              icon: Icons.checklist,
              tone: Tone.warn,
              onTap: () => context.go('/farmer/schedule'),
            ),
            MetricCard(
              label: 'Thu hái tới',
              value: nextHarvest,
              icon: Icons.calendar_month_outlined,
              onTap: () => context.go('/farmer/schedule'),
            ),
            MetricCard(
              label: 'Nhật ký chờ duyệt',
              value: '$pendingJournal',
              icon: Icons.hourglass_bottom,
              tone: Tone.neutral,
              onTap: () => context.go('/farmer/journal'),
            ),
          ]),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Tình trạng thửa đất',
            onSeeAll: () => context.go('/farmer/parcels'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (withdrawals.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        for (final w in withdrawals) Pill('Thửa ${w.$1} còn ${w.$2} ngày cách ly', tone: Tone.warn),
                      ],
                    ),
                  ),
                if (d.parcels.isEmpty)
                  const StaffEmpty('Bạn chưa có thửa đất nào được phân công.')
                else
                  for (final p in d.parcels)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p.code, style: const TextStyle(fontWeight: FontWeight.w700)),
                                Text(
                                  '${p.cropType} • ${fmtHa(p.areaHa)}',
                                  style: const TextStyle(fontSize: 12.5, color: StaffColors.muted),
                                ),
                              ],
                            ),
                          ),
                          Pill(p.status.label, tone: parcelTone(p.status)),
                        ],
                      ),
                    ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (d.weather case final w?) ...[
            SectionCard(
              title: 'Thời tiết hiện tại',
              child: Row(
                children: [
                  const Icon(Icons.cloud_outlined, size: 44, color: StaffColors.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${fmtNum(w.temperatureC, digits: 0)}°C',
                          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
                        ),
                        Text(w.condition, style: const TextStyle(color: StaffColors.muted)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Độ ẩm ${w.humidityPct}%', style: const TextStyle(fontSize: 13.5)),
                      const SizedBox(height: 2),
                      Text('Mưa ${fmtNum(w.precipitationMm)} mm', style: const TextStyle(fontSize: 13.5)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (d.visits != null)
            SectionCard(
              title: 'Lịch tham quan',
              onSeeAll: () => context.go('/farmer/visits'),
              padded: false,
              child: visits.isEmpty
                  ? const StaffEmpty('Chưa có đoàn khách nào')
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      child: Stack10([
                        for (final v in visits.take(3))
                          RowCard(
                            key: Key('visit-${v.id}'),
                            title: v.tourName,
                            subtitle: '${formatDateLong(v.departureDate)}\n${v.contactName} · ${v.guests} khách',
                            trailing: v.checkedIn
                                ? const Pill('Đã điểm danh', tone: Tone.ok)
                                : Pill(v.status.label, tone: bookingTone(v.status)),
                            onTap: () => context.push('/farmer/visits/${v.id}'),
                          ),
                      ]),
                    ),
            ),
        ]);
      },
    );
  }
}

class _FarmerData {
  _FarmerData({required this.parcels, required this.journal, required this.weather, required this.visits});
  final List<Parcel> parcels;
  final List<JournalEntry> journal;
  final WeatherNow? weather;
  final List<Booking>? visits;
}

// ---------------------------------------------------------------------------
// Operator (công ty du lịch)
// ---------------------------------------------------------------------------

class OperatorDashboard extends StatelessWidget {
  const OperatorDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<(List<LinkedHtx>, List<Booking>, List<Article>, List<RegionTour>)>(
      load: () async => (
        await scope.repo.listLinkedHtxs(),
        await scope.repo.listAllBookings(),
        await scope.repo.listPendingArticles(),
        await scope.repo.listRegionTours(),
      ),
      builder: (context, d, reload) {
        final linked = d.$1;
        final revenue = linked.fold<int>(0, (s, h) => s + h.revenueMillion);
        final needSupport = linked.where((h) => h.state == 'warn').toList();
        final pendingBookings = d.$2.where((b) => b.status == BookingStatus.pending).length;
        return _scroll(reload, [
          PageHead(
            'Tổng quan toàn vùng',
            subtitle: 'Số liệu gộp của các HTX liên kết, không có dữ liệu cá nhân khách hay hộ.',
          ),
          MetricGrid([
            MetricCard(
              label: 'HTX liên kết',
              value: '${linked.length}',
              icon: Icons.account_balance_outlined,
              onTap: () => context.go('/operator/htx'),
            ),
            MetricCard(
              label: 'Lượt đặt tour',
              value: '${d.$2.length}',
              icon: Icons.confirmation_number_outlined,
              tone: Tone.neutral,
              onTap: () => context.go('/operator/bookings'),
            ),
            MetricCard(
              label: 'Bài chờ duyệt',
              value: '${d.$3.length}',
              icon: Icons.fact_check_outlined,
              tone: Tone.warn,
              onTap: () => context.go('/operator/articles'),
            ),
            MetricCard(label: 'Doanh thu tháng', value: '$revenue tr ₫', icon: Icons.payments_outlined),
          ]),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Cần xử lý hôm nay',
            child: Column(
              children: [
                _todo(
                  Tone.bad,
                  needSupport.isEmpty
                      ? 'Không có HTX cần hỗ trợ'
                      : '${needSupport.length} HTX cần hỗ trợ: ${needSupport.map((h) => h.name.replaceFirst('HTX Chè ', '')).join(', ')}',
                ),
                _todo(Tone.warn, '$pendingBookings lượt đặt tour đang chờ HTX xác nhận'),
                _todo(Tone.warn, '${d.$3.length} bài viết chờ duyệt'),
                _todo(Tone.ok, 'Báo cáo tháng trước đã xuất'),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Khách theo hợp tác xã',
            onSeeAll: () => context.go('/operator/htx'),
            child: BarList([
              for (final h in linked.where((h) => h.guestsThisMonth > 0).take(4))
                (h.name.replaceFirst('HTX Chè ', ''), h.guestsThisMonth),
            ]),
          ),
          const SizedBox(height: 14),
          SectionCard(
            title: 'Tour toàn vùng',
            onSeeAll: () => context.go('/operator/tours'),
            child: Column(
              children: [
                for (final t in d.$4)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        ),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 140),
                          child: Pill(t.stateLabel, tone: toneOfState(t.state)),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Align(
            alignment: Alignment.centerLeft,
            child: Text('Số liệu mẫu cho bản trình diễn.', style: TextStyle(fontSize: 11.5, color: StaffColors.faint)),
          ),
        ]);
      },
    );
  }

  Widget _todo(Tone tone, String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 10,
          height: 10,
          margin: const EdgeInsets.only(top: 5, right: 10),
          decoration: BoxDecoration(color: toneColor(tone), shape: BoxShape.circle),
        ),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 14, height: 1.35))),
      ],
    ),
  );
}
