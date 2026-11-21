// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/order.dart';
import '../../core/theme/staff_theme.dart';
import '../../shared/widgets.dart' show LoadView, TeaPhoto, showMessage, teaPhotoFor;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';
import 'tour_widgets.dart';

Widget _page(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

/// "Lượt đặt tour": every tour booking, with a date block, filters and the money. Tours are the company's business,
/// so the company confirms the money, cancels and checks groups in.
class ManagerBookingsTab extends StatefulWidget {
  const ManagerBookingsTab({super.key});

  @override
  State<ManagerBookingsTab> createState() => _ManagerBookingsTabState();
}

class _ManagerBookingsTabState extends State<ManagerBookingsTab> {
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
      load: () => repo.listBookings(context.read<AppState>().claims?.htxCode ?? ''),
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
        final coming = all.where((b) => b.status != BookingStatus.cancelled && !b.departureDate.isBefore(day));
        final value = all.where((b) => b.status != BookingStatus.cancelled).fold<int>(0, (s, b) => s + b.total);
        final perDay = <DateTime, int>{};
        for (final b in bookings) {
          final k = DateTime(b.departureDate.year, b.departureDate.month, b.departureDate.day);
          perDay[k] = (perDay[k] ?? 0) + 1;
        }
        // A date header above the first booking of each day.
        final firstOfDay = <String>{};
        DateTime? previous;
        for (final b in bookings) {
          final k = DateTime(b.departureDate.year, b.departureDate.month, b.departureDate.day);
          if (k != previous) firstOfDay.add(b.id);
          previous = k;
        }
        return _page(reload, [
          PageHead('Lượt đặt tour', subtitle: '$pending lượt chờ HTX xác nhận'),
          Row(
            children: [
              Expanded(child: _MiniStat(Icons.hourglass_top, '$pending', 'Chờ xác nhận', warn: pending > 0)),
              const SizedBox(width: 8),
              Expanded(child: _MiniStat(Icons.flight_takeoff, '${coming.length}', 'Đoàn sắp đi')),
              const SizedBox(width: 8),
              Expanded(child: _MiniStat(Icons.payments_outlined, _short(value), 'Giá trị đặt')),
            ],
          ),
          const SizedBox(height: 14),
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
              if (firstOfDay.contains(b.id))
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: dayLabel(b.departureDate),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: StaffColors.ink),
                        ),
                        TextSpan(
                          text:
                              '  ·  ${perDay[DateTime(b.departureDate.year, b.departureDate.month, b.departureDate.day)]} đoàn',
                          style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              OpCard(
                key: Key('op-booking-${b.id}'),
                onTap: () async {
                  await context.push('/manager/bookings/${b.id}');
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

/// 1.260.000 ₫ as "1,26 tr ₫" for a small tile.
String _short(int vnd) {
  if (vnd >= 1000000) {
    final m = vnd / 1000000;
    return '${m.toStringAsFixed(m >= 100 ? 0 : 1).replaceAll('.', ',')} tr ₫';
  }
  return formatVnd(vnd);
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.icon, this.value, this.label, {this.warn = false});
  final IconData icon;
  final String value;
  final String label;
  final bool warn;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: warn ? StaffColors.warnSoft : Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: warn ? StaffColors.warnSoft : StaffColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: warn ? StaffColors.warn : StaffColors.primary),
        const SizedBox(height: 6),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: warn ? StaffColors.warn : StaffColors.ink),
        ),
        Text(label, maxLines: 2, style: const TextStyle(fontSize: 12, color: StaffColors.muted, height: 1.25)),
      ],
    ),
  );
}

class ManagerBookingDetailScreen extends StatelessWidget {
  const ManagerBookingDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final actor = context.read<AppState>().claims!;
    final user = actor.name;
    final writable = actor.canWriteHtx;
    return DetailScaffold(
      title: 'Chi tiết lượt đặt',
      body: LoadView<Booking?>(
        load: () async => (await repo.listBookings(actor.htxCode ?? '')).where((b) => b.id == bookingId).firstOrNull,
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
          final canConfirm = writable && open && b.paymentStatus != PaymentStatus.paid;
          final canCheckIn = writable && b.status == BookingStatus.confirmed && !b.checkedIn;
          final canCancel = writable && b.status.canMoveTo(BookingStatus.cancelled) && !b.checkedIn;
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
                key: const Key('booking-steps'),
                padding: const EdgeInsets.fromLTRB(8, 14, 8, 12),
                child: b.status == BookingStatus.cancelled
                    ? const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 6),
                        child: Text(
                          'Lượt đặt đã huỷ, chỗ đã được trả lại cho ngày khởi hành.',
                          style: TextStyle(color: StaffColors.bad, fontWeight: FontWeight.w600),
                        ),
                      )
                    : StepTrack(
                        steps: const ['Đặt chỗ', 'Nhận tiền', 'Xác nhận', 'Đón đoàn'],
                        done:
                            1 +
                            (b.paymentStatus == PaymentStatus.paid ? 1 : 0) +
                            (b.status == BookingStatus.confirmed || b.status == BookingStatus.completed ? 1 : 0) +
                            (b.checkedIn || b.status == BookingStatus.completed ? 1 : 0),
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
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        key: const Key('copy-phone'),
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: b.phone));
                          if (context.mounted) showMessage(context, 'Đã sao chép số điện thoại');
                        },
                        icon: const Icon(Icons.copy, size: 16),
                        label: const Text('Sao chép số điện thoại'),
                      ),
                    ),
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
                      'Khách chuyển khoản vào tài khoản của HTX.',
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
                      () => repo.recordPayment(reference: b.code, amount: b.total, recordedBy: user, actor: actor),
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
                    key: const Key('manager-checkin'),
                    icon: const Icon(Icons.how_to_reg),
                    onPressed: () => run(() => repo.checkIn(b.id, actor: actor), 'Đã điểm danh'),
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
                    if (ok == true) await run(() => repo.cancelBooking(b.id, actor: actor), 'Đã huỷ lượt đặt');
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
class ManagerTourPaymentsPage extends StatelessWidget {
  const ManagerTourPaymentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Payment>>(
      load: () => repo.listTourPayments(context.read<AppState>().claims?.htxCode ?? ''),
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
              'Khi khách chuyển khoản và HTX xác nhận, khoản thu hiện ở đây.',
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
