// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
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

const _dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
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

  Future<void> _moreDates(List<Departure> open) async {
    final picked = await showModalBottomSheet<Departure>(
      context: context,
      backgroundColor: AppColors.cream,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tất cả ngày khởi hành', style: serif(22)),
              const SizedBox(height: 8),
              for (final d in open)
                ListTile(
                  key: Key('more-${d.id}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(formatDateLong(d.date), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('Còn ${d.seatsLeft} chỗ'),
                  trailing: d.id == _depId ? const Icon(Icons.check_circle, color: AppColors.teaDark) : null,
                  onTap: () => Navigator.of(sheet).pop(d),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) _selectDeparture(picked);
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
            final shown = <Departure>[...open.take(3)];
            if (!shown.any((d) => d.id == dep.id)) shown[shown.length - 1] = dep;
            final guests = _adults + _children;
            final canAdd = guests < dep.seatsLeft;
            final total = _adults * tour.adultPrice + _children * tour.childPrice;
            return Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    children: [
                      Row(
                        children: [
                          const BackCircle(),
                          const SizedBox(width: 14),
                          Text('Đặt tour', style: serif(32)),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: AppColors.tileLight, borderRadius: BorderRadius.circular(20)),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 120,
                              child: TeaPhoto(asset: teaPhotoFor(tour.gradientSeed), height: 104, radius: 14),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tour.name, style: serif(20, height: 1.2)),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on, size: 18, color: AppColors.muted),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          '${shortHtxName(htx)}, ${htx.province}',
                                          style: const TextStyle(color: AppColors.muted),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SectionTitle('Chọn ngày đi'),
                      Row(
                        children: [
                          for (final d in shown) ...[
                            Expanded(
                              child: _DateChip(
                                key: Key('date-${d.id}'),
                                day: _dayName(d.date),
                                date: _dayMonth(d.date),
                                selected: d.id == dep.id,
                                onTap: () => _selectDeparture(d),
                              ),
                            ),
                            if (d != shown.last) const SizedBox(width: 10),
                          ],
                        ],
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        key: const Key('booking-more-dates'),
                        onPressed: () => _moreDates(open),
                        icon: const Icon(Icons.calendar_month_outlined),
                        label: const Text('Xem ngày khác'),
                      ),
                      const SectionTitle('Số khách'),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(color: AppColors.tileLight, borderRadius: BorderRadius.circular(20)),
                        child: Column(
                          children: [
                            _GuestRow(
                              keyPrefix: 'adult',
                              icon: Icons.person_outline,
                              title: 'Người lớn',
                              price: formatVnd(tour.adultPrice),
                              value: _adults,
                              min: 1,
                              canIncrease: canAdd,
                              onChanged: (v) => setState(() => _adults = v),
                            ),
                            const Divider(height: 1),
                            _GuestRow(
                              keyPrefix: 'child',
                              icon: Icons.groups_outlined,
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
                        padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
                        child: Text(
                          'Còn ${dep.seatsLeft} chỗ ngày ${_dayMonth(dep.date)}',
                          style: const TextStyle(color: AppColors.muted, fontSize: 13),
                        ),
                      ),
                      const SectionTitle('Thông tin liên hệ'),
                      _Field(
                        fieldKey: const Key('booking-name'),
                        label: 'Họ và tên',
                        hint: 'Nhập họ và tên',
                        icon: Icons.person_outline,
                        controller: _name,
                        error: _showErrors && _name.text.trim().isEmpty ? 'Nhập họ tên' : null,
                      ),
                      const SizedBox(height: 14),
                      _Field(
                        fieldKey: const Key('booking-phone'),
                        label: 'Số điện thoại',
                        hint: 'Nhập số điện thoại',
                        icon: Icons.phone_outlined,
                        controller: _phone,
                        keyboard: TextInputType.phone,
                        error: _showErrors && _phone.text.trim().length < 9 ? 'Nhập số điện thoại hợp lệ' : null,
                      ),
                      CheckboxListTile(
                        key: const Key('booking-on-behalf'),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _onBehalf,
                        onChanged: (v) => setState(() => _onBehalf = v ?? false),
                        title: const Text('Đặt hộ người khác'),
                      ),
                      if (_onBehalf)
                        _Field(
                          fieldKey: const Key('booking-guest-name'),
                          label: 'Họ tên người đi tour',
                          hint: 'Nhập họ tên người đi',
                          icon: Icons.badge_outlined,
                          controller: _guestName,
                          error: _showErrors && _guestName.text.trim().isEmpty ? 'Nhập họ tên người đi' : null,
                        ),
                    ],
                  ),
                ),
                Material(
                  color: Colors.white,
                  elevation: 6,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('Tạm tính', style: TextStyle(fontSize: 14, color: AppColors.muted)),
                              Text(formatVnd(total), key: const Key('booking-bar-total'), style: serif(26)),
                            ],
                          ),
                        ),
                        SizedBox(
                          height: 54,
                          child: FilledButton.icon(
                            key: const Key('booking-submit'),
                            style: FilledButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 28),
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
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip({super.key, required this.day, required this.date, required this.selected, required this.onTap});
  final String day;
  final String date;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: selected ? AppColors.teaDark : AppColors.tileLight,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Column(
          children: [
            Text(day, style: TextStyle(color: selected ? Colors.white : AppColors.muted, fontSize: 15)),
            const SizedBox(height: 2),
            Text(date, style: serif(26, color: selected ? Colors.white : AppColors.ink)),
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

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Row(
      children: [
        Icon(icon, size: 30, color: AppColors.teaDark),
        const SizedBox(width: 12),
        Container(width: 1, height: 44, color: AppColors.border),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              Text('$price/người', style: const TextStyle(color: AppColors.muted)),
            ],
          ),
        ),
        IconButton(
          key: Key('$keyPrefix-minus'),
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_circle_outline, size: 34),
        ),
        SizedBox(
          width: 28,
          child: Text(
            '$value',
            key: Key('$keyPrefix-count'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
        ),
        IconButton(
          key: Key('$keyPrefix-plus'),
          onPressed: canIncrease ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline, size: 34),
        ),
      ],
    ),
  );
}

class _Field extends StatelessWidget {
  const _Field({
    required this.fieldKey,
    required this.label,
    required this.hint,
    required this.icon,
    required this.controller,
    this.keyboard,
    this.error,
  });
  final Key fieldKey;
  final String label;
  final String hint;
  final IconData icon;
  final TextEditingController controller;
  final TextInputType? keyboard;
  final String? error;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(fontSize: 16, color: AppColors.muted)),
      const SizedBox(height: 6),
      TextField(
        key: fieldKey,
        controller: controller,
        keyboardType: keyboard,
        decoration: InputDecoration(hintText: hint, prefixIcon: Icon(icon), errorText: error),
      ),
    ],
  );
}
