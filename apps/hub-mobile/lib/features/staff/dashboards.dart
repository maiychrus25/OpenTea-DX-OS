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

Widget _scroll(Future<void> Function() reload, List<Widget> children) => LayoutBuilder(
  builder: (context, constraints) => RefreshIndicator(
    onRefresh: reload,
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        constraints.maxWidth > 1032 ? (constraints.maxWidth - 1000) / 2 : 16,
        16,
        constraints.maxWidth > 1032 ? (constraints.maxWidth - 1000) / 2 : 16,
        28,
      ),
      children: children,
    ),
  ),
);

Widget _hero(StaffScope scope, String role) {
  final now = DateTime.now();
  return PageHead(
    '${greeting(now)}, ${scope.userName}',
    compact: true,
    subtitle: '${_weekday(now)}, ${formatDate(now)} · $role${scope.htx.isEmpty ? '' : ' · ${scope.htx}'}',
  );
}

String _weekday(DateTime d) =>
    const ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][d.weekday - 1];

MetricCard _figure(BuildContext context, String label, String value, String? path) => MetricCard(
  label: label,
  value: value,
  icon: Icons.circle_outlined,
  onTap: path == null ? null : () => context.go(path),
);

({String label, int count, VoidCallback onTap}) _attention(
  BuildContext context,
  String label,
  int count,
  String path,
) => (label: label, count: count, onTap: () => context.go(path));

/// Related sections share a row on desktop, without stretching cards to a fixed height.
Widget _pair(Widget first, Widget second) => LayoutBuilder(
  builder: (context, c) {
    if (c.maxWidth < 760) {
      return Column(children: [first, const SizedBox(height: 12), second]);
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: first),
        const SizedBox(width: 12),
        Expanded(child: second),
      ],
    );
  },
);

List<Parcel> _upcoming(List<Parcel> parcels, DateTime now) => [
  for (final p in parcels)
    if (p.status.isActive && p.estimatedHarvestDate != null && daysUntil(p.estimatedHarvestDate!, now) >= 0) p,
]..sort((a, b) => a.estimatedHarvestDate!.compareTo(b.estimatedHarvestDate!));

// Seven calendar days, including today, matches the seven cells of the strip.
int _weekCount(List<Parcel> parcels, DateTime now) =>
    parcels.where((p) => daysUntil(p.estimatedHarvestDate!, now) < 7).length;

class _HarvestCard extends StatelessWidget {
  const _HarvestCard({required this.parcels, required this.now, required this.path});
  final List<Parcel> parcels;
  final DateTime now;
  final String path;

  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Lịch thu hái sắp tới',
    divided: true,
    padded: false,
    onSeeAll: () => context.go(path),
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: HarvestWeekStrip(now: now, dates: parcels.map((p) => p.estimatedHarvestDate!).toList()),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              '7 ngày tới · Chấm xanh: có lịch thu hái',
              style: TextStyle(fontSize: 12, color: StaffColors.muted),
            ),
          ),
        ),
        if (parcels.isEmpty)
          const StaffListRow(title: 'Chưa có lịch thu hái', subtitle: 'Lịch mới sẽ hiển thị tại đây.')
        else
          for (final p in parcels.take(3)) ...[
            const Divider(height: 1, indent: 16, endIndent: 16),
            StaffListRow(
              title: '${p.code} · ${p.cropType}',
              subtitle: '${fmtTon(p.expectedKg)} · ${_harvestDistance(p, now)}',
              trailing: Text(
                formatDate(p.estimatedHarvestDate!).substring(0, 5),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              onTap: () => context.go(path),
            ),
          ],
      ],
    ),
  );
}

String _harvestDistance(Parcel p, DateTime now) {
  if (!p.status.isActive || p.estimatedHarvestDate == null) return 'Chưa có lịch thu hái';
  final days = daysUntil(p.estimatedHarvestDate!, now);
  if (days < 0) return 'Quá lịch ${-days} ngày';
  return days == 0 ? 'Thu hái hôm nay' : 'Còn $days ngày';
}

class _CultivationCard extends StatelessWidget {
  const _CultivationCard(this.parcels);
  final List<Parcel> parcels;

  @override
  Widget build(BuildContext context) {
    final active = parcels.where((p) => p.status.isActive);
    final area = parcels.fold<double>(0, (sum, p) => sum + p.areaHa);
    final activeArea = active.fold<double>(0, (sum, p) => sum + p.areaHa);
    final yieldKg = active.fold<double>(0, (sum, p) => sum + p.expectedKg);
    final approvedKg = active
        .where((p) => p.status == ParcelStatus.harvestApproved)
        .fold<double>(0, (sum, p) => sum + p.expectedKg);
    return SectionCard(
      title: 'Sản lượng kỳ vọng',
      divided: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            fmtTon(yieldKg),
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          Text(
            'Từ ${active.length} thửa đang canh tác',
            style: const TextStyle(fontSize: 13, color: StaffColors.muted),
          ),
          const SizedBox(height: 16),
          ProportionLine(
            label: 'Sản lượng được phép thu hoạch',
            detail: '${fmtTon(approvedKg)} / ${fmtTon(yieldKg)}',
            value: yieldKg > 0 ? approvedKg / yieldKg : 0,
          ),
          const SizedBox(height: 16),
          ProportionLine(
            label: 'Diện tích đang canh tác',
            detail: '${fmtHa(activeArea)} / ${fmtHa(area)}',
            value: area > 0 ? activeArea / area : 0,
          ),
        ],
      ),
    );
  }
}

class _ShopSummary extends StatelessWidget {
  const _ShopSummary({required this.summary, required this.base});
  final HtxSummary summary;
  final String base;
  @override
  Widget build(BuildContext context) => SectionCard(
    title: 'Gian hàng',
    divided: true,
    padded: false,
    onSeeAll: () => context.go('$base/bookings'),
    child: Column(
      children: [
        StaffListRow(
          title: 'Lượt đặt tour đã xác nhận',
          subtitle: '${summary.confirmedBookings} lượt',
          onTap: () => context.go('$base/bookings'),
        ),
        const Divider(height: 1, indent: 16, endIndent: 16),
        StaffListRow(title: 'Đã thu', subtitle: formatVnd(summary.revenue), onTap: () => context.go('$base/payments')),
      ],
    ),
  );
}

class _JournalPreview extends StatelessWidget {
  const _JournalPreview({required this.entries, required this.seeAllPath, this.title = 'Nhật ký gần đây'});
  final List<JournalEntry> entries;
  final String seeAllPath;
  final String title;
  @override
  Widget build(BuildContext context) => SectionCard(
    title: title,
    divided: true,
    padded: false,
    onSeeAll: () => context.go(seeAllPath),
    child: entries.isEmpty
        ? const StaffListRow(title: 'Không có nhật ký nào cần xem', subtitle: 'Nhật ký mới sẽ hiển thị tại đây.')
        : Column(
            children: [
              for (var i = 0; i < entries.length && i < 3; i++) ...[
                if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                StaffListRow(
                  title: '${entries[i].parcelCode} · ${entries[i].activityType.label}',
                  subtitle: '${entries[i].performedBy} · ${formatDate(entries[i].entryDate)}',
                  trailing: Pill(entries[i].status.label, tone: journalTone(entries[i].status)),
                  onTap: () => context.go('$seeAllPath/${entries[i].id}'),
                ),
              ],
            ],
          ),
  );
}

class ManagerDashboard extends StatelessWidget {
  const ManagerDashboard({super.key});
  @override
  Widget build(BuildContext context) => _HtxDashboard(officer: false);
}

class OfficerDashboard extends StatelessWidget {
  const OfficerDashboard({super.key});
  @override
  Widget build(BuildContext context) => _HtxDashboard(officer: true);
}

/// Shared HTX data, but officer destinations remain read-only.
class _HtxDashboard extends StatelessWidget {
  const _HtxDashboard({required this.officer});
  final bool officer;
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
        prices: !officer && scope.coreIsSample ? await scope.repo.listMarketPrices() : null,
        summary: scope.coreIsSample ? await scope.repo.summary(scope.htx) : null,
      ),
      builder: (context, d, reload) {
        final upcoming = _upcoming(d.parcels, now);
        final pending = d.journal.where((e) => e.status == JournalStatus.pendingApproval).toList();
        final journalPath = officer ? '/manager/journal' : '/manager/journal-approve';
        final recent = [...d.journal]..sort((a, b) => b.entryDate.compareTo(a.entryDate));
        return _scroll(reload, [
          _hero(scope, officer ? 'Cán bộ KT' : 'Trưởng HTX'),
          AttentionCard(
            title: officer ? 'Cần theo dõi' : 'Cần xử lý hôm nay',
            items: [
              _attention(context, 'Nhật ký chờ duyệt', pending.length, journalPath),
              _attention(context, 'Thu hái trong 7 ngày', _weekCount(upcoming, now), '/manager/schedule'),
              _attention(
                context,
                'Thông báo chưa đọc',
                d.notes.where((n) => !n.isRead).length,
                '/manager/notifications',
              ),
              if (d.summary != null) ...[
                _attention(context, 'Đơn chờ xác nhận', d.summary!.pendingOrders, '/manager/orders'),
                _attention(context, 'Lượt đặt chờ xác nhận', d.summary!.pendingBookings, '/manager/bookings'),
              ],
            ],
          ),
          const SizedBox(height: 12),
          SummaryStrip([
            _figure(
              context,
              officer ? 'Nông hộ quản lý' : 'Thành viên',
              '${officer ? d.members.where((m) => m.role == MemberRole.farmer).length : d.members.length}',
              officer ? '/manager/households' : '/manager/members',
            ),
            _figure(
              context,
              officer ? 'Thửa đang canh tác' : 'Vùng canh tác',
              officer
                  ? '${d.parcels.where((p) => p.status.isActive).length}'
                  : fmtHa(d.parcels.fold<double>(0, (s, p) => s + p.areaHa)),
              '/manager/zones',
            ),
            _figure(
              context,
              'Lô sẵn sàng',
              '${d.lots.where((l) => l.status == LotStatus.ready).length}',
              '/manager/lots',
            ),
          ]),
          const SizedBox(height: 16),
          _pair(_HarvestCard(parcels: upcoming, now: now, path: '/manager/schedule'), _CultivationCard(d.parcels)),
          const SizedBox(height: 12),
          _JournalPreview(
            entries: officer ? recent : pending,
            seeAllPath: journalPath,
            title: officer ? 'Nhật ký gần đây' : 'Nhật ký chờ duyệt',
          ),
          if (d.summary != null) ...[const SizedBox(height: 12), _ShopSummary(summary: d.summary!, base: '/manager')],
          if (d.prices != null) ...[const SizedBox(height: 12), _MarketCard(prices: d.prices!)],
          if (officer) ...[
            const SizedBox(height: 12),
            const Text(
              'Tài khoản cán bộ chỉ xem, không có nút duyệt hay chỉnh sửa.',
              style: TextStyle(fontSize: 13, color: StaffColors.muted, height: 1.4),
            ),
          ],
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
    divided: true,
    padded: false,
    onSeeAll: () => context.go('/manager/bulletin'),
    child: Column(
      children: [
        for (final m in prices.take(3))
          StaffListRow(
            title: m.commodity,
            subtitle: m.metric,
            trailing: Pill(m.level, tone: m.index >= 110 ? Tone.warn : (m.index >= 100 ? Tone.ok : Tone.neutral)),
          ),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Nguồn mô phỏng: số liệu mẫu', style: TextStyle(fontSize: 13, color: StaffColors.muted)),
          ),
        ),
      ],
    ),
  );
}

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
        final upcoming = _upcoming(d.parcels, now);
        final todayTasks = upcoming.where((p) => daysUntil(p.estimatedHarvestDate!, now) == 0).length;
        final needsChanges = d.journal
            .where((e) => e.status == JournalStatus.rejected || e.status == JournalStatus.requestChanges)
            .length;
        final visits = [
          for (final v in d.visits ?? const <Booking>[])
            if (!v.departureDate.isBefore(dayOf(now))) v,
        ]..sort((a, b) => a.departureDate.compareTo(b.departureDate));
        final parcels = [...d.parcels]
          ..sort((a, b) {
            final aDate = a.status.isActive ? a.estimatedHarvestDate : null;
            final bDate = b.status.isActive ? b.estimatedHarvestDate : null;
            if (aDate == null) return bDate == null ? a.code.compareTo(b.code) : 1;
            if (bDate == null) return -1;
            return aDate.compareTo(bDate);
          });
        return _scroll(reload, [
          _hero(scope, 'Nông dân'),
          AttentionCard(
            items: [
              _attention(context, 'Việc hôm nay', todayTasks, '/farmer/schedule'),
              _attention(context, 'Nhật ký cần sửa', needsChanges, '/farmer/journal'),
              _attention(
                context,
                'Nhật ký chờ duyệt',
                d.journal.where((e) => e.status == JournalStatus.pendingApproval).length,
                '/farmer/journal',
              ),
              _attention(context, 'Thu hái tới', _weekCount(upcoming, now), '/farmer/schedule'),
            ],
            action: scope.coreWritable
                ? FilledButton.icon(
                    key: const Key('farmer-new-journal'),
                    onPressed: () => context.push('/farmer/journal/new'),
                    icon: const Icon(Icons.add, size: 20),
                    label: const Text('Ghi nhật ký mới'),
                  )
                : null,
          ),
          const SizedBox(height: 12),
          SummaryStrip([
            _figure(context, 'Thửa đất của tôi', '${d.parcels.length}', '/farmer/parcels'),
            _figure(context, 'Diện tích', fmtHa(d.parcels.fold<double>(0, (s, p) => s + p.areaHa)), '/farmer/parcels'),
            _figure(
              context,
              'Thu hái tới',
              upcoming.isEmpty ? '—' : formatDate(upcoming.first.estimatedHarvestDate!).substring(0, 5),
              '/farmer/schedule',
            ),
          ]),
          if (d.weather case final w?) ...[
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                '${fmtNum(w.temperatureC, digits: 0)}°C · ${w.condition} · Ẩm ${w.humidityPct}% · Mưa ${fmtNum(w.precipitationMm)} mm',
                style: const TextStyle(fontSize: 13, height: 1.5, color: StaffColors.muted),
              ),
            ),
          ],
          const SizedBox(height: 16),
          _pair(
            SectionCard(
              title: 'Tình trạng thửa đất',
              divided: true,
              padded: false,
              onSeeAll: () => context.go('/farmer/parcels'),
              child: Column(
                children: [
                  if (parcels.isEmpty)
                    const StaffListRow(title: 'Bạn chưa có thửa đất nào được phân công.')
                  else
                    for (var i = 0; i < parcels.length && i < 3; i++) ...[
                      if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                      StaffListRow(
                        title: parcels[i].code,
                        subtitle:
                            '${parcels[i].cropType} · ${fmtHa(parcels[i].areaHa)}\n${_harvestDistance(parcels[i], now)}',
                        trailing: Pill(parcels[i].status.label, tone: parcelTone(parcels[i].status)),
                        onTap: () => context.go('/farmer/parcels'),
                      ),
                    ],
                  // Safety notices are not truncated with the three-row parcel preview.
                  for (final p in parcels)
                    if (withdrawalDaysLeft(p.id, d.journal, now) > 0)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Pill(
                            'Thửa ${p.code} còn ${withdrawalDaysLeft(p.id, d.journal, now)} ngày cách ly',
                            tone: Tone.warn,
                          ),
                        ),
                      ),
                ],
              ),
            ),
            _HarvestCard(parcels: upcoming, now: now, path: '/farmer/schedule'),
          ),
          const SizedBox(height: 12),
          if (d.visits != null)
            SectionCard(
              title: 'Lịch tham quan',
              divided: true,
              padded: false,
              onSeeAll: () => context.go('/farmer/visits'),
              child: visits.isEmpty
                  ? const StaffListRow(title: 'Chưa có đoàn khách nào')
                  : Column(
                      children: [
                        for (final v in visits.take(3))
                          StaffListRow(
                            key: Key('visit-${v.id}'),
                            title: v.tourName,
                            subtitle: '${formatDateLong(v.departureDate)}\n${v.contactName} · ${v.guests} khách',
                            trailing: v.checkedIn
                                ? const Pill('Đã điểm danh', tone: Tone.ok)
                                : Pill(v.status.label, tone: bookingTone(v.status)),
                            onTap: () => context.push('/farmer/visits/${v.id}'),
                          ),
                      ],
                    ),
            ),
          TextButton(onPressed: () => context.go('/farmer/journal'), child: const Text('Xem lịch sử nhật ký ›')),
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
        final ranked = [...linked]..sort((a, b) => b.guestsThisMonth.compareTo(a.guestsThisMonth));
        return _scroll(reload, [
          _hero(scope, 'Công ty du lịch'),
          AttentionCard(
            items: [
              _attention(context, 'HTX cần hỗ trợ', linked.where((h) => h.state == 'warn').length, '/operator/htx'),
              _attention(
                context,
                'Lượt đặt chờ xác nhận',
                d.$2.where((b) => b.status == BookingStatus.pending).length,
                '/operator/bookings',
              ),
              _attention(context, 'Bài chờ duyệt', d.$3.length, '/operator/articles'),
            ],
          ),
          const SizedBox(height: 12),
          SummaryStrip([
            _figure(context, 'HTX liên kết', '${linked.length}', '/operator/htx'),
            _figure(context, 'Lượt đặt tour', '${d.$2.length}', '/operator/bookings'),
            _figure(
              context,
              'Doanh thu tháng',
              '${linked.fold<int>(0, (s, h) => s + h.revenueMillion)} tr ₫',
              '/operator/reports',
            ),
          ]),
          const SizedBox(height: 16),
          _pair(
            SectionCard(
              title: 'Khách theo hợp tác xã',
              divided: true,
              onSeeAll: () => context.go('/operator/htx'),
              child: ranked.isEmpty
                  ? const Text('Chưa có hợp tác xã liên kết')
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Trong tháng · Đơn vị: khách',
                          style: TextStyle(fontSize: 12, color: StaffColors.muted),
                        ),
                        const SizedBox(height: 4),
                        BarList([
                          for (final h in ranked.take(3)) (h.name.replaceFirst('HTX Chè ', ''), h.guestsThisMonth),
                        ]),
                      ],
                    ),
            ),
            SectionCard(
              title: 'Tour toàn vùng',
              divided: true,
              padded: false,
              onSeeAll: () => context.go('/operator/tours'),
              child: d.$4.isEmpty
                  ? const StaffListRow(title: 'Chưa có tour nào')
                  : Column(
                      children: [
                        for (var i = 0; i < d.$4.length && i < 3; i++) ...[
                          if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                          StaffListRow(
                            title: d.$4[i].name,
                            trailing: Pill(d.$4[i].stateLabel, tone: toneOfState(d.$4[i].state)),
                            onTap: () => context.go('/operator/tours'),
                          ),
                        ],
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Số liệu gộp của các HTX liên kết, không có dữ liệu cá nhân khách hay hộ.',
            style: TextStyle(fontSize: 13, color: StaffColors.muted, height: 1.4),
          ),
          const SizedBox(height: 8),
          const Text('Số liệu mẫu cho bản trình diễn.', style: TextStyle(fontSize: 13, color: StaffColors.muted)),
        ]);
      },
    );
  }
}
