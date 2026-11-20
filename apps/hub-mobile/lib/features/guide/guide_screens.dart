// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/order.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_shell.dart';
import 'guide_widgets.dart';
import '../staff/staff_widgets.dart';

/// Everything the guide's home and schedule pages show, loaded once.
class _GuideData {
  const _GuideData(this.trips, this.tours);
  final List<GuideTrip> trips;
  final List<Tour> tours;

  List<GuideTrip> upcoming(DateTime today) => trips.where((t) => !t.date.isBefore(today)).toList();
  List<GuideTrip> past(DateTime today) => trips.where((t) => t.date.isBefore(today)).toList().reversed.toList();
}

Future<_GuideData> _loadGuide(HubRepository repo, String id) async {
  final tours = await repo.listGuideTours(id);
  final bookings = await repo.listGuideBookings(id);
  final htxs = {for (final h in await repo.listHtxs()) h.code: h.name};
  final trips = <GuideTrip>[
    for (final tour in tours)
      for (final dep in await repo.listDepartures(tour.id))
        GuideTrip(
          tour: tour,
          departure: dep,
          htxName: htxs[tour.htxCode] ?? tour.htxCode,
          guests: bookings
              .where((b) => b.departureId == dep.id && b.status != BookingStatus.cancelled)
              .fold<int>(0, (n, b) => n + b.guests),
        ),
  ]..sort((a, b) => a.date.compareTo(b.date));
  return _GuideData(trips, tours);
}

/// Overview: the next trip with its photo, three numbers and the nearest trips.
class GuideHomePage extends StatelessWidget {
  const GuideHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final claims = context.read<AppState>().claims!;
    return LoadView<_GuideData>(
      load: () => _loadGuide(repo, claims.subject),
      builder: (context, data, reload) {
        final today = DateUtils.dateOnly(DateTime.now());
        final upcoming = data.upcoming(today);
        final next = upcoming.firstOrNull;
        final guests = upcoming.fold<int>(0, (n, t) => n + t.guests);
        Future<void> open(GuideTrip t) async {
          await context.push('/guide/tours/${t.tour.id}');
          await reload();
        }

        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              PageHead('Xin chào, ${claims.name}', subtitle: 'Nhân viên dẫn tour · các tour HTX giao cho bạn'),
              if (data.tours.isEmpty) const StaffEmpty('Chưa có tour nào được giao'),
              if (next != null)
                InkWell(
                  key: Key('guide-next-${next.departure.id}'),
                  borderRadius: BorderRadius.circular(22),
                  onTap: () => open(next),
                  child: GuideCover(
                    tour: next.tour,
                    height: 190,
                    top: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        const GuideChip('Chuyến tiếp theo', highlight: true, icon: Icons.flag_outlined),
                        GuideChip(guideCountdown(next.date, today)),
                      ],
                    ),
                    footer: Text(
                      '${formatDate(next.date)} · ${next.guests} khách · Do ${next.htxName} giao',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 13.5),
                    ),
                  ),
                ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: GuideStat(
                      value: '${data.tours.length}',
                      label: 'Tour được giao',
                      icon: Icons.route_outlined,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GuideStat(value: '${upcoming.length}', label: 'Chuyến sắp tới', icon: Icons.event_outlined),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GuideStat(value: '$guests', label: 'Khách sắp đón', icon: Icons.groups_outlined),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  const Expanded(
                    child: Text('Sắp tới', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  TextButton(
                    key: const Key('guide-see-schedule'),
                    onPressed: () => context.go('/guide/schedule'),
                    child: const Text('Xem lộ trình'),
                  ),
                ],
              ),
              if (upcoming.isEmpty) const Text('Chưa có lịch sắp tới'),
              for (final trip in upcoming.take(3))
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: GuideTripCard(
                    key: Key('guide-departure-${trip.departure.id}'),
                    trip: trip,
                    today: today,
                    onTap: () => open(trip),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// "Lộ trình": every assigned tour as a timeline by date, upcoming first.
class GuideSchedulePage extends StatefulWidget {
  const GuideSchedulePage({super.key});
  @override
  State<GuideSchedulePage> createState() => _GuideSchedulePageState();
}

class _GuideSchedulePageState extends State<GuideSchedulePage> {
  bool _past = false;

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final id = context.read<AppState>().claims!.subject;
    return LoadView<_GuideData>(
      load: () => _loadGuide(repo, id),
      builder: (context, data, reload) {
        final today = DateUtils.dateOnly(DateTime.now());
        final trips = _past ? data.past(today) : data.upcoming(today);
        final unscheduled = data.tours.where((t) => !data.trips.any((e) => e.tour.id == t.id)).toList();
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const PageHead('Lộ trình', subtitle: 'Danh sách các tour được giao, theo ngày khởi hành.'),
              SegmentedButton<bool>(
                key: const Key('guide-schedule-filter'),
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: false, label: Text('Sắp tới (${data.upcoming(today).length})')),
                  ButtonSegment(value: true, label: Text('Đã qua (${data.past(today).length})')),
                ],
                selected: {_past},
                onSelectionChanged: (v) => setState(() => _past = v.first),
              ),
              const SizedBox(height: 16),
              if (trips.isEmpty) StaffEmpty(_past ? 'Chưa có chuyến đã qua' : 'Chưa có lịch sắp tới'),
              for (var i = 0; i < trips.length; i++)
                _TimelineRow(
                  key: Key('guide-departure-${trips[i].departure.id}'),
                  last: i == trips.length - 1,
                  trip: trips[i],
                  today: today,
                  onTap: () async {
                    await context.push('/guide/tours/${trips[i].tour.id}');
                    await reload();
                  },
                ),
              if (unscheduled.isNotEmpty && !_past) ...[
                const SizedBox(height: 12),
                const Text('Chưa có lịch', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                for (final tour in unscheduled)
                  Card(
                    child: ListTile(
                      title: Text(tour.name),
                      subtitle: const Text('HTX chưa mở ngày khởi hành'),
                      onTap: () => context.push('/guide/tours/${tour.id}'),
                    ),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// A trip card with the vertical timeline line on its left.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({super.key, required this.trip, required this.today, required this.onTap, required this.last});
  final GuideTrip trip;
  final DateTime today;
  final VoidCallback onTap;
  final bool last;

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 20,
          child: Column(
            children: [
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 18),
                decoration: BoxDecoration(
                  color: trip.date.isAfter(today) ? Colors.white : StaffColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: StaffColors.primary, width: 2),
                ),
              ),
              if (!last) Expanded(child: Container(width: 2, color: StaffColors.border)),
            ],
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GuideTripCard(trip: trip, today: today, onTap: onTap),
          ),
        ),
      ],
    ),
  );
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
            GuideCover(
              tour: data.$1,
              height: 160,
              footer: Text('Do ${data.$4.name} giao', style: const TextStyle(color: Colors.white, fontSize: 13.5)),
            ),
            const SizedBox(height: 12),
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
            if (data.$1.briefing.isNotEmpty)
              SectionCard(key: const Key('guide-briefing'), title: 'Dặn dò của HTX', child: Text(data.$1.briefing)),
            if (data.$1.itinerary.isNotEmpty)
              SectionCard(
                key: const Key('guide-itinerary'),
                title: 'Lộ trình tour',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final day in data.$1.itinerary) ...[
                      Text(day.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      for (final step in day.steps)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Padding(
                                padding: EdgeInsets.only(top: 3, right: 8),
                                child: Icon(Icons.circle, size: 7, color: StaffColors.primary),
                              ),
                              Expanded(child: Text(step)),
                            ],
                          ),
                        ),
                      const SizedBox(height: 10),
                    ],
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
                        if (booking.phone.isNotEmpty)
                          Row(
                            children: [
                              Expanded(child: Text(booking.phone)),
                              IconButton(
                                key: Key('guide-copy-phone-${booking.id}'),
                                tooltip: 'Sao chép số điện thoại khách',
                                icon: const Icon(Icons.copy, size: 20),
                                onPressed: () async {
                                  await Clipboard.setData(ClipboardData(text: booking.phone));
                                  if (context.mounted) showMessage(context, 'Đã sao chép số điện thoại khách');
                                },
                              ),
                            ],
                          ),
                        if (booking.note.isNotEmpty) Text('Ghi chú của khách: ${booking.note}'),
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
