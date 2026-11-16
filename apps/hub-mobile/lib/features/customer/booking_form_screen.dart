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
import 'tour_widgets.dart';
import '../../shared/widgets.dart';

class BookingFormScreen extends StatefulWidget {
  const BookingFormScreen({super.key, required this.tourId, required this.departureId});
  final String tourId;
  final String departureId;

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

const _dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
String _dayName(DateTime d) => _dayNames[d.weekday - 1];
String _dayMonth(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

class _BookingFormScreenState extends State<BookingFormScreen> {
  late final _name = TextEditingController(text: context.read<AppState>().claims?.name ?? '');
  final _phone = TextEditingController();
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
    _phone.dispose();
    _guestName.dispose();
    super.dispose();
  }

  bool get _invalid =>
      _name.text.trim().isEmpty || _phone.text.trim().length < 9 || (_onBehalf && _guestName.text.trim().isEmpty);

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
      body: SafeArea(
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      const BackCircle(),
                      const SizedBox(width: 12),
                      const Text(
                        'Đặt tour',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.ink),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [
                      _Panel(
                        child: Row(
                          children: [
                            SizedBox(
                              width: 56,
                              child: TeaPhoto(asset: teaPhotoFor(tour.gradientSeed), height: 56, radius: 12),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    tour.name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, height: 1.25),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${shortHtxName(htx)} · ${htx.province}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 13, color: AppColors.faint),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const _Label('Ngày đi'),
                      SizedBox(
                        height: 68,
                        child: ListView.separated(
                          key: const Key('booking-dates'),
                          scrollDirection: Axis.horizontal,
                          itemCount: dates.length,
                          separatorBuilder: (_, _) => const SizedBox(width: 8),
                          itemBuilder: (context, i) {
                            final d = dates[i];
                            return _DateChip(
                              key: Key('date-${d.id}'),
                              day: _dayName(d.date),
                              date: _dayMonth(d.date),
                              selected: d.id == dep.id,
                              onTap: () => _selectDeparture(d),
                            );
                          },
                        ),
                      ),
                      const _Label('Số khách'),
                      _Panel(
                        child: Column(
                          children: [
                            _GuestRow(
                              keyPrefix: 'adult',
                              title: 'Người lớn',
                              price: formatVnd(tour.adultPrice),
                              value: _adults,
                              min: 1,
                              canIncrease: canAdd,
                              onChanged: (v) => setState(() => _adults = v),
                            ),
                            const Divider(height: 20),
                            _GuestRow(
                              keyPrefix: 'child',
                              title: 'Trẻ em',
                              price: formatVnd(tour.childPrice),
                              value: _children,
                              min: 0,
                              canIncrease: canAdd,
                              onChanged: (v) => setState(() => _children = v),
                            ),
                          ],
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(2, 6, 2, 0),
                        child: Text(
                          'Còn ${dep.seatsLeft} chỗ ngày ${_dayMonth(dep.date)}',
                          style: const TextStyle(color: AppColors.faint, fontSize: 12.5),
                        ),
                      ),
                      const _Label('Liên hệ'),
                      _Field(
                        fieldKey: const Key('booking-name'),
                        hint: 'Họ và tên',
                        controller: _name,
                        error: _showErrors && _name.text.trim().isEmpty ? 'Nhập họ tên' : null,
                      ),
                      const SizedBox(height: 10),
                      _Field(
                        fieldKey: const Key('booking-phone'),
                        hint: 'Số điện thoại',
                        controller: _phone,
                        keyboard: TextInputType.phone,
                        error: _showErrors && _phone.text.trim().length < 9 ? 'Nhập số điện thoại hợp lệ' : null,
                      ),
                      InkWell(
                        key: const Key('booking-on-behalf'),
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => setState(() => _onBehalf = !_onBehalf),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
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
                      if (_onBehalf)
                        _Field(
                          fieldKey: const Key('booking-guest-name'),
                          hint: 'Họ tên người đi tour',
                          controller: _guestName,
                          error: _showErrors && _guestName.text.trim().isEmpty ? 'Nhập họ tên người đi' : null,
                        ),
                    ],
                  ),
                ),
                Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    border: Border(top: BorderSide(color: AppColors.border)),
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('Tạm tính', style: TextStyle(fontSize: 12, color: AppColors.faint)),
                            Text(
                              formatVnd(total),
                              key: const Key('booking-bar-total'),
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        height: 48,
                        child: FilledButton(
                          key: const Key('booking-submit'),
                          style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 28),
                            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                          ),
                          onPressed: _busy ? null : () => _submit(tour, dep),
                          child: const Text('Tiếp tục'),
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
    );
  }
}

/// A small section label above a block of the booking screen.
class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 18, 2, 8),
    child: Text(
      text,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
    ),
  );
}

/// A white block with a hairline border.
class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: child,
  );
}

class _DateChip extends StatelessWidget {
  const _DateChip({super.key, required this.day, required this.date, required this.selected, required this.onTap});
  final String day;
  final String date;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? AppColors.teaDark : Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(color: selected ? AppColors.teaDark : AppColors.border),
    ),
    child: InkWell(
      customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      onTap: onTap,
      child: SizedBox(
        width: 70,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(day, style: TextStyle(fontSize: 12, color: selected ? Colors.white70 : AppColors.faint)),
            const SizedBox(height: 2),
            Text(
              date,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.ink,
              ),
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
    required this.title,
    required this.price,
    required this.value,
    required this.min,
    required this.canIncrease,
    required this.onChanged,
  });
  final String keyPrefix;
  final String title;
  final String price;
  final int value;
  final int min;
  final bool canIncrease;
  final ValueChanged<int> onChanged;

  Widget _button(Key key, IconData icon, VoidCallback? onTap) => SizedBox(
    width: 34,
    height: 34,
    child: IconButton(
      key: key,
      padding: EdgeInsets.zero,
      onPressed: onTap,
      style: IconButton.styleFrom(
        side: BorderSide(color: onTap == null ? AppColors.border : AppColors.teaDark),
        foregroundColor: AppColors.teaDark,
        disabledForegroundColor: AppColors.border,
      ),
      icon: Icon(icon, size: 18),
    ),
  );

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
            Text('$price/người', style: const TextStyle(fontSize: 13, color: AppColors.faint)),
          ],
        ),
      ),
      _button(Key('$keyPrefix-minus'), Icons.remove, value > min ? () => onChanged(value - 1) : null),
      SizedBox(
        width: 36,
        child: Text(
          '$value',
          key: Key('$keyPrefix-count'),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      _button(Key('$keyPrefix-plus'), Icons.add, canIncrease ? () => onChanged(value + 1) : null),
    ],
  );
}

class _Field extends StatelessWidget {
  const _Field({required this.fieldKey, required this.hint, required this.controller, this.keyboard, this.error});
  final Key fieldKey;
  final String hint;
  final TextEditingController controller;
  final TextInputType? keyboard;
  final String? error;

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: c, width: w),
    );
    return TextField(
      key: fieldKey,
      controller: controller,
      keyboardType: keyboard,
      style: const TextStyle(fontSize: 15.5),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AppColors.faint),
        errorText: error,
        filled: true,
        fillColor: Colors.white,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: border(AppColors.border),
        enabledBorder: border(AppColors.border),
        focusedBorder: border(AppColors.teaDark, 1.5),
        errorBorder: border(AppColors.danger),
        focusedErrorBorder: border(AppColors.danger, 1.5),
      ),
    );
  }
}
