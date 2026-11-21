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
import 'htx_pages.dart';
import 'staff_format.dart';
import 'staff_shell.dart';
import 'staff_widgets.dart';

/// "Nhật ký đồng ruộng": the farmer's own entries with a button to add one.
class FarmerJournalPage extends StatelessWidget {
  const FarmerJournalPage({super.key});

  @override
  Widget build(BuildContext context) => JournalPage(
    title: 'Nhật ký của tôi',
    subtitle: 'Ghi lại việc đã làm trên từng thửa, cán bộ HTX sẽ duyệt.',
    detailBase: '/farmer/journal',
    action: StaffScope(context).coreWritable
        ? FilledButton.icon(
            key: const Key('journal-new'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => context.push('/farmer/journal/new'),
            icon: const Icon(Icons.add, size: 20),
            label: const Text('Ghi mới'),
          )
        : null,
  );
}

/// "Thửa đất của tôi".
class FarmerParcelsPage extends StatelessWidget {
  const FarmerParcelsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    final now = DateTime.now();
    return LoadView<(List<Parcel>, List<JournalEntry>)>(
      load: () async => (
        await scope.repo.listParcels(scope.htx, householdId: scope.household),
        await scope.repo.listJournal(scope.htx, householdId: scope.household),
      ),
      builder: (context, d, reload) {
        final area = d.$1.fold<double>(0, (s, p) => s + p.areaHa);
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              PageHead('Thửa đất của tôi', subtitle: '${d.$1.length} thửa · tổng ${fmtHa(area)}'),
              if (d.$1.isEmpty)
                const StaffEmpty('Bạn chưa có thửa đất nào được phân công.', icon: Icons.eco_outlined)
              else
                Stack10([
                  for (final p in d.$1)
                    RowCard(
                      key: Key('parcel-${p.id}'),
                      leading: const IconBadge(Icons.eco_outlined),
                      title: p.code,
                      subtitle: '${p.cropType} • ${fmtHa(p.areaHa)}',
                      meta: [
                        p.zone,
                        if (p.estimatedHarvestDate != null && p.status != ParcelStatus.harvested)
                          'Thu hái dự kiến ${formatDate(p.estimatedHarvestDate!)} (${_inDays(p.estimatedHarvestDate!, now)})',
                      ].join(' · '),
                      trailing: Pill(p.status.label, tone: parcelTone(p.status)),
                      footer: _withdrawal(p, d.$2, now),
                    ),
                ]),
            ],
          ),
        );
      },
    );
  }

  static String _inDays(DateTime d, DateTime now) {
    final n = daysUntil(d, now);
    if (n < 0) return 'quá ${-n} ngày';
    return n == 0 ? 'hôm nay' : 'còn $n ngày';
  }

  Widget? _withdrawal(Parcel p, List<JournalEntry> entries, DateTime now) {
    final days = withdrawalDaysLeft(p.id, entries, now);
    if (days <= 0) return null;
    return Align(
      alignment: Alignment.centerLeft,
      child: Pill('Còn $days ngày cách ly', tone: Tone.warn),
    );
  }
}

/// Days left before the parcel may be harvested after a spraying (web: safe_harvest_date).
/// Rejected entries are left out, pending ones still warn the farmer.
int withdrawalDaysLeft(String parcelId, List<JournalEntry> entries, DateTime now) {
  var left = 0;
  for (final e in entries) {
    if (e.parcelId != parcelId || e.status == JournalStatus.rejected) continue;
    final safe = e.safeHarvestDate;
    if (safe == null) continue;
    final d = daysUntil(safe, now);
    if (d > left) left = d;
  }
  return left;
}

/// Form "Ghi nhật ký" (web: FarmerJournalForm).
class JournalFormPage extends StatefulWidget {
  const JournalFormPage({super.key});
  @override
  State<JournalFormPage> createState() => _JournalFormPageState();
}

class _JournalFormPageState extends State<JournalFormPage> {
  String? _parcelId;
  DateTime _date = DateTime.now();
  ActivityType _type = ActivityType.irrigation;
  bool _noChemicals = false;
  final _product = TextEditingController();
  final _dosage = TextEditingController();
  final _withdrawal = TextEditingController();
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _product.dispose();
    _dosage.dispose();
    _withdrawal.dispose();
    _notes.dispose();
    super.dispose();
  }

  bool get _usesChemicals => (_type == ActivityType.spraying || _type == ActivityType.fertilizing) && !_noChemicals;

  Future<void> _submit(StaffScope scope) async {
    setState(() => _busy = true);
    try {
      await scope.repo.addJournal(
        NewJournalEntry(
          parcelId: _parcelId ?? '',
          entryDate: _date,
          activityType: _type,
          performedBy: scope.userName,
          productName: _usesChemicals ? _product.text.trim() : null,
          dosage: _usesChemicals ? _dosage.text.trim() : null,
          withdrawalDays: _usesChemicals && _type == ActivityType.spraying
              ? int.tryParse(_withdrawal.text.trim())
              : null,
          notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        ),
      );
      if (!mounted) return;
      showMessage(context, 'Đã gửi nhật ký, đang chờ duyệt');
      context.pop();
    } on HubException catch (e) {
      if (mounted) {
        showMessage(context, e.message, onRetry: e is CoreException && e.retryable ? () => _submit(scope) : null);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scope = StaffScope(context);
    return DetailScaffold(
      title: 'Ghi nhật ký',
      body: LoadView<List<Parcel>>(
        load: () => scope.repo.listParcels(scope.htx, householdId: scope.household),
        builder: (context, parcels, _) {
          final usable = [
            for (final p in parcels)
              if (p.status != ParcelStatus.draft) p,
          ];
          if (usable.isEmpty) return const StaffEmpty('Chưa có thửa đất được phân công');
          _parcelId ??= usable.first.id;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
            children: [
              DropdownButtonFormField<String>(
                isExpanded: true,
                key: const Key('jf-parcel'),
                initialValue: _parcelId,
                decoration: const InputDecoration(labelText: 'Thửa đất'),
                items: [
                  for (final p in usable) DropdownMenuItem(value: p.id, child: Text('${p.code} — ${p.cropType}')),
                ],
                onChanged: (v) => setState(() => _parcelId = v),
              ),
              const SizedBox(height: 14),
              InkWell(
                key: const Key('jf-date'),
                borderRadius: BorderRadius.circular(12),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _date,
                    firstDate: DateTime.now().subtract(const Duration(days: 60)),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) setState(() => _date = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: 'Ngày',
                    suffixIcon: Icon(Icons.calendar_today_outlined, size: 20),
                  ),
                  child: Text(formatDate(_date)),
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<ActivityType>(
                isExpanded: true,
                key: const Key('jf-activity'),
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Hoạt động'),
                items: [for (final t in ActivityType.values) DropdownMenuItem(value: t, child: Text(t.label))],
                onChanged: (v) => setState(() => _type = v ?? _type),
              ),
              if (_type == ActivityType.spraying || _type == ActivityType.fertilizing) ...[
                CheckboxListTile(
                  key: const Key('jf-no-chem'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  activeColor: StaffColors.primary,
                  value: _noChemicals,
                  onChanged: (v) => setState(() => _noChemicals = v ?? false),
                  title: const Text('Không sử dụng thuốc / phân bón trong lần ghi này', style: TextStyle(fontSize: 14)),
                ),
              ],
              if (_usesChemicals) ...[
                TextField(
                  key: const Key('jf-product'),
                  controller: _product,
                  decoration: const InputDecoration(labelText: 'Sản phẩm sử dụng'),
                ),
                const SizedBox(height: 14),
                TextField(
                  key: const Key('jf-dosage'),
                  controller: _dosage,
                  decoration: const InputDecoration(labelText: 'Liều lượng'),
                ),
                if (_type == ActivityType.spraying) ...[
                  const SizedBox(height: 14),
                  TextField(
                    key: const Key('jf-withdrawal'),
                    controller: _withdrawal,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Thời gian cách ly (ngày)'),
                  ),
                ],
              ],
              const SizedBox(height: 14),
              TextField(
                key: const Key('jf-notes'),
                controller: _notes,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Ghi chú'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                key: const Key('jf-submit'),
                onPressed: _busy ? null : () => _submit(scope),
                child: Text(_busy ? 'Đang gửi...' : 'Gửi nhật ký'),
              ),
            ],
          );
        },
      ),
    );
  }
}
