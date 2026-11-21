// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/role/role.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';
import 'guide_widgets.dart';

/// The members of one tour: every booking group of a departure with its guests, phone, payment and check-in.
/// Shared by the assigned guide and by the cooperative that runs the tour (officers only read).
class TourRosterPage extends StatefulWidget {
  const TourRosterPage({super.key, required this.tourId});
  final String tourId;
  @override
  State<TourRosterPage> createState() => _TourRosterPageState();
}

class _TourRosterPageState extends State<TourRosterPage> {
  String? _departureId;
  String _query = '';
  final _checking = <String>{};

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final actor = context.read<AppState>().claims!;
    final isGuide = roleFromClaims(actor) == AppRole.guide;
    final canCheckIn = isGuide || actor.canWriteHtx;
    return DetailScaffold(
      title: 'Thành viên của tour',
      backFallback: isGuide ? '/guide' : '/manager/tours',
      body: LoadView<(Tour, List<Departure>, List<Booking>)>(
        key: ValueKey(widget.tourId),
        load: () async {
          final tour = await repo.getTour(widget.tourId);
          final all = isGuide
              ? await repo.listGuideBookings(actor.subject, tourId: tour.id)
              : (await repo.listBookings(tour.htxCode)).where((b) => b.tourId == tour.id).toList();
          if (isGuide && !tour.guideIds.contains(actor.subject)) {
            throw const HubException('Tour này chưa được giao cho bạn.');
          }
          if (!isGuide && tour.htxCode != actor.htxCode) throw const HubException('Đây không phải tour của HTX bạn.');
          return (tour, await repo.listDepartures(tour.id), all);
        },
        builder: (context, data, reload) {
          final today = DateUtils.dateOnly(DateTime.now());
          final departures = [...data.$2]..sort((a, b) => a.date.compareTo(b.date));
          final current =
              departures.where((d) => d.id == _departureId).firstOrNull ??
              departures.where((d) => !DateUtils.dateOnly(d.date).isBefore(today)).firstOrNull ??
              departures.lastOrNull;
          final groups = current == null ? <Booking>[] : data.$3.where((b) => b.departureId == current.id).toList()
            ..sort((a, b) => a.contactName.compareTo(b.contactName));
          final active = groups.where((b) => b.status != BookingStatus.cancelled).toList();
          final q = _query.trim().toLowerCase();
          final shown = q.isEmpty
              ? groups
              : groups
                    .where(
                      (b) =>
                          b.contactName.toLowerCase().contains(q) ||
                          b.phone.contains(q) ||
                          b.code.toLowerCase().contains(q),
                    )
                    .toList();
          final guests = active.fold<int>(0, (n, b) => n + b.guests);
          final arrived = active.where((b) => b.checkedIn).fold<int>(0, (n, b) => n + b.guests);
          final unpaid = active.where((b) => b.paymentStatus != PaymentStatus.paid).length;
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                PageHead(data.$1.name, subtitle: 'Danh sách khách theo từng ngày khởi hành'),
                if (departures.isEmpty) const StaffEmpty('Tour chưa có ngày khởi hành'),
                if (departures.isNotEmpty)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final dep in departures)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              key: Key('roster-dep-${dep.id}'),
                              label: Text(formatDate(dep.date)),
                              selected: dep.id == current?.id,
                              onSelected: (_) => setState(() => _departureId = dep.id),
                            ),
                          ),
                      ],
                    ),
                  ),
                if (current != null) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: GuideStat(value: '$guests', label: 'Khách đã đặt', icon: Icons.groups_outlined),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GuideStat(value: '$arrived/$guests', label: 'Đã đến', icon: Icons.how_to_reg_outlined),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: GuideStat(value: '$unpaid', label: 'Chưa thanh toán', icon: Icons.payments_outlined),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    key: const Key('roster-search'),
                    decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      hintText: 'Tìm theo tên, số điện thoại, mã vé',
                    ),
                    onChanged: (v) => setState(() => _query = v),
                  ),
                  const SizedBox(height: 12),
                  if (groups.isEmpty) const StaffEmpty('Chưa có khách đặt ngày này'),
                  if (groups.isNotEmpty && shown.isEmpty) const StaffEmpty('Không có khách nào khớp'),
                  for (final b in shown)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _MemberCard(
                        booking: b,
                        busy: _checking.contains(b.id),
                        onCheckIn: !canCheckIn || b.status != BookingStatus.confirmed || b.checkedIn
                            ? null
                            : () async {
                                if (_checking.contains(b.id)) return;
                                setState(() => _checking.add(b.id));
                                try {
                                  await repo.checkIn(b.id, actor: actor);
                                  await reload();
                                } on HubException catch (error) {
                                  if (context.mounted) showMessage(context, error.message);
                                } catch (_) {
                                  if (context.mounted) showMessage(context, 'Không thể điểm danh. Hãy thử lại.');
                                } finally {
                                  if (mounted) setState(() => _checking.remove(b.id));
                                }
                              },
                      ),
                    ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.booking, required this.busy, required this.onCheckIn});
  final Booking booking;
  final bool busy;
  final VoidCallback? onCheckIn;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final cancelled = b.status == BookingStatus.cancelled;
    final initial = b.contactName.trim().isEmpty ? '?' : b.contactName.trim().characters.first.toUpperCase();
    return Container(
      key: Key('roster-booking-${b.id}'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cancelled ? StaffColors.neutralSoft : StaffColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: StaffColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: StaffColors.secondary,
                foregroundColor: StaffColors.primary,
                child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      b.contactName,
                      style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: StaffColors.ink),
                    ),
                    Text(
                      '${b.adults} người lớn${b.children > 0 ? ', ${b.children} trẻ em' : ''} · ${b.code}',
                      style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (b.phone.isNotEmpty)
            Row(
              children: [
                const Icon(Icons.phone_outlined, size: 16, color: StaffColors.muted),
                const SizedBox(width: 6),
                Expanded(child: Text(b.phone)),
                IconButton(
                  key: Key('roster-copy-${b.id}'),
                  tooltip: 'Sao chép số điện thoại',
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: b.phone));
                    if (context.mounted) showMessage(context, 'Đã sao chép số điện thoại khách');
                  },
                ),
              ],
            ),
          if (b.note.isNotEmpty) Text('Ghi chú: ${b.note}', style: const TextStyle(color: StaffColors.muted)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (cancelled)
                const GuideChip('Đã huỷ')
              else ...[
                GuideChip(b.checkedIn ? 'Đã đến' : 'Chưa đến', icon: b.checkedIn ? Icons.check_circle_outline : null),
                GuideChip(b.paymentStatus.label),
                GuideChip(b.status.label),
              ],
            ],
          ),
          if (onCheckIn != null) ...[
            const SizedBox(height: 10),
            FilledButton.icon(
              key: Key('roster-checkin-${b.id}'),
              icon: const Icon(Icons.how_to_reg),
              label: const Text('Điểm danh đã đến'),
              onPressed: busy ? null : onCheckIn,
            ),
          ],
        ],
      ),
    );
  }
}
