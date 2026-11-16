// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/core/core_exception.dart';
import '../../data/hub_repository.dart';
import '../../data/models/staff.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import 'staff_format.dart';
import 'staff_shell.dart';
import 'staff_widgets.dart';

Widget _list(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

Future<void> _guard(BuildContext context, Future<Object?> Function() action) async {
  try {
    await action();
  } on HubException catch (e) {
    if (!context.mounted) return;
    // A passing failure (offline, 503) offers to try the same call again.
    showMessage(context, e.message, onRetry: e is CoreException && e.retryable ? () => _guard(context, action) : null);
  }
}

// ---------------------------------------------------------------------------
// Lịch thu hái (web: HarvestCalendar)
// ---------------------------------------------------------------------------

class SchedulePage extends StatefulWidget {
  const SchedulePage({super.key});
  @override
  State<SchedulePage> createState() => _SchedulePageState();
}

class _SchedulePageState extends State<SchedulePage> {
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime? _selected;

  static const _weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<List<Parcel>>(
      load: () => scope.repo.listParcels(scope.htx, householdId: scope.household),
      builder: (context, all, reload) {
        final planned = [
          for (final p in all)
            if (p.estimatedHarvestDate != null && p.status != ParcelStatus.harvested) p,
        ]..sort((a, b) => a.estimatedHarvestDate!.compareTo(b.estimatedHarvestDate!));
        final inMonth = [
          for (final p in planned)
            if (p.estimatedHarvestDate!.year == _month.year && p.estimatedHarvestDate!.month == _month.month) p,
        ];
        final shown = _selected == null
            ? inMonth
            : [
                for (final p in inMonth)
                  if (dayOf(p.estimatedHarvestDate!) == _selected) p,
              ];
        final days = {for (final p in inMonth) p.estimatedHarvestDate!.day};
        final first = DateTime(_month.year, _month.month);
        final offset = first.weekday - 1;
        final count = DateTime(_month.year, _month.month + 1, 0).day;
        return _list(reload, [
          PageHead(
            'Lịch thu hoạch dự kiến',
            subtitle: scope.canReschedule
                ? 'Chạm vào một thửa để đổi ngày dự kiến.'
                : 'Các thửa đang chờ đến kỳ thu hái.',
          ),
          SectionCard(
            title: 'Tháng ${_month.month}/${_month.year}',
            child: Column(
              children: [
                Row(
                  children: [
                    IconButton(
                      key: const Key('month-prev'),
                      tooltip: 'Tháng trước',
                      onPressed: () => setState(() {
                        _month = DateTime(_month.year, _month.month - 1);
                        _selected = null;
                      }),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Expanded(
                      child: Text(
                        '${inMonth.length} thửa cần thu hái',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: StaffColors.muted, fontSize: 13.5),
                      ),
                    ),
                    IconButton(
                      key: const Key('month-next'),
                      tooltip: 'Tháng sau',
                      onPressed: () => setState(() {
                        _month = DateTime(_month.year, _month.month + 1);
                        _selected = null;
                      }),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                Row(
                  children: [
                    for (final w in _weekdays)
                      Expanded(
                        child: Text(
                          w,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12, color: StaffColors.faint, fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                for (var row = 0; row < ((offset + count) / 7).ceil(); row++)
                  Row(
                    children: [
                      for (var col = 0; col < 7; col++)
                        Expanded(child: _dayCell(row * 7 + col - offset + 1, count, days, now)),
                    ],
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (shown.isEmpty)
            const StaffEmpty('Không có thửa nào thu hái trong thời gian này', icon: Icons.event_available_outlined)
          else
            Stack10([
              for (final p in shown)
                RowCard(
                  key: Key('harvest-${p.id}'),
                  leading: _DateBadge(p.estimatedHarvestDate!),
                  title: '${p.code} · ${p.cropType}',
                  subtitle: '${p.householdName} · ${fmtHa(p.areaHa)} · dự kiến ${fmtTon(p.expectedKg)}',
                  meta: _dueText(p.estimatedHarvestDate!, now),
                  trailing: Pill(p.status.label, tone: parcelTone(p.status)),
                  footer: scope.canReschedule
                      ? Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton.icon(
                            key: Key('reschedule-${p.id}'),
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                            icon: const Icon(Icons.edit_calendar_outlined, size: 18),
                            label: const Text('Đổi ngày'),
                            onPressed: () async {
                              final picked = await showDatePicker(
                                context: context,
                                initialDate: p.estimatedHarvestDate!,
                                firstDate: now.subtract(const Duration(days: 30)),
                                lastDate: now.add(const Duration(days: 365)),
                                helpText: 'Ngày dự kiến thu hoạch mới',
                              );
                              if (picked == null || !context.mounted) return;
                              await _guard(context, () => scope.repo.rescheduleHarvest(p.id, picked));
                              await reload();
                            },
                          ),
                        )
                      : null,
                ),
            ]),
        ]);
      },
    );
  }

  String _dueText(DateTime date, DateTime now) {
    final d = daysUntil(date, now);
    if (d == 0) return 'Hôm nay';
    if (d > 0) return 'Còn $d ngày';
    return 'Quá hạn ${-d} ngày';
  }

  Widget _dayCell(int day, int count, Set<int> harvestDays, DateTime now) {
    if (day < 1 || day > count) return const SizedBox(height: 40);
    final date = DateTime(_month.year, _month.month, day);
    final has = harvestDays.contains(day);
    final isSel = _selected == date;
    final isToday = dayOf(now) == date;
    return GestureDetector(
      onTap: has ? () => setState(() => _selected = isSel ? null : date) : null,
      child: Container(
        height: 40,
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isSel ? StaffColors.primary : (has ? StaffColors.okSoft : null),
          borderRadius: BorderRadius.circular(10),
          border: isToday ? Border.all(color: StaffColors.primary) : null,
        ),
        alignment: Alignment.center,
        child: Text(
          '$day',
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: has || isToday ? FontWeight.w800 : FontWeight.w500,
            color: isSel ? Colors.white : (has ? StaffColors.primary : StaffColors.ink),
          ),
        ),
      ),
    );
  }
}

class _DateBadge extends StatelessWidget {
  const _DateBadge(this.date);
  final DateTime date;
  @override
  Widget build(BuildContext context) => Container(
    width: 48,
    padding: const EdgeInsets.symmetric(vertical: 6),
    decoration: BoxDecoration(color: StaffColors.secondary, borderRadius: BorderRadius.circular(12)),
    child: Column(
      children: [
        Text(
          '${date.day}',
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: StaffColors.primary, height: 1.1),
        ),
        Text('Th${date.month}', style: const TextStyle(fontSize: 11, color: StaffColors.primary)),
      ],
    ),
  );
}

// ---------------------------------------------------------------------------
// Quản lý thành viên (manager) and Nông hộ (officer)
// ---------------------------------------------------------------------------

class MembersPage extends StatefulWidget {
  const MembersPage({super.key});
  @override
  State<MembersPage> createState() => _MembersPageState();
}

class _MembersPageState extends State<MembersPage> {
  MemberRole? _role;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<List<Member>>(
      load: () => scope.repo.listMembers(scope.htx),
      builder: (context, members, reload) {
        final q = stripDiacritics(_query.toLowerCase());
        final shown = [
          for (final m in members)
            if ((_role == null || m.role == _role) &&
                (q.isEmpty || stripDiacritics(m.name.toLowerCase()).contains(q) || m.phone.contains(q)))
              m,
        ];
        return _list(reload, [
          PageHead('Quản lý thành viên', subtitle: '${members.length} tài khoản trong HTX'),
          TextField(
            key: const Key('member-search'),
            onChanged: (v) => setState(() => _query = v),
            decoration: const InputDecoration(
              hintText: 'Tìm theo tên hoặc số điện thoại',
              prefixIcon: Icon(Icons.search),
            ),
          ),
          const SizedBox(height: 10),
          FilterChips<MemberRole?>(
            options: const [
              (null, 'Tất cả'),
              (MemberRole.farmer, 'Nông dân'),
              (MemberRole.officer, 'Cán bộ'),
              (MemberRole.manager, 'Trưởng HTX'),
            ],
            value: _role,
            onChanged: (v) => setState(() => _role = v),
          ),
          const SizedBox(height: 12),
          if (shown.isEmpty)
            const StaffEmpty('Không có thành viên phù hợp')
          else
            Stack10([
              for (final m in shown)
                RowCard(
                  key: Key('member-${m.id}'),
                  leading: CircleAvatar(
                    radius: 20,
                    backgroundColor: StaffColors.secondary,
                    child: Text(
                      initialsOf(m.name),
                      style: const TextStyle(fontWeight: FontWeight.w800, color: StaffColors.primary, fontSize: 13),
                    ),
                  ),
                  title: m.name,
                  subtitle: m.role.label,
                  meta: m.phone,
                  trailing: Pill(m.status.label, tone: memberTone(m.status)),
                  onTap: () => _showMember(context, m),
                ),
            ]),
        ]);
      },
    );
  }

  void _showMember(BuildContext context, Member m) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      showDragHandle: true,
      builder: (_) => StaffTheme(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              DetailRow('Vai trò', m.role.label),
              DetailRow('Điện thoại', m.phone),
              if (m.email != null) DetailRow('Email', m.email!),
              if (m.address != null) DetailRow('Địa chỉ', m.address!),
              DetailRow('Trạng thái', m.status.label),
            ],
          ),
        ),
      ),
    );
  }
}

/// Officer's "Nông hộ": farmer households with their parcels.
class HouseholdsPage extends StatelessWidget {
  const HouseholdsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<(List<Member>, List<Parcel>)>(
      load: () async => (await scope.repo.listMembers(scope.htx), await scope.repo.listParcels(scope.htx)),
      builder: (context, data, reload) {
        final farmers = [
          for (final m in data.$1)
            if (m.role == MemberRole.farmer) m,
        ];
        return _list(reload, [
          PageHead('Nông hộ', subtitle: '${farmers.length} hộ thuộc HTX, chỉ xem'),
          Stack10([
            for (final f in farmers)
              () {
                final parcels = [
                  for (final p in data.$2)
                    if (p.householdId == f.householdId) p,
                ];
                final area = parcels.fold<double>(0, (s, p) => s + p.areaHa);
                return RowCard(
                  key: Key('household-${f.householdId}'),
                  title: 'Hộ ${f.name}',
                  subtitle: f.address,
                  meta: '${parcels.length} thửa · ${fmtHa(area)}',
                  trailing: Pill(f.status.label, tone: memberTone(f.status)),
                  onTap: () => context.push('/manager/households/${f.householdId}'),
                );
              }(),
          ]),
        ]);
      },
    );
  }
}

class HouseholdDetailPage extends StatelessWidget {
  const HouseholdDetailPage({super.key, required this.householdId});
  final String householdId;

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return DetailScaffold(
      title: 'Chi tiết nông hộ',
      body: LoadView<(Member?, List<Parcel>, List<JournalEntry>)>(
        load: () async {
          final members = await scope.repo.listMembers(scope.htx);
          return (
            members.where((m) => m.householdId == householdId).firstOrNull,
            await scope.repo.listParcels(scope.htx, householdId: householdId),
            await scope.repo.listJournal(scope.htx, householdId: householdId),
          );
        },
        builder: (context, d, reload) {
          final m = d.$1;
          if (m == null) return const StaffEmpty('Không tìm thấy hộ');
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Text('Hộ ${m.name}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              DetailRow('Điện thoại', m.phone),
              if (m.address != null) DetailRow('Địa chỉ', m.address!),
              DetailRow('Trạng thái', m.status.label),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Thửa đất (${d.$2.length})',
                child: d.$2.isEmpty
                    ? const StaffEmpty('Chưa có thửa đất')
                    : Stack10([
                        for (final p in d.$2)
                          RowCard(
                            title: '${p.code} · ${p.cropType}',
                            subtitle: fmtHa(p.areaHa),
                            trailing: Pill(p.status.label, tone: parcelTone(p.status)),
                          ),
                      ]),
              ),
              const SizedBox(height: 12),
              SectionCard(
                title: 'Nhật ký gần đây',
                child: d.$3.isEmpty
                    ? const StaffEmpty('Chưa có nhật ký')
                    : Stack10([
                        for (final e in d.$3.take(4))
                          RowCard(
                            title: '${e.parcelCode} · ${e.activityType.label}',
                            subtitle: formatDate(e.entryDate),
                            trailing: Pill(e.status.label, tone: journalTone(e.status)),
                          ),
                      ]),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Duyệt nhật ký (manager) / Nhật ký (officer) / Nhật ký đồng ruộng (farmer list)
// ---------------------------------------------------------------------------

class JournalPage extends StatefulWidget {
  const JournalPage({
    super.key,
    required this.title,
    this.subtitle,
    this.startPending = false,
    this.detailBase = '/manager/journal',
    this.action,
  });
  final String title;
  final Widget? action;
  final String? subtitle;
  final bool startPending;
  final String detailBase;

  @override
  State<JournalPage> createState() => _JournalPageState();
}

class _JournalPageState extends State<JournalPage> {
  late JournalStatus? _filter = widget.startPending ? JournalStatus.pendingApproval : null;

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<List<JournalEntry>>(
      load: () => scope.repo.listJournal(scope.htx, householdId: scope.household),
      builder: (context, entries, reload) {
        final shown = [
          for (final e in entries)
            if (_filter == null || e.status == _filter) e,
        ];
        final pending = entries.where((e) => e.status == JournalStatus.pendingApproval).length;
        return _list(reload, [
          PageHead(widget.title, subtitle: widget.subtitle ?? '$pending nhật ký chờ duyệt', action: widget.action),
          if (scope.readOnlyNote != null) InfoNote(scope.readOnlyNote!),
          if (scope.readOnlyNote != null) const SizedBox(height: 10),
          FilterChips<JournalStatus?>(
            options: const [
              (null, 'Tất cả'),
              (JournalStatus.pendingApproval, 'Chờ duyệt'),
              (JournalStatus.approved, 'Đã duyệt'),
              (JournalStatus.rejected, 'Từ chối'),
            ],
            value: _filter,
            onChanged: (v) => setState(() => _filter = v),
          ),
          const SizedBox(height: 12),
          if (shown.isEmpty)
            const StaffEmpty('Không có nhật ký nào', icon: Icons.description_outlined)
          else
            Stack10([
              for (final e in shown)
                RowCard(
                  key: Key('journal-${e.id}'),
                  title: '${e.parcelCode} · ${e.activityType.label}',
                  subtitle: [e.cropType, if (e.activityDetail.isNotEmpty) e.activityDetail].join(' · '),
                  meta: '${formatDate(e.entryDate)} · ${e.performedBy}',
                  trailing: Pill(e.status.label, tone: journalTone(e.status)),
                  onTap: () async {
                    await context.push('${widget.detailBase}/${e.id}');
                    await reload();
                  },
                  footer: scope.canWrite && e.status == JournalStatus.pendingApproval
                      ? _ReviewButtons(entry: e, scope: scope, onDone: reload)
                      : null,
                ),
            ]),
        ]);
      },
    );
  }
}

class _ReviewButtons extends StatelessWidget {
  const _ReviewButtons({required this.entry, required this.scope, required this.onDone});
  final JournalEntry entry;
  final StaffScope scope;
  final Future<void> Function() onDone;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      if (scope.repo.canRejectJournal) ...[
        Expanded(
          child: OutlinedButton(
            key: Key('journal-reject-${entry.id}'),
            style: OutlinedButton.styleFrom(
              foregroundColor: StaffColors.bad,
              side: const BorderSide(color: StaffColors.bad),
              minimumSize: const Size(0, 42),
            ),
            onPressed: () async {
              await _guard(context, () => scope.repo.reviewJournal(entry.id, approve: false));
              await onDone();
            },
            child: const Text('Từ chối'),
          ),
        ),
        const SizedBox(width: 10),
      ],
      Expanded(
        child: FilledButton(
          key: Key('journal-approve-${entry.id}'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 42)),
          onPressed: () async {
            await _guard(context, () => scope.repo.reviewJournal(entry.id, approve: true));
            await onDone();
          },
          child: const Text('Duyệt'),
        ),
      ),
    ],
  );
}

class JournalDetailPage extends StatelessWidget {
  const JournalDetailPage({super.key, required this.entryId});
  final String entryId;

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return DetailScaffold(
      title: 'Chi tiết nhật ký',
      body: LoadView<JournalEntry?>(
        load: () async => (await scope.repo.listJournal(
          scope.htx,
          householdId: scope.household,
        )).where((e) => e.id == entryId).firstOrNull,
        builder: (context, e, reload) {
          if (e == null) return const StaffEmpty('Không tìm thấy nhật ký');
          final safe = e.safeHarvestDate;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${e.parcelCode} · ${e.activityType.label}',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                    ),
                  ),
                  Pill(e.status.label, tone: journalTone(e.status)),
                ],
              ),
              const SizedBox(height: 8),
              DetailRow('Cây trồng', e.cropType),
              DetailRow('Ngày', formatDate(e.entryDate)),
              DetailRow('Người thực hiện', e.performedBy),
              if (e.activityDetail.isNotEmpty) DetailRow('Chi tiết', e.activityDetail),
              if (e.productName != null) DetailRow('Sản phẩm', e.productName!),
              if (e.dosage != null) DetailRow('Liều lượng', e.dosage!),
              if (e.withdrawalDays != null)
                DetailRow('Cách ly', '${e.withdrawalDays} ngày (an toàn từ ${formatDate(safe!)})'),
              if (e.notes != null) DetailRow('Ghi chú', e.notes!),
              if (scope.readOnlyNote != null) ...[const SizedBox(height: 12), InfoNote(scope.readOnlyNote!)],
              if (scope.canWrite && e.status == JournalStatus.pendingApproval) ...[
                const SizedBox(height: 16),
                _ReviewButtons(entry: e, scope: scope, onDone: reload),
              ],
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Lô hàng
// ---------------------------------------------------------------------------

class LotsPage extends StatefulWidget {
  const LotsPage({super.key});
  @override
  State<LotsPage> createState() => _LotsPageState();
}

class _LotsPageState extends State<LotsPage> {
  LotStatus? _filter;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<List<Lot>>(
      load: () => scope.repo.listLots(scope.htx),
      builder: (context, lots, reload) {
        final q = _query.toLowerCase();
        final shown = [
          for (final l in lots)
            if ((_filter == null || l.status == _filter) &&
                (q.isEmpty || l.lotCode.toLowerCase().contains(q) || l.commodity.toLowerCase().contains(q)))
              l,
        ];
        return _list(reload, [
          const PageHead(
            'Sẵn sàng giao thương',
            eyebrow: Text(
              'LÔ HÀNG & TRUY XUẤT',
              style: TextStyle(
                color: StaffColors.primary,
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
            subtitle: 'Kiểm soát nghiệm thu, hồ sơ và mã QR trước khi xuất hàng.',
          ),
          TextField(
            key: const Key('lot-search'),
            onChanged: (v) => setState(() => _query = v),
            decoration: const InputDecoration(hintText: 'Tìm mã lô, sản phẩm...', prefixIcon: Icon(Icons.search)),
          ),
          const SizedBox(height: 10),
          FilterChips<LotStatus?>(
            options: const [
              (null, 'Tất cả'),
              (LotStatus.ready, 'Sẵn sàng'),
              (LotStatus.qrExported, 'Đã xuất QR'),
              (LotStatus.draft, 'Nháp'),
            ],
            value: _filter,
            onChanged: (v) => setState(() => _filter = v),
          ),
          const SizedBox(height: 12),
          if (shown.isEmpty)
            const StaffEmpty('Không có lô hàng nào', icon: Icons.inventory_2_outlined)
          else
            Stack10([
              for (final l in shown)
                RowCard(
                  key: Key('lot-${l.id}'),
                  leading: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(color: StaffColors.secondary, borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.qr_code_2, color: StaffColors.primary),
                  ),
                  title: l.lotCode,
                  subtitle: '${l.commodity}${l.qualityGrade == null ? '' : ' · ${l.qualityGrade}'}',
                  meta:
                      '${l.weightKg == null ? 'Chưa cân' : '${fmtNum(l.weightKg!, digits: 0)} kg'} · ${l.parcelCodes.length} thửa nguồn',
                  trailing: Pill(l.status.label, tone: lotTone(l.status)),
                  onTap: () => context.push('/manager/lots/${l.id}'),
                ),
            ]),
        ]);
      },
    );
  }
}

class LotDetailPage extends StatelessWidget {
  const LotDetailPage({super.key, required this.lotId});
  final String lotId;

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return DetailScaffold(
      title: 'Chi tiết lô hàng',
      body: LoadView<Lot?>(
        load: () async => (await scope.repo.listLots(scope.htx)).where((l) => l.id == lotId).firstOrNull,
        builder: (context, l, _) {
          if (l == null) return const StaffEmpty('Không tìm thấy lô hàng');
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(l.lotCode, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  Pill(l.status.label, tone: lotTone(l.status)),
                ],
              ),
              const SizedBox(height: 8),
              DetailRow('Sản phẩm', l.commodity),
              DetailRow('Phân hạng', l.qualityGrade ?? 'Chưa phân hạng'),
              DetailRow('Ngày thu hoạch', formatDate(l.harvestDate)),
              DetailRow('Sản lượng', l.weightKg == null ? 'Chưa cân' : '${fmtNum(l.weightKg!, digits: 0)} kg'),
              if (l.packagingType != null) DetailRow('Đóng gói', l.packagingType!),
              if (l.destination != null) DetailRow('Nơi giao', l.destination!),
              if (l.buyerName != null) DetailRow('Người mua', l.buyerName!),
              DetailRow('Thửa nguồn', l.parcelCodes.join(', ')),
              const SizedBox(height: 12),
              InfoNote(
                l.status == LotStatus.draft
                    ? 'Lô nháp: cần cân, đóng gói và đính kèm hồ sơ trước khi xuất mã QR (làm trên bản web).'
                    : 'Mã QR truy xuất của lô được tạo và in trên bản web.',
                tone: Tone.neutral,
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Vùng trồng
// ---------------------------------------------------------------------------

class ZonesPage extends StatefulWidget {
  const ZonesPage({super.key});
  @override
  State<ZonesPage> createState() => _ZonesPageState();
}

class _ZonesPageState extends State<ZonesPage> {
  String? _zone;

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<List<Parcel>>(
      load: () => scope.repo.listParcels(scope.htx),
      builder: (context, parcels, reload) {
        final zones = {for (final p in parcels) p.zone}.toList()..sort();
        final active = parcels.where((p) => p.status.isActive).fold<double>(0, (s, p) => s + p.areaHa);
        final shown = [
          for (final p in parcels)
            if (_zone == null || p.zone == _zone) p,
        ];
        return _list(reload, [
          const PageHead('Vùng trồng', subtitle: 'Danh sách thửa đất theo khu vực. Bản đồ hiển thị trên web.'),
          MetricGrid([
            MetricCard(label: 'Đang canh tác', value: fmtHa(active), icon: Icons.eco_outlined),
            MetricCard(
              label: 'Số thửa đất',
              value: '${parcels.length}',
              icon: Icons.grid_view_outlined,
              tone: Tone.neutral,
            ),
          ]),
          const SizedBox(height: 14),
          FilterChips<String?>(
            options: [(null, 'Tất cả'), for (final z in zones) (z, z)],
            value: _zone,
            onChanged: (v) => setState(() => _zone = v),
          ),
          const SizedBox(height: 12),
          Stack10([
            for (final p in shown)
              RowCard(
                key: Key('zone-${p.id}'),
                title: '${p.code} · ${p.cropType}',
                subtitle: 'Hộ ${p.householdName}',
                meta: '${p.zone} · ${fmtHa(p.areaHa)}',
                trailing: Pill(p.status.label, tone: parcelTone(p.status)),
              ),
          ]),
        ]);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Thông báo
// ---------------------------------------------------------------------------

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<List<AppNotification>>(
      load: () => scope.repo.listNotifications(scope.htx, householdId: scope.household),
      builder: (context, items, reload) {
        final unread = items.where((n) => !n.isRead).length;
        return _list(reload, [
          PageHead(
            'Thông báo',
            subtitle: unread == 0 ? 'Bạn đã đọc hết thông báo' : '$unread thông báo chưa đọc',
            action: unread == 0 || !scope.coreWritable
                ? null
                : TextButton(
                    key: const Key('notif-read-all'),
                    onPressed: () async {
                      await scope.repo.markAllNotificationsRead(scope.htx, householdId: scope.household);
                      await reload();
                    },
                    child: const Text('Đọc hết'),
                  ),
          ),
          if (items.isEmpty)
            const StaffEmpty('Chưa có thông báo nào', icon: Icons.notifications_none)
          else
            Stack10([
              for (final n in items)
                RowCard(
                  key: Key('notif-${n.id}'),
                  leading: Container(
                    width: 10,
                    height: 10,
                    margin: const EdgeInsets.only(top: 5),
                    decoration: BoxDecoration(
                      color: n.isRead ? Colors.transparent : StaffColors.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  title: n.title,
                  subtitle: n.body,
                  meta: '${n.kind.label} · ${relativeTime(n.createdAt, now)}',
                  onTap: n.isRead || !scope.coreWritable
                      ? null
                      : () async {
                          await scope.repo.markNotificationRead(n.id);
                          await reload();
                        },
                ),
            ]),
        ]);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Hồ sơ HTX
// ---------------------------------------------------------------------------

class HtxProfilePage extends StatelessWidget {
  const HtxProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return LoadView<HtxProfile>(
      load: () => scope.repo.getHtxProfile(scope.htx),
      builder: (context, p, reload) => _list(reload, [
        const PageHead('Hồ sơ Hợp tác xã'),
        SectionCard(
          title: 'Thông tin chung',
          child: Column(
            children: [
              DetailRow('Tên HTX', p.name),
              DetailRow('Mã HTX', p.code),
              DetailRow('Địa chỉ', p.address),
              DetailRow('Điện thoại', p.phone),
              DetailRow('Email', p.email),
              DetailRow('Vụ mùa', p.seasonLabel),
              DetailRow('Tổng diện tích', fmtHa(p.totalAreaHa)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Loại cây trồng',
          child: Wrap(spacing: 8, runSpacing: 8, children: [for (final c in p.cropTypes) Pill(c, tone: Tone.ok)]),
        ),
        const SizedBox(height: 12),
        const InfoNote(
          'Chỉnh sửa hồ sơ, ảnh đại diện và thông tin liên hệ thực hiện trên bản web.',
          tone: Tone.neutral,
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------
// Bản tin
// ---------------------------------------------------------------------------

class BulletinPage extends StatelessWidget {
  const BulletinPage({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<(List<BulletinItem>, List<MarketPrice>)>(
      load: () async => (await scope.repo.listBulletins(), await scope.repo.listMarketPrices()),
      builder: (context, d, reload) => _list(reload, [
        const PageHead(
          'Thông tin có nguồn, dễ hiểu',
          eyebrow: Text(
            'BẢN TIN NÔNG NGHIỆP SỐ',
            style: TextStyle(color: StaffColors.primary, fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1),
          ),
          subtitle: 'Cập nhật thị trường, thời tiết và kỹ thuật liên quan vùng trồng HTX.',
        ),
        SectionCard(
          title: 'Chỉ số giá nông sản',
          child: Column(
            children: [
              for (final m in d.$2)
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
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Pill(m.level, tone: m.index >= 110 ? Tone.warn : (m.index >= 100 ? Tone.ok : Tone.neutral)),
                          Text(
                            'chỉ số ${fmtNum(m.index)}',
                            style: const TextStyle(fontSize: 11.5, color: StaffColors.faint),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 4),
              const Text(
                'Hệ thống tổng hợp dữ liệu, không đưa ra khuyến nghị sản xuất. Nguồn mô phỏng: số liệu mẫu.',
                style: TextStyle(fontSize: 12, color: StaffColors.faint, height: 1.4),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Stack10([
          for (final b in d.$1)
            RowCard(
              title: b.title,
              subtitle: b.body,
              meta: 'Nguồn: ${b.sources.join(' · ')} · ${relativeTime(b.createdAt, now)}',
            ),
        ]),
      ]),
    );
  }
}
