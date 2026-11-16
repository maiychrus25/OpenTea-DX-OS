// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

class BookingFormScreen extends StatefulWidget {
  const BookingFormScreen({super.key, required this.tourId, required this.departureId});
  final String tourId;
  final String departureId;

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

String _two(int n) => n.toString().padLeft(2, '0');
String _dayMonth(DateTime d) => '${_two(d.day)}/${_two(d.month)}';
String _fullDate(DateTime d) => '${_two(d.day)}/${_two(d.month)}/${d.year}';

// Page colours of this screen (the approved booking design).
const _page = Color(0xFFE6EFE3);
const _band = Color(0xFFF1F6EF);
const _soft = Color(0xFFEDF3EA);
const _line = Color(0xFFCFE0CA);

class _BookingFormScreenState extends State<BookingFormScreen> {
  late final _name = TextEditingController(text: context.read<AppState>().claims?.name ?? '');
  late final _email = TextEditingController(text: context.read<AppState>().claims?.email ?? '');
  final _phone = TextEditingController();
  final _note = TextEditingController();
  final _guestName = TextEditingController();

  /// The first day of the trip. Any day from tomorrow on; null until the tour is loaded.
  DateTime? _start;
  int _adults = 1;
  int _children = 0;
  bool _onBehalf = false;
  bool _busy = false;
  bool _showErrors = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _note.dispose();
    _guestName.dispose();
    super.dispose();
  }

  bool get _emailBad {
    final e = _email.text.trim();
    return e.isNotEmpty && !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(e);
  }

  bool get _invalid =>
      _name.text.trim().isEmpty ||
      _phone.text.trim().length < 9 ||
      _emailBad ||
      (_onBehalf && _guestName.text.trim().isEmpty);

  static DateTime _dayOf(DateTime d) => DateTime(d.year, d.month, d.day);
  static DateTime get _tomorrow {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + 1);
  }

  /// The tour's departure on [day], if the cooperative already opened one.
  static Departure? _departureOn(List<Departure> all, DateTime day) {
    for (final d in all) {
      if (_dayOf(d.date) == day) return d;
    }
    return null;
  }

  static int _seatsOn(List<Departure> all, Tour tour, DateTime day) =>
      _departureOn(all, day)?.seatsLeft ?? tour.maxGuests;

  void _selectStart(DateTime day, List<Departure> all, Tour tour) {
    final seats = _seatsOn(all, tour, day);
    setState(() {
      _start = day;
      // Never keep more guests than the chosen day has seats.
      while (_adults + _children > seats && _children > 0) {
        _children--;
      }
      while (_adults + _children > seats && _adults > 1) {
        _adults--;
      }
    });
  }

  /// A month calendar from tomorrow on. With [end] it picks the last day of the tour and the first day follows.
  Future<void> _pickDate(List<Departure> all, Tour tour, DateTime start, {required bool end}) async {
    final shift = Duration(days: end ? tour.days - 1 : 0);
    final first = _tomorrow.add(shift);
    final last = _tomorrow.add(const Duration(days: 365));
    final current = start.add(shift);
    final picked = await showDatePicker(
      context: context,
      initialDate: current.isBefore(first) ? first : current,
      firstDate: first,
      lastDate: last,
      helpText: end ? 'Chọn ngày về' : 'Chọn ngày đi',
      cancelText: 'Huỷ',
      confirmText: 'Chọn',
      initialEntryMode: DatePickerEntryMode.calendarOnly,
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.teaDark, onPrimary: Colors.white),
          datePickerTheme: DatePickerThemeData(
            backgroundColor: Colors.white,
            headerBackgroundColor: _band,
            headerForegroundColor: AppColors.ink,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) _selectStart(_dayOf(picked).subtract(shift), all, tour);
  }

  Future<void> _submit(Tour tour, Departure? dep, DateTime start) async {
    if (_invalid) {
      setState(() => _showErrors = true);
      return;
    }
    final activity = context.read<ActivityController>();
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final userId = context.read<AppState>().claims!.subject;
    // The booking model has one contact name: a booking made for someone else keeps both names in it.
    final contact = _onBehalf ? '${_name.text.trim()} (đặt hộ ${_guestName.text.trim()})' : _name.text.trim();
    setState(() => _busy = true);
    try {
      final booking = await activity.createBooking(
        NewBooking(
          customerId: userId,
          tourId: tour.id,
          departureId: dep?.id ?? '',
          date: start,
          contactName: contact,
          phone: _phone.text.trim(),
          email: _email.text.trim(),
          note: _note.text.trim(),
          adults: _adults,
          children: _children,
        ),
      );
      router.go('/shop/pay/${Uri.encodeComponent(booking.code)}');
    } on HubException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return Scaffold(
      backgroundColor: _page,
      body: LoadView<(Tour, Htx, List<Departure>)>(
        load: () async {
          final tour = await repo.getTour(widget.tourId);
          return (tour, await repo.getHtx(tour.htxCode), await repo.listDepartures(widget.tourId));
        },
        builder: (context, data, _) {
          final (tour, htx, all) = data;
          // The first day: the departure the customer came from, else tomorrow; then whatever they pick.
          final opened = all.where((d) => d.id == widget.departureId).map((d) => _dayOf(d.date));
          final start =
              _start ?? (opened.isNotEmpty && opened.first.isAfter(DateTime.now()) ? opened.first : _tomorrow);
          final dep = _departureOn(all, start);
          final seats = _seatsOn(all, tour, start);
          final days = tour.days;
          final end = start.add(Duration(days: days - 1));
          final guests = _adults + _children;
          final canAdd = guests < seats;
          final total = _adults * tour.adultPrice + _children * tour.childPrice;
          return Stack(
            children: [
              ListView(
                padding: EdgeInsets.only(bottom: 120 + MediaQuery.paddingOf(context).bottom),
                children: [
                  _Header(tour: tour, htx: htx),
                  _Card(
                    title: 'Ngày đi',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _DateBox(
                                key: const Key('booking-from'),
                                label: 'Từ ngày',
                                value: _fullDate(start),
                                onTap: () => _pickDate(all, tour, start, end: false),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: _DateBox(
                                key: const Key('booking-to'),
                                label: 'Đến ngày',
                                value: _fullDate(end),
                                onTap: () => _pickDate(all, tour, start, end: true),
                              ),
                            ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 12, 8, 0),
                          child: Text(
                            '$days ngày · ${_dayMonth(start)} → ${_dayMonth(end)}',
                            key: const Key('booking-span'),
                            style: const TextStyle(fontSize: 14, color: AppColors.muted),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _Card(
                    title: 'Số khách',
                    child: Column(
                      children: [
                        _GuestRow(
                          keyPrefix: 'adult',
                          icon: Icons.person,
                          title: 'Người lớn',
                          subtitle: 'Từ 12 tuổi trở lên',
                          value: _adults,
                          min: 1,
                          canIncrease: canAdd,
                          onChanged: (v) => setState(() => _adults = v),
                        ),
                        const SizedBox(height: 12),
                        _GuestRow(
                          keyPrefix: 'child',
                          icon: Icons.groups,
                          title: 'Trẻ em',
                          subtitle: 'Từ 6 – 11 tuổi',
                          value: _children,
                          min: 0,
                          canIncrease: canAdd,
                          onChanged: (v) => setState(() => _children = v),
                        ),
                      ],
                    ),
                  ),
                  _Card(
                    title: 'Thông tin liên hệ',
                    child: Column(
                      children: [
                        _Field(
                          fieldKey: const Key('booking-name'),
                          hint: 'Họ và tên *',
                          icon: Icons.person,
                          controller: _name,
                          error: _showErrors && _name.text.trim().isEmpty ? 'Nhập họ tên' : null,
                        ),
                        const SizedBox(height: 14),
                        _Field(
                          fieldKey: const Key('booking-phone'),
                          hint: 'Số điện thoại *',
                          icon: Icons.phone,
                          controller: _phone,
                          keyboard: TextInputType.phone,
                          error: _showErrors && _phone.text.trim().length < 9 ? 'Nhập số điện thoại hợp lệ' : null,
                        ),
                        const SizedBox(height: 14),
                        _Field(
                          fieldKey: const Key('booking-email'),
                          hint: 'Email (tuỳ chọn)',
                          icon: Icons.mail,
                          controller: _email,
                          keyboard: TextInputType.emailAddress,
                          error: _showErrors && _emailBad ? 'Email không hợp lệ' : null,
                        ),
                        const SizedBox(height: 14),
                        _Field(
                          fieldKey: const Key('booking-note'),
                          hint: 'Ghi chú (tuỳ chọn)',
                          icon: Icons.chat_outlined,
                          controller: _note,
                          maxLines: 3,
                          maxLength: 200,
                        ),
                        InkWell(
                          key: const Key('booking-on-behalf'),
                          borderRadius: BorderRadius.circular(8),
                          onTap: () => setState(() => _onBehalf = !_onBehalf),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: Checkbox(
                                    value: _onBehalf,
                                    onChanged: (v) => setState(() => _onBehalf = v ?? false),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                const Text('Đặt hộ người khác', style: TextStyle(fontSize: 14.5)),
                              ],
                            ),
                          ),
                        ),
                        if (_onBehalf) ...[
                          const SizedBox(height: 8),
                          _Field(
                            fieldKey: const Key('booking-guest-name'),
                            hint: 'Họ tên người đi tour *',
                            icon: Icons.badge_outlined,
                            controller: _guestName,
                            error: _showErrors && _guestName.text.trim().isEmpty ? 'Nhập họ tên người đi' : null,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12 + MediaQuery.paddingOf(context).bottom,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(20, 14, 12, 14),
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
                            Text(
                              'Tạm tính · $days ngày · $guests khách',
                              key: const Key('booking-bar-label'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, color: AppColors.ink),
                            ),
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                formatVnd(total),
                                key: const Key('booking-bar-total'),
                                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Colors.black),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(width: 1, height: 52, color: _line),
                      const SizedBox(width: 14),
                      SizedBox(
                        height: 58,
                        child: FilledButton.icon(
                          key: const Key('booking-submit'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.teaDark,
                            shape: const StadiumBorder(),
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                          ),
                          onPressed: _busy ? null : () => _submit(tour, dep, start),
                          icon: const Icon(Icons.arrow_forward),
                          iconAlignment: IconAlignment.end,
                          label: const Text('Tiếp tục'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// The top of the screen: a lighter band with hills and two leaves, the back button and title, then the tour.
class _Header extends StatelessWidget {
  const _Header({required this.tour, required this.htx});
  final Tour tour;
  final Htx htx;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      children: [
        Positioned.fill(bottom: 90, child: CustomPaint(painter: _HillsPainter())),
        Positioned(
          top: top,
          right: 0,
          child: const IgnorePointer(child: _LeafDecor()),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, top + 14, 20, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const _RoundBack(),
                  const SizedBox(width: 18),
                  const Text(
                    'Đặt tour',
                    style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppColors.ink),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Row(
                children: [
                  Expanded(flex: 11, child: TeaPhoto(asset: teaPhotoFor(tour.gradientSeed), height: 150, radius: 22)),
                  const SizedBox(width: 20),
                  Expanded(
                    flex: 10,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tour.name,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w700,
                            height: 1.25,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.location_on, size: 20, color: AppColors.ink),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '${shortHtxName(htx)}, ${htx.province}',
                                style: const TextStyle(fontSize: 15, color: AppColors.ink, height: 1.35),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RoundBack extends StatelessWidget {
  const _RoundBack();
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Quay lại',
    child: Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 1,
      shadowColor: const Color(0x22143C2D),
      child: InkWell(
        key: const Key('back'),
        customBorder: const CircleBorder(),
        onTap: () => context.canPop() ? context.pop() : context.go('/shop'),
        child: const SizedBox(width: 56, height: 56, child: Icon(Icons.chevron_left, size: 30, color: AppColors.ink)),
      ),
    ),
  );
}

class _HillsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    canvas.drawRect(Offset.zero & size, Paint()..color = _band);
    final far = Path()
      ..moveTo(0, h * 0.55)
      ..lineTo(w * 0.18, h * 0.32)
      ..lineTo(w * 0.36, h * 0.5)
      ..lineTo(w * 0.55, h * 0.22)
      ..lineTo(w * 0.78, h * 0.48)
      ..lineTo(w, h * 0.3)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(far, Paint()..color = const Color(0xFFE3EDDF));
    final near = Path()
      ..moveTo(0, h * 0.78)
      ..quadraticBezierTo(w * 0.3, h * 0.6, w * 0.55, h * 0.74)
      ..quadraticBezierTo(w * 0.8, h * 0.86, w, h * 0.7)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..close();
    canvas.drawPath(near, Paint()..color = const Color(0xFFDCE8D7));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Two leaves in the top right corner.
class _LeafDecor extends StatelessWidget {
  const _LeafDecor();
  @override
  Widget build(BuildContext context) => CustomPaint(size: const Size(140, 130), painter: _LeafPainter());
}

class _LeafPainter extends CustomPainter {
  void _leaf(Canvas canvas, Offset c, double len, double angle, Color color) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(angle);
    final path = Path()
      ..moveTo(0, -len / 2)
      ..quadraticBezierTo(len * 0.42, -len * 0.05, 0, len / 2)
      ..quadraticBezierTo(-len * 0.42, -len * 0.05, 0, -len / 2);
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawLine(
      Offset(0, -len / 2),
      Offset(0, len / 2),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.4)
        ..strokeWidth = len * 0.03,
    );
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    _leaf(canvas, Offset(size.width * 0.5, size.height * 0.36), 80, 1.1, AppColors.leaf);
    _leaf(canvas, Offset(size.width * 0.82, size.height * 0.5), 92, 0.25, AppColors.leafDark);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// A white rounded block with a bold title.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(14, 14, 14, 0),
    padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(28)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: AppColors.ink),
        ),
        const SizedBox(height: 16),
        child,
      ],
    ),
  );
}

class _DateBox extends StatelessWidget {
  const _DateBox({super.key, required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: _soft,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(22),
      side: const BorderSide(color: _line),
    ),
    child: InkWell(
      customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 14, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.ink),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      value,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppColors.ink),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.calendar_today_outlined, size: 20, color: AppColors.ink),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _GuestRow extends StatelessWidget {
  const _GuestRow({
    required this.keyPrefix,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.min,
    required this.canIncrease,
    required this.onChanged,
  });
  final String keyPrefix;
  final IconData icon;
  final String title;
  final String subtitle;
  final int value;
  final int min;
  final bool canIncrease;
  final ValueChanged<int> onChanged;

  Widget _button(Key key, IconData icon, VoidCallback? onTap) => SizedBox(
    width: 42,
    height: 42,
    child: IconButton(
      key: key,
      padding: EdgeInsets.zero,
      onPressed: onTap,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white,
        disabledBackgroundColor: Colors.white,
        side: BorderSide(color: onTap == null ? const Color(0xFFB7D3AF) : AppColors.teaDark, width: 1.4),
        foregroundColor: AppColors.ink,
        disabledForegroundColor: const Color(0xFF8DB485),
      ),
      icon: Icon(icon, size: 22),
    ),
  );

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
    decoration: BoxDecoration(color: _soft, borderRadius: BorderRadius.circular(20)),
    child: Row(
      children: [
        Icon(icon, size: 24, color: AppColors.ink),
        const SizedBox(width: 12),
        Container(width: 1, height: 34, color: _line),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppColors.ink),
              ),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 14, color: AppColors.muted),
              ),
            ],
          ),
        ),
        _button(Key('$keyPrefix-minus'), Icons.remove, value > min ? () => onChanged(value - 1) : null),
        SizedBox(
          width: 32,
          child: Text(
            '$value',
            key: Key('$keyPrefix-count'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
          ),
        ),
        _button(Key('$keyPrefix-plus'), Icons.add, canIncrease ? () => onChanged(value + 1) : null),
      ],
    ),
  );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.fieldKey,
    required this.hint,
    required this.icon,
    required this.controller,
    this.keyboard,
    this.error,
    this.maxLines = 1,
    this.maxLength,
  });
  final Key fieldKey;
  final String hint;
  final IconData icon;
  final TextEditingController controller;
  final TextInputType? keyboard;
  final String? error;
  final int maxLines;
  final int? maxLength;

  @override
  Widget build(BuildContext context) {
    final multi = maxLines > 1;
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(multi ? 26 : 999),
      borderSide: BorderSide(color: c, width: w),
    );
    return TextField(
      key: fieldKey,
      controller: controller,
      keyboardType: multi ? TextInputType.multiline : keyboard,
      maxLines: maxLines,
      minLines: maxLines,
      maxLength: maxLength,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.muted, fontSize: 16),
        errorText: error,
        filled: true,
        fillColor: Colors.white,
        prefixIcon: Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 14, multi ? 52 : 0),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppColors.ink, size: 21),
              const SizedBox(width: 14),
              Container(width: 1, height: 30, color: _line),
            ],
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        border: border(_line),
        enabledBorder: border(_line),
        focusedBorder: border(AppColors.teaDark, 1.6),
        errorBorder: border(AppColors.danger),
        focusedErrorBorder: border(AppColors.danger, 1.6),
      ),
    );
  }
}
