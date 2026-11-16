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
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

// Pages of the tour company (operator). Mock data only; see the repository.
// All tour work lives here: bookings, tour money and check-in.

Widget _page(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

/// "Hợp tác xã liên kết".
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
        Stack10([
          for (final h in list)
            RowCard(
              key: Key('htx-${h.code}'),
              title: h.name,
              subtitle: '${h.location} · ${h.households} hộ (${h.hosting} đón khách)',
              meta: '${h.tours} tour · ${h.articles} bài',
              trailing: Pill(h.stateLabel, tone: toneOfState(h.state)),
              footer: Row(
                children: [
                  const Text('Sẵn sàng', style: TextStyle(fontSize: 12.5)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: h.readiness / 100,
                        minHeight: 8,
                        backgroundColor: const Color(0xFFE7F0EA),
                        color: const Color(0xFF176C4B),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${h.readiness}%', style: const TextStyle(fontWeight: FontWeight.w800)),
                ],
              ),
              onTap: () => showModalBottomSheet<void>(
                context: context,
                showDragHandle: true,
                backgroundColor: Colors.white,
                builder: (_) => StaffTheme(child: _HtxSheet(h)),
              ),
            ),
        ]),
        const SizedBox(height: 12),
        const InfoNote('HTX nhận lời mời, chấp nhận hoặc từ chối. Rút lui bất cứ lúc nào.', tone: Tone.neutral),
      ]),
    );
  }
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
        Text(h.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Pill(h.stateLabel, tone: toneOfState(h.state)),
        const SizedBox(height: 10),
        DetailRow('Khu vực', h.location),
        DetailRow('Hộ thành viên', '${h.households}'),
        DetailRow('Hộ đón khách', '${h.hosting}'),
        DetailRow('Khách tháng này', '${h.guestsThisMonth}'),
        DetailRow('Doanh thu', '${h.revenueMillion} triệu ₫'),
        const SizedBox(height: 8),
        const Text(
          'Không chia sẻ với công ty: tên, số điện thoại khách và vị trí thửa của hộ.',
          style: TextStyle(fontSize: 12.5, color: Color(0xFF5B6B62)),
        ),
      ],
    ),
  );
}

/// "Tour toàn vùng".
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
        Stack10([
          for (final t in tours)
            RowCard(
              key: Key('region-${t.id}'),
              title: t.name,
              subtitle: '${t.route} · ${formatVnd(t.price)}',
              meta: '${t.htxCount} HTX tham gia',
              trailing: Pill(t.stateLabel, tone: toneOfState(t.state)),
            ),
        ]),
        const SizedBox(height: 12),
        const InfoNote('Tạo tour tuyến mới làm trên bản web.', tone: Tone.neutral),
      ]),
    );
  }
}

/// "Bài viết HTX": articles waiting for the company to approve.
class OperatorArticlesTab extends StatelessWidget {
  const OperatorArticlesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Article>>(
      load: repo.listPendingArticles,
      builder: (context, articles, reload) => _page(reload, [
        const PageHead(
          'Bài viết của hợp tác xã',
          subtitle: 'HTX viết bài, công ty duyệt rồi bài hiện trong ứng dụng khách.',
        ),
        if (articles.isEmpty)
          const StaffEmpty('Không có bài nào chờ duyệt', icon: Icons.fact_check_outlined)
        else
          Stack10([
            for (final a in articles)
              RowCard(
                title: a.title,
                subtitle: a.body,
                meta: 'HTX: ${a.htxCode} · ${formatDate(a.createdAt)}',
                trailing: const Pill('Chờ duyệt', tone: Tone.warn),
                footer: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: Key('reject-${a.id}'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFB3261E),
                          side: const BorderSide(color: Color(0xFFB3261E)),
                          minimumSize: const Size(0, 42),
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
                      child: FilledButton(
                        key: Key('approve-${a.id}'),
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 42)),
                        onPressed: () async {
                          await repo.reviewArticle(a.id, approve: true);
                          await reload();
                        },
                        child: const Text('Duyệt'),
                      ),
                    ),
                  ],
                ),
              ),
          ]),
      ]),
    );
  }
}

/// "Báo cáo tổng hợp".
class OperatorReportsPage extends StatelessWidget {
  const OperatorReportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<ReportRow>>(
      load: repo.reportRows,
      builder: (context, rows, reload) => _page(reload, [
        const PageHead('Báo cáo tổng hợp', subtitle: 'Chỉ số liệu tổng, không có dữ liệu cá nhân khách hay hộ.'),
        SectionCard(
          title: 'Tháng này',
          child: Column(
            children: [
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(r.metric, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                            Text('Nguồn: ${r.source}', style: const TextStyle(fontSize: 12, color: Color(0xFF8A978F))),
                          ],
                        ),
                      ),
                      Text(r.value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const InfoNote('Số liệu mẫu cho bản trình diễn. Tải tệp CSV làm trên bản web.', tone: Tone.neutral),
      ]),
    );
  }
}

/// "Lượt đặt tour": every tour booking. Tours are the company's business, so the
/// company confirms the money, cancels and checks groups in.
class OperatorBookingsTab extends StatelessWidget {
  const OperatorBookingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Booking>>(
      load: repo.listAllBookings,
      builder: (context, bookings, reload) => _page(reload, [
        PageHead(
          'Lượt đặt tour',
          subtitle: '${bookings.where((b) => b.status == BookingStatus.pending).length} lượt chờ công ty xác nhận',
        ),
        if (bookings.isEmpty)
          const StaffEmpty('Chưa có lượt đặt', icon: Icons.confirmation_number_outlined)
        else
          Stack10([
            for (final b in bookings)
              RowCard(
                key: Key('op-booking-${b.id}'),
                title: '${b.code} · ${b.contactName}',
                subtitle: b.tourName,
                meta:
                    '${formatDate(b.departureDate)} · ${b.guests} khách · ${formatVnd(b.total)} · ${b.paymentStatus.label}',
                trailing: b.checkedIn
                    ? const Pill('Đã điểm danh', tone: Tone.ok)
                    : Pill(b.status.label, tone: bookingTone(b.status)),
                onTap: () async {
                  await context.push('/operator/bookings/${b.id}');
                  await reload();
                },
              ),
          ]),
      ]),
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
              Row(
                children: [
                  Expanded(
                    child: Text(b.code, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  ),
                  Pill(b.status.label, tone: bookingTone(b.status)),
                ],
              ),
              const SizedBox(height: 8),
              DetailRow('Tour', b.tourName),
              DetailRow('Ngày đi', formatDateLong(b.departureDate)),
              DetailRow('Liên hệ', '${b.contactName} · ${b.phone}'),
              if (b.email.isNotEmpty) DetailRow('Email', b.email),
              if (b.note.isNotEmpty) DetailRow('Ghi chú', b.note),
              DetailRow('Số khách', '${b.adults} người lớn, ${b.children} trẻ em'),
              DetailRow('Tổng tiền', formatVnd(b.total)),
              DetailRow('Thanh toán', b.paymentStatus.label),
              DetailRow('Điểm danh', b.checkedIn ? 'Đã đến' : 'Chưa'),
              const SizedBox(height: 12),
              const InfoNote('Khách chuyển khoản vào tài khoản của công ty du lịch.', tone: Tone.neutral),
              if (canConfirm) ...[
                const SizedBox(height: 16),
                FilledButton.icon(
                  key: const Key('confirm-payment'),
                  icon: const Icon(Icons.price_check),
                  onPressed: () => run(
                    () => repo.recordPayment(reference: b.code, amount: b.total, recordedBy: user),
                    'Đã ghi nhận tiền về',
                  ),
                  label: Text('Xác nhận đã nhận ${formatVnd(b.total)}'),
                ),
              ],
              if (canCheckIn) ...[
                const SizedBox(height: 8),
                FilledButton.icon(
                  key: const Key('operator-checkin'),
                  icon: const Icon(Icons.how_to_reg),
                  onPressed: () => run(() => repo.checkIn(b.id), 'Đã điểm danh'),
                  label: const Text('Điểm danh đoàn đã đến'),
                ),
              ] else if (open && !b.checkedIn) ...[
                const SizedBox(height: 8),
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
      builder: (context, payments, reload) => _page(reload, [
        PageHead(
          'Thu tiền tour',
          subtitle: 'Đã nhận ${formatVnd(payments.fold<int>(0, (s, p) => s + p.amount))}. Sổ chỉ thêm, không sửa.',
        ),
        if (payments.isEmpty)
          const StaffEmpty('Chưa có khoản thu tour nào', icon: Icons.payments_outlined)
        else
          Stack10([
            for (final p in payments)
              RowCard(
                key: Key('op-payment-${p.id}'),
                title: p.reference,
                subtitle: '${formatDateTime(p.recordedAt)} · ${p.recordedBy}',
                trailing: Text(formatVnd(p.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
          ]),
      ]),
    );
  }
}
