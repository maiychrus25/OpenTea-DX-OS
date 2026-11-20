// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

class GuideHomePage extends StatelessWidget {
  const GuideHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final id = context.read<AppState>().claims!.subject;
    return LoadView<(List<(Tour, Departure)>, List<Booking>, List<Htx>, List<Tour>)>(
      load: () async {
        final tours = await repo.listGuideTours(id);
        final departures = <(Tour, Departure)>[
          for (final tour in tours)
            for (final dep in await repo.listDepartures(tour.id)) (tour, dep),
        ]..sort((a, b) => a.$2.date.compareTo(b.$2.date));
        return (departures, await repo.listGuideBookings(id), await repo.listHtxs(), tours);
      },
      builder: (context, data, reload) {
        final today = DateUtils.dateOnly(DateTime.now());
        String assignedBy(Tour tour) => 'Do ${data.$3.firstWhere((h) => h.code == tour.htxCode).name} giao';
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const PageHead('Tour được giao', subtitle: 'Nhân viên dẫn tour · chỉ xem và điểm danh đoàn.'),
              if (data.$4.isEmpty) const StaffEmpty('Chưa có tour nào được giao'),
              for (final past in [false, true]) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    past ? 'Đã qua' : 'Sắp tới',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                for (final entry in data.$1.where((e) => e.$2.date.isBefore(today) == past))
                  Card(
                    key: Key('guide-departure-${entry.$2.id}'),
                    child: InkWell(
                      onTap: () async {
                        await context.push('/guide/tours/${entry.$1.id}');
                        await reload();
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(entry.$1.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 8),
                            Text(
                              '${formatDate(entry.$2.date)} · ${data.$2.where((b) => b.departureId == entry.$2.id && b.status != BookingStatus.cancelled).fold<int>(0, (n, b) => n + b.guests)} khách',
                            ),
                            Text(assignedBy(entry.$1)),
                          ],
                        ),
                      ),
                    ),
                  ),
                if (!data.$1.any((e) => e.$2.date.isBefore(today) == past))
                  Text(past ? 'Chưa có chuyến đã qua' : 'Chưa có lịch sắp tới'),
              ],
              for (final tour in data.$4.where((t) => !data.$1.any((e) => e.$1.id == t.id)))
                Card(
                  child: ListTile(
                    title: Text(tour.name),
                    subtitle: Text('Chưa có lịch · ${assignedBy(tour)}'),
                    onTap: () => context.push('/guide/tours/${tour.id}'),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class GuideTourDetailPage extends StatefulWidget {
  const GuideTourDetailPage({super.key, required this.tourId});
  final String tourId;
  @override
  State<GuideTourDetailPage> createState() => _GuideTourDetailPageState();
}

class _GuideTourDetailPageState extends State<GuideTourDetailPage> {
  final _checking = <String>{};

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final actor = context.read<AppState>().claims!;
    return DetailScaffold(
      title: 'Chi tiết tour',
      body: LoadView<(Tour, List<Departure>, List<Booking>, Htx)>(
        load: () async {
          final tour = (await repo.listGuideTours(actor.subject)).where((t) => t.id == widget.tourId).firstOrNull;
          if (tour == null) throw const HubException('Tour này chưa được giao cho bạn.');
          return (
            tour,
            await repo.listDepartures(tour.id),
            await repo.listGuideBookings(actor.subject, tourId: tour.id),
            await repo.getHtx(tour.htxCode),
          );
        },
        builder: (context, data, reload) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageHead(data.$1.name, subtitle: 'Do ${data.$4.name} giao'),
            SectionCard(
              title: 'Liên hệ HTX',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(data.$4.name),
                  Text(data.$4.province),
                  Text(data.$4.contactPhone),
                  if (data.$4.contactPhone.isNotEmpty)
                    TextButton.icon(
                      icon: const Icon(Icons.copy),
                      label: const Text('Sao chép số điện thoại'),
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: data.$4.contactPhone));
                        if (context.mounted) showMessage(context, 'Đã sao chép số điện thoại HTX');
                      },
                    ),
                ],
              ),
            ),
            for (final dep in data.$2) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'Khởi hành ${formatDate(dep.date)}',
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ),
              if (!data.$3.any((b) => b.departureId == dep.id)) const Text('Chưa có đoàn đặt chỗ'),
              for (final booking in data.$3.where((b) => b.departureId == dep.id))
                Card(
                  key: Key('guide-booking-${booking.id}'),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(booking.code, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${booking.contactName} · ${booking.guests} khách'),
                        Text(booking.paymentStatus.label),
                        Text(booking.status.label),
                        if (booking.checkedIn) const Text('Đã điểm danh'),
                        if (booking.status == BookingStatus.confirmed && !booking.checkedIn)
                          FilledButton.icon(
                            key: Key('guide-checkin-${booking.id}'),
                            icon: const Icon(Icons.how_to_reg),
                            label: const Text('Điểm danh đoàn đã đến'),
                            onPressed: _checking.contains(booking.id)
                                ? null
                                : () async {
                                    setState(() => _checking.add(booking.id));
                                    try {
                                      await repo.checkIn(booking.id, actor: actor);
                                      await reload();
                                    } on HubException catch (error) {
                                      if (context.mounted) showMessage(context, error.message);
                                    } finally {
                                      if (mounted) setState(() => _checking.remove(booking.id));
                                    }
                                  },
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Current assignments, not a fabricated company-wide notification feed.
class GuideNotificationsPage extends StatelessWidget {
  const GuideNotificationsPage({super.key});
  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final id = context.read<AppState>().claims!.subject;
    return LoadView<(List<Tour>, List<Htx>)>(
      load: () async => (await repo.listGuideTours(id), await repo.listHtxs()),
      builder: (context, data, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const PageHead('Thông báo', subtitle: 'Các phân công hiện tại của bạn từ HTX.'),
            if (data.$1.isEmpty) const StaffEmpty('Chưa có phân công nào'),
            for (final tour in data.$1)
              Card(
                child: ListTile(
                  title: Text(tour.name),
                  subtitle: Text('Do ${data.$2.firstWhere((h) => h.code == tour.htxCode).name} giao'),
                  onTap: () => context.push('/guide/tours/${tour.id}'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
