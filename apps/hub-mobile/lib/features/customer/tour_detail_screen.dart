// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/local_store.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

/// Linked row ("Hợp tác xã", "Hộ đón khách") used on tour and HTX pages.
class LinkRow extends StatelessWidget {
  const LinkRow({super.key, required this.kind, required this.title, this.subtitle, required this.route, this.icon});
  final String kind;
  final String title;
  final String? subtitle;
  final String route;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => context.push(route),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F6EA),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFD8E5C8)),
        ),
        child: Row(
          children: [
            Icon(icon ?? Icons.place, size: 22, color: AppColors.amber),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(kind, style: const TextStyle(fontSize: 11, color: AppColors.faint)),
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  if (subtitle != null) Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.teaDark),
          ],
        ),
      ),
    ),
  );
}

/// Primary amber call-to-action pill.
class AmberButton extends StatelessWidget {
  const AmberButton({super.key, required this.label, required this.onPressed, this.buttonKey});
  final String label;
  final VoidCallback onPressed;
  final Key? buttonKey;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 54,
    width: double.infinity,
    child: FilledButton(
      key: buttonKey,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.amber,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
      onPressed: onPressed,
      child: Text(label, textAlign: TextAlign.center),
    ),
  );
}

const _page = Color(0xFFE6EFE3);
const _chip = Color(0xFFD8E8D1);
const _line = Color(0xFFCFE0CA);

String? _timeOf(String step) => RegExp(r'^(\d{1,2}):(\d{2})\s').firstMatch(step)?.group(0)?.trim();
String _textOf(String step) => step.replaceFirst(RegExp(r'^\d{1,2}:\d{2}\s+'), '');

/// 'Sáng sớm', 'Buổi sáng', ... for an itinerary time like '08:30'.
String _partOfDay(String time) {
  final h = int.tryParse(time.split(':').first) ?? 12;
  if (h < 9) return 'Sáng sớm';
  if (h < 11) return 'Buổi sáng';
  if (h < 13) return 'Buổi trưa';
  if (h < 17) return 'Buổi chiều';
  return 'Buổi tối';
}

class TourDetailScreen extends StatefulWidget {
  const TourDetailScreen({super.key, required this.tourId});
  final String tourId;

  @override
  State<TourDetailScreen> createState() => _TourDetailScreenState();
}

class _TourDetailScreenState extends State<TourDetailScreen> {
  int _tab = 1; // 0 Tổng quan, 1 Lịch trình, 2 Bao gồm

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return Scaffold(
      backgroundColor: _page,
      body: LoadView<(Tour, Htx, List<Departure>, Household?)>(
        load: () async {
          final tour = await repo.getTour(widget.tourId);
          Household? host;
          try {
            host = await repo.getHousehold(tour.householdId);
          } on HubException {
            host = null;
          }
          return (tour, await repo.getHtx(tour.htxCode), await repo.listDepartures(widget.tourId), host);
        },
        builder: (context, data, reload) {
          final (tour, htx, departures, host) = data;
          return Stack(
            children: [
              ListView(
                padding: EdgeInsets.only(bottom: 120 + MediaQuery.paddingOf(context).bottom),
                children: [
                  _Hero(tour: tour),
                  Transform.translate(
                    offset: const Offset(0, -34),
                    child: Container(
                      decoration: const BoxDecoration(
                        color: _page,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                      ),
                      padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (tour.tags.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                              decoration: BoxDecoration(color: _chip, borderRadius: BorderRadius.circular(999)),
                              child: Text(
                                tour.tags.first,
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.ink,
                                ),
                              ),
                            ),
                          const SizedBox(height: 10),
                          Text(
                            tour.name,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                              height: 1.2,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.location_on, size: 20, color: AppColors.ink),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  '${shortHtxName(htx)}, ${htx.province}',
                                  style: const TextStyle(fontSize: 15, color: AppColors.ink),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          _Tabs(index: _tab, onChanged: (i) => setState(() => _tab = i)),
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
                            child: switch (_tab) {
                              0 => _Overview(tour: tour, htx: htx, host: host),
                              1 => _Itinerary(tour: tour),
                              _ => _Includes(tour: tour),
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12 + MediaQuery.paddingOf(context).bottom,
                child: _BookBar(tour: tour, departures: departures),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The photo across the top, with the back and heart buttons and two leaves.
class _Hero extends StatelessWidget {
  const _Hero({required this.tour});
  final Tour tour;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return SizedBox(
      height: 300 + top,
      child: Stack(
        fit: StackFit.expand,
        children: [
          TeaPhoto(asset: teaPhotoFor(tour.gradientSeed)),
          Positioned(
            top: top + 14,
            left: 16,
            child: _RoundButton(
              buttonKey: const Key('back'),
              icon: Icons.chevron_left,
              label: 'Quay lại',
              onTap: () => context.canPop() ? context.pop() : context.go('/shop'),
            ),
          ),
          Positioned(
            top: top + 14,
            right: 16,
            child: _SaveButton(tourId: tour.id),
          ),
          const Positioned(right: 4, bottom: 18, child: IgnorePointer(child: _Leaves())),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.buttonKey,
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });
  final Key buttonKey;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: label,
    child: Material(
      color: Colors.white,
      shape: const CircleBorder(),
      child: InkWell(
        key: buttonKey,
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: 50, height: 50, child: Icon(icon, size: 26, color: color ?? AppColors.ink)),
      ),
    ),
  );
}

/// The heart: keeps the tour among the customer's saved tours on this device.
class _SaveButton extends StatefulWidget {
  const _SaveButton({required this.tourId});
  final String tourId;
  @override
  State<_SaveButton> createState() => _SaveButtonState();
}

class _SaveButtonState extends State<_SaveButton> {
  late bool _saved = context.read<LocalStore>().savedTours().contains(widget.tourId);

  Future<void> _toggle() async {
    final store = context.read<LocalStore>();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _saved = !_saved);
    await store.setTourSaved(widget.tourId, _saved);
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(_saved ? 'Đã lưu tour vào mục yêu thích' : 'Đã bỏ khỏi mục yêu thích')));
  }

  @override
  Widget build(BuildContext context) => _RoundButton(
    buttonKey: const Key('tour-save'),
    icon: _saved ? Icons.favorite : Icons.favorite_border,
    color: _saved ? AppColors.danger : AppColors.ink,
    label: _saved ? 'Bỏ yêu thích' : 'Yêu thích',
    onTap: _toggle,
  );
}

class _Leaves extends StatelessWidget {
  const _Leaves();
  @override
  Widget build(BuildContext context) => CustomPaint(size: const Size(110, 80), painter: _LeavesPainter());
}

class _LeavesPainter extends CustomPainter {
  void _leaf(Canvas canvas, Offset c, double len, double angle, Color color) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(angle);
    final path = Path()
      ..moveTo(0, -len / 2)
      ..quadraticBezierTo(len * 0.42, -len * 0.05, 0, len / 2)
      ..quadraticBezierTo(-len * 0.42, -len * 0.05, 0, -len / 2);
    canvas.drawPath(path, Paint()..color = color);
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    _leaf(canvas, Offset(size.width * 0.38, size.height * 0.55), 58, -0.9, AppColors.leaf);
    _leaf(canvas, Offset(size.width * 0.72, size.height * 0.45), 64, 0.55, AppColors.leafDark);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.index, required this.onChanged});
  final int index;
  final ValueChanged<int> onChanged;
  static const _labels = ['Tổng quan', 'Lịch trình', 'Bao gồm'];

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(6),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
    child: Row(
      children: [
        for (var i = 0; i < _labels.length; i++)
          Expanded(
            child: Material(
              color: i == index ? AppColors.teaDark : Colors.transparent,
              shape: const StadiumBorder(),
              child: InkWell(
                key: Key('tour-tab-$i'),
                customBorder: const StadiumBorder(),
                onTap: () => onChanged(i),
                child: SizedBox(
                  height: 46,
                  child: Center(
                    child: Text(
                      _labels[i],
                      style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                        color: i == index ? Colors.white : AppColors.ink,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _Overview extends StatelessWidget {
  const _Overview({required this.tour, required this.htx, required this.host});
  final Tour tour;
  final Htx htx;
  final Household? host;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(tour.summary, style: const TextStyle(fontSize: 15.5, height: 1.5, color: AppColors.ink)),
      const SizedBox(height: 14),
      _InfoLine(icon: Icons.calendar_month_outlined, label: 'Tháng đẹp', value: tour.bestMonths),
      _InfoLine(icon: Icons.hiking, label: 'Mức độ', value: tour.level),
      _InfoLine(
        icon: Icons.payments_outlined,
        label: 'Giá',
        value: 'Người lớn ${formatVnd(tour.adultPrice)} · Trẻ em ${formatVnd(tour.childPrice)}',
      ),
      const SizedBox(height: 12),
      LinkRow(
        kind: 'Hợp tác xã',
        title: shortHtxName(htx),
        subtitle: 'Hồ sơ HTX · các hộ đón khách',
        icon: Icons.account_balance_outlined,
        route: '/shop/htx/${htx.code}',
      ),
      if (host != null)
        LinkRow(
          kind: 'Hộ nông dân đón khách',
          title: '${host!.name} · ${host!.village.split(',').first}',
          subtitle: 'Xem quy trình sản xuất chè của hộ',
          icon: Icons.home_work_outlined,
          route: '/shop/farm/${host!.id}',
        ),
      const SizedBox(height: 4),
      SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          key: const Key('tour-visit-request'),
          onPressed: () => context.push('/shop/visit?household=${tour.householdId}&tour=${tour.id}'),
          child: const Text('Muốn ghé thăm hộ nông dân? Gửi yêu cầu tham quan'),
        ),
      ),
    ],
  );
}

class _InfoLine extends StatelessWidget {
  const _InfoLine({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.teaDark),
        const SizedBox(width: 10),
        SizedBox(
          width: 82,
          child: Text(label, style: const TextStyle(fontSize: 14, color: AppColors.muted)),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  );
}

/// The itinerary as a vertical timeline: part of the day and time, then the step.
class _Itinerary extends StatelessWidget {
  const _Itinerary({required this.tour});
  final Tour tour;

  @override
  Widget build(BuildContext context) {
    final multiDay = tour.itinerary.length > 1;
    final rows = <Widget>[];
    for (final day in tour.itinerary) {
      if (multiDay) {
        rows.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 8, top: 4),
            child: Text(
              day.title,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.teaDark),
            ),
          ),
        );
      }
      for (var i = 0; i < day.steps.length; i++) {
        final step = day.steps[i];
        final time = _timeOf(step);
        rows.add(
          _StepRow(
            label: time == null ? null : '${_partOfDay(time)} · $time',
            text: _textOf(step),
            last: i == day.steps.length - 1,
          ),
        );
      }
    }
    return Column(key: const Key('tour-itinerary'), crossAxisAlignment: CrossAxisAlignment.start, children: rows);
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.label, required this.text, required this.last});
  final String? label;
  final String text;
  final bool last;

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: 26,
          child: Column(
            children: [
              const SizedBox(height: 3),
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: AppColors.teaDark,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: _chip, width: 4),
                ),
              ),
              if (!last) Expanded(child: Container(width: 2.5, color: _line)),
            ],
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: last ? 0 : 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (label != null)
                  Text(
                    label!,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.teaGreen),
                  ),
                Text(
                  text,
                  style: const TextStyle(
                    fontSize: 16.5,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                    color: AppColors.ink,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

class _Includes extends StatelessWidget {
  const _Includes({required this.tour});
  final Tour tour;
  @override
  Widget build(BuildContext context) => tour.includes.isEmpty
      ? const Text('Hợp tác xã chưa ghi danh sách. Hãy hỏi khi đặt tour.', style: TextStyle(color: AppColors.muted))
      : Column(
          key: const Key('tour-includes'),
          children: [
            for (final item in tour.includes)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle, size: 20, color: AppColors.teaDark),
                    const SizedBox(width: 10),
                    Expanded(child: Text(item, style: const TextStyle(fontSize: 15.5, height: 1.35))),
                  ],
                ),
              ),
          ],
        );
}

/// Floating bar: the starting price and the main action. A guest signs in first and comes back to this page.
class _BookBar extends StatelessWidget {
  const _BookBar({required this.tour, required this.departures});
  final Tour tour;
  final List<Departure> departures;

  void _book(BuildContext context) {
    if (context.read<AppState>().claims == null) {
      final here = GoRouterState.of(context).uri.toString();
      context.push('/login?from=${Uri.encodeComponent(here)}');
      return;
    }
    final open = departures.where((d) => d.seatsLeft > 0).toList();
    context.push('/shop/booking/${tour.id}?dep=${open.isEmpty ? '' : open.first.id}');
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 12, 12, 12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(28),
      boxShadow: const [BoxShadow(color: Color(0x1A143C2D), blurRadius: 18, offset: Offset(0, 6))],
    ),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Giá từ', style: TextStyle(fontSize: 14, color: AppColors.muted)),
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: formatVnd(tour.adultPrice),
                        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Colors.black),
                      ),
                      const TextSpan(
                        text: '  / người',
                        style: TextStyle(fontSize: 15, color: AppColors.ink),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          height: 58,
          child: FilledButton.icon(
            key: const Key('tour-book'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.teaDark,
              shape: const StadiumBorder(),
              padding: const EdgeInsets.symmetric(horizontal: 26),
              textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
            ),
            onPressed: () => _book(context),
            icon: const Icon(Icons.arrow_forward),
            iconAlignment: IconAlignment.end,
            label: const Text('Đặt ngay'),
          ),
        ),
      ],
    ),
  );
}
