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

const _dayNames = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];
String _dayName(DateTime d) => _dayNames[d.weekday - 1];
String _dayMonth(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

class _BookingFormScreenState extends State<BookingFormScreen> {
  late final _name = TextEditingController(text: context.read<AppState>().claims?.name ?? '');
  late final _email = TextEditingController(text: context.read<AppState>().claims?.email ?? '');
  final _phone = TextEditingController();
  final _note = TextEditingController();
  final _guestName = TextEditingController();
  late String _depId = widget.departureId;
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

  void _selectDeparture(Departure d) {
    setState(() {
      _depId = d.id;
      // Never keep more guests than the chosen date has seats.
      while (_adults + _children > d.seatsLeft && _children > 0) {
        _children--;
      }
      while (_adults + _children > d.seatsLeft && _adults > 1) {
        _adults--;
      }
    });
  }

  Future<void> _submit(Tour tour, Departure dep) async {
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
          departureId: dep.id,
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
      backgroundColor: AppColors.cream,
      body: Stack(
        children: [
          const Positioned(top: 0, right: 0, child: IgnorePointer(child: _LeafDecor())),
          SafeArea(
            child: LoadView<(Tour, Htx, List<Departure>)>(
              load: () async {
                final tour = await repo.getTour(widget.tourId);
                return (tour, await repo.getHtx(tour.htxCode), await repo.listDepartures(widget.tourId));
              },
              builder: (context, data, _) {
                final (tour, htx, all) = data;
                final open = all.where((d) => d.seatsLeft > 0).toList();
                final dep = all.firstWhere(
                  (d) => d.id == _depId,
                  orElse: () => throw const HubException('Không tìm thấy ngày khởi hành'),
                );
                final dates = open.any((d) => d.id == dep.id) ? open : [dep, ...open];
                final guests = _adults + _children;
                final canAdd = guests < dep.seatsLeft;
                final total = _adults * tour.adultPrice + _children * tour.childPrice;
                return Column(
                  children: [
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                        children: [
                          Row(
                            children: [
                              const BackCircle(),
                              const SizedBox(width: 14),
                              const Text(
                                'Đặt tour',
                                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.ink),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Expanded(
                                flex: 11,
                                child: TeaPhoto(asset: teaPhotoFor(tour.gradientSeed), height: 150, radius: 20),
                              ),
                              const SizedBox(width: 16),
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
                                        fontSize: 21,
                                        fontWeight: FontWeight.w800,
                                        height: 1.2,
                                        color: AppColors.ink,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Icon(Icons.location_on, size: 18, color: AppColors.teaDark),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            '${shortHtxName(htx)}, ${htx.province}',
                                            style: const TextStyle(fontSize: 13.5, color: AppColors.muted, height: 1.3),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          const _Highlights(),
                          const _Step(1, 'Chọn ngày đi'),
                          LayoutBuilder(
                            builder: (context, c) {
                              final w = (c.maxWidth - 12) / 2;
                              return Wrap(
                                key: const Key('booking-dates'),
                                spacing: 12,
                                runSpacing: 12,
                                children: [
                                  for (final d in dates)
                                    SizedBox(
                                      width: w,
                                      child: _DateCard(
                                        key: Key('date-${d.id}'),
                                        day: _dayName(d.date),
                                        date: _dayMonth(d.date),
                                        selected: d.id == dep.id,
                                        onTap: () => _selectDeparture(d),
                                      ),
                                    ),
                                ],
                              );
                            },
                          ),
                          const _Step(2, 'Số khách'),
                          _GuestRow(
                            keyPrefix: 'adult',
                            icon: Icons.person,
                            title: 'Người lớn',
                            price: formatVnd(tour.adultPrice),
                            value: _adults,
                            min: 1,
                            canIncrease: canAdd,
                            onChanged: (v) => setState(() => _adults = v),
                          ),
                          const SizedBox(height: 10),
                          _GuestRow(
                            keyPrefix: 'child',
                            icon: Icons.groups,
                            title: 'Trẻ em',
                            price: formatVnd(tour.childPrice),
                            value: _children,
                            min: 0,
                            canIncrease: canAdd,
                            onChanged: (v) => setState(() => _children = v),
                          ),
                          Padding(
                            padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                            child: Text(
                              'Còn ${dep.seatsLeft} chỗ ngày ${_dayMonth(dep.date)}',
                              style: const TextStyle(color: AppColors.faint, fontSize: 12.5),
                            ),
                          ),
                          const _Step(3, 'Thông tin liên hệ'),
                          _Field(
                            fieldKey: const Key('booking-name'),
                            hint: 'Họ và tên',
                            icon: Icons.person,
                            controller: _name,
                            error: _showErrors && _name.text.trim().isEmpty ? 'Nhập họ tên' : null,
                          ),
                          const SizedBox(height: 10),
                          _Field(
                            fieldKey: const Key('booking-phone'),
                            hint: 'Số điện thoại',
                            icon: Icons.phone,
                            controller: _phone,
                            keyboard: TextInputType.phone,
                            error: _showErrors && _phone.text.trim().length < 9 ? 'Nhập số điện thoại hợp lệ' : null,
                          ),
                          const SizedBox(height: 10),
                          _Field(
                            fieldKey: const Key('booking-email'),
                            hint: 'Email (tuỳ chọn)',
                            icon: Icons.mail,
                            controller: _email,
                            keyboard: TextInputType.emailAddress,
                            error: _showErrors && _emailBad ? 'Email không hợp lệ' : null,
                          ),
                          const SizedBox(height: 10),
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
                            const SizedBox(height: 6),
                            _Field(
                              fieldKey: const Key('booking-guest-name'),
                              hint: 'Họ tên người đi tour',
                              icon: Icons.badge_outlined,
                              controller: _guestName,
                              error: _showErrors && _guestName.text.trim().isEmpty ? 'Nhập họ tên người đi' : null,
                            ),
                          ],
                        ],
                      ),
                    ),
                    Container(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        border: Border(top: BorderSide(color: AppColors.border)),
                      ),
                      padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('Tạm tính', style: TextStyle(fontSize: 14, color: AppColors.muted)),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: Text(
                                    formatVnd(total),
                                    key: const Key('booking-bar-total'),
                                    style: const TextStyle(
                                      fontSize: 26,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.teaDark,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Container(width: 1, height: 46, color: AppColors.border),
                          const SizedBox(width: 14),
                          SizedBox(
                            height: 54,
                            child: FilledButton.icon(
                              key: const Key('booking-submit'),
                              style: FilledButton.styleFrom(
                                padding: const EdgeInsets.symmetric(horizontal: 24),
                                textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                              ),
                              onPressed: _busy ? null : () => _submit(tour, dep),
                              icon: const Icon(Icons.arrow_forward),
                              iconAlignment: IconAlignment.end,
                              label: const Text('Tiếp tục'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Two soft leaves in the top right corner.
class _LeafDecor extends StatelessWidget {
  const _LeafDecor();
  @override
  Widget build(BuildContext context) => CustomPaint(size: const Size(150, 120), painter: _LeafPainter());
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
        ..color = Colors.white.withValues(alpha: 0.45)
        ..strokeWidth = len * 0.03,
    );
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    _leaf(canvas, Offset(size.width * 0.78, size.height * 0.3), 86, 0.75, AppColors.leaf.withValues(alpha: 0.55));
    _leaf(canvas, Offset(size.width * 0.9, size.height * 0.5), 70, 0.25, AppColors.leafDark.withValues(alpha: 0.5));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// A slim strip of three reassuring points under the tour summary. The three share one scale, so their text stays the
/// same size on a narrow phone.
class _Highlights extends StatelessWidget {
  const _Highlights();

  Widget _item(IconData icon, String text) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 18, color: AppColors.teaDark),
      const SizedBox(width: 6),
      Text(text, style: const TextStyle(fontSize: 13, color: AppColors.ink)),
    ],
  );

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: AppColors.border),
    ),
    child: FittedBox(
      fit: BoxFit.scaleDown,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _item(Icons.eco_outlined, 'Trải nghiệm thực tế'),
          const SizedBox(width: 18),
          _item(Icons.verified_user, 'An toàn, uy tín'),
          const SizedBox(width: 18),
          _item(Icons.star, 'Khám phá văn hóa trà'),
        ],
      ),
    ),
  );
}

/// A numbered section title ("1  Chọn ngày đi").
class _Step extends StatelessWidget {
  const _Step(this.number, this.title);
  final int number;
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 22, 2, 12),
    child: Row(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: AppColors.teaDark, shape: BoxShape.circle),
          child: Text(
            '$number',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.teaDark),
          ),
        ),
      ],
    ),
  );
}

class _DateCard extends StatelessWidget {
  const _DateCard({super.key, required this.day, required this.date, required this.selected, required this.onTap});
  final String day;
  final String date;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? AppColors.teaDark : Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: selected ? AppColors.teaDark : AppColors.border),
    ),
    child: InkWell(
      customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(Icons.calendar_month_outlined, size: 30, color: selected ? Colors.white : AppColors.teaDark),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    day,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: selected ? Colors.white : AppColors.muted),
                  ),
                  Text(
                    date,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      height: 1.15,
                      color: selected ? Colors.white : AppColors.ink,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              Container(
                width: 26,
                height: 26,
                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: const Icon(Icons.check, size: 18, color: AppColors.teaDark),
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
    required this.price,
    required this.value,
    required this.min,
    required this.canIncrease,
    required this.onChanged,
  });
  final String keyPrefix;
  final IconData icon;
  final String title;
  final String price;
  final int value;
  final int min;
  final bool canIncrease;
  final ValueChanged<int> onChanged;

  Widget _button(Key key, IconData icon, VoidCallback? onTap) => SizedBox(
    width: 40,
    height: 40,
    child: IconButton(
      key: key,
      padding: EdgeInsets.zero,
      onPressed: onTap,
      style: IconButton.styleFrom(
        side: BorderSide(color: onTap == null ? AppColors.border : AppColors.teaDark, width: 1.5),
        foregroundColor: AppColors.teaDark,
        disabledForegroundColor: AppColors.faint,
      ),
      icon: Icon(icon, size: 22),
    ),
  );

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.border),
    ),
    child: Row(
      children: [
        Icon(icon, size: 30, color: AppColors.teaDark),
        const SizedBox(width: 12),
        Container(width: 1, height: 38, color: AppColors.border),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700)),
              Text('$price/người', style: const TextStyle(fontSize: 13.5, color: AppColors.muted)),
            ],
          ),
        ),
        _button(Key('$keyPrefix-minus'), Icons.remove, value > min ? () => onChanged(value - 1) : null),
        SizedBox(
          width: 40,
          child: Text(
            '$value',
            key: Key('$keyPrefix-count'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
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
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: BorderSide(color: c, width: w),
    );
    return TextField(
      key: fieldKey,
      controller: controller,
      keyboardType: maxLines > 1 ? TextInputType.multiline : keyboard,
      maxLines: maxLines,
      minLines: maxLines,
      maxLength: maxLength,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.faint),
        errorText: error,
        filled: true,
        fillColor: Colors.white,
        prefixIcon: Padding(
          padding: EdgeInsets.only(bottom: maxLines > 1 ? 52 : 0),
          child: Icon(icon, color: AppColors.teaDark, size: 22),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
        border: border(AppColors.border),
        enabledBorder: border(AppColors.border),
        focusedBorder: border(AppColors.teaDark, 1.5),
        errorBorder: border(AppColors.danger),
        focusedErrorBorder: border(AppColors.danger, 1.5),
      ),
    );
  }
}
