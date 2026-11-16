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
import '../../shared/widgets.dart';

class BookingFormScreen extends StatefulWidget {
  const BookingFormScreen({super.key, required this.tourId, required this.departureId});
  final String tourId;
  final String departureId;

  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends State<BookingFormScreen> {
  late final _name = TextEditingController(text: context.read<AppState>().claims?.name ?? '');
  final _phone = TextEditingController();
  int _adults = 1;
  int _children = 0;
  bool _busy = false;
  bool _showErrors = false;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit(Tour tour, Departure dep) async {
    if (_name.text.trim().isEmpty || _phone.text.trim().length < 9) {
      setState(() => _showErrors = true);
      return;
    }
    final activity = context.read<ActivityController>();
    final router = GoRouter.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final userId = context.read<AppState>().claims!.subject;
    setState(() => _busy = true);
    try {
      final booking = await activity.createBooking(
        NewBooking(
          customerId: userId,
          tourId: tour.id,
          departureId: dep.id,
          contactName: _name.text.trim(),
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
        child: LoadView<(Tour, Departure)>(
          load: () async {
            final tour = await repo.getTour(widget.tourId);
            final deps = await repo.listDepartures(widget.tourId);
            return (
              tour,
              deps.firstWhere(
                (d) => d.id == widget.departureId,
                orElse: () => throw const HubException('Không tìm thấy ngày khởi hành'),
              ),
            );
          },
          builder: (context, data, _) {
            final (tour, dep) = data;
            final adultsTotal = _adults * tour.adultPrice;
            final childrenTotal = _children * tour.childPrice;
            final total = adultsTotal + childrenTotal;
            final guests = _adults + _children;
            final canAdd = guests < dep.seatsLeft;
            return Column(
              children: [
                const PageHeader('Đặt tour'),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      _Card(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(tour.name, style: serif(22, height: 1.25)),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.event, size: 18, color: AppColors.amber),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    '${formatDateLong(dep.date)} · ${tour.durationLabel}',
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                                ),
                                TextButton(
                                  key: const Key('booking-change-date'),
                                  onPressed: () => context.pop(),
                                  child: const Text('Đổi ngày'),
                                ),
                              ],
                            ),
                            Text(
                              dep.seatsLeft > 0 ? 'Còn ${dep.seatsLeft} chỗ' : 'Hết chỗ',
                              style: const TextStyle(color: AppColors.muted, fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                      const SectionTitle('1. Chọn vé và số người'),
                      _TicketRow(
                        keyPrefix: 'adult',
                        title: 'Vé người lớn',
                        price: formatVnd(tour.adultPrice),
                        value: _adults,
                        min: 1,
                        canIncrease: canAdd,
                        onChanged: (v) => setState(() => _adults = v),
                      ),
                      const SizedBox(height: 10),
                      _TicketRow(
                        keyPrefix: 'child',
                        title: 'Vé trẻ em',
                        price: formatVnd(tour.childPrice),
                        value: _children,
                        min: 0,
                        canIncrease: canAdd,
                        onChanged: (v) => setState(() => _children = v),
                      ),
                      const SectionTitle('2. Thông tin liên hệ'),
                      TextField(
                        key: const Key('booking-name'),
                        controller: _name,
                        decoration: InputDecoration(
                          labelText: 'Họ tên người liên hệ',
                          errorText: _showErrors && _name.text.trim().isEmpty ? 'Nhập họ tên' : null,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        key: const Key('booking-phone'),
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: InputDecoration(
                          labelText: 'Số điện thoại',
                          errorText: _showErrors && _phone.text.trim().length < 9 ? 'Nhập số điện thoại hợp lệ' : null,
                        ),
                      ),
                      const SectionTitle('3. Chi phí'),
                      _Card(
                        child: Column(
                          children: [
                            _CostLine(
                              key: const Key('cost-adults'),
                              label: 'Người lớn · $_adults × ${formatVnd(tour.adultPrice)}',
                              amount: formatVnd(adultsTotal),
                            ),
                            if (_children > 0)
                              _CostLine(
                                key: const Key('cost-children'),
                                label: 'Trẻ em · $_children × ${formatVnd(tour.childPrice)}',
                                amount: formatVnd(childrenTotal),
                              ),
                            const Divider(height: 22),
                            _CostLine(
                              key: const Key('booking-total'),
                              label: 'Tổng cộng · $guests khách',
                              amount: formatVnd(total),
                              strong: true,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Bạn xem lại số tiền rồi bấm Đặt tour. Bước sau là chuyển khoản bằng mã VietQR; chỗ được giữ cho bạn trong lúc chờ thanh toán.',
                        style: TextStyle(color: AppColors.muted, fontSize: 13, height: 1.45),
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
                              const Text('Tổng tiền', style: TextStyle(fontSize: 12, color: AppColors.faint)),
                              Text(
                                formatVnd(total),
                                key: const Key('booking-bar-total'),
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.amber,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(
                          height: 50,
                          child: FilledButton(
                            key: const Key('booking-submit'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.amber,
                              padding: const EdgeInsets.symmetric(horizontal: 28),
                              textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                            ),
                            onPressed: _busy ? null : () => _submit(tour, dep),
                            child: const Text('Đặt tour'),
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

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.border),
    ),
    child: child,
  );
}

class _CostLine extends StatelessWidget {
  const _CostLine({super.key, required this.label, required this.amount, this.strong = false});
  final String label;
  final String amount;
  final bool strong;
  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: strong ? 17 : 14,
      fontWeight: strong ? FontWeight.w800 : FontWeight.w500,
      color: strong ? AppColors.amber : AppColors.muted,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(amount, style: style),
        ],
      ),
    );
  }
}

/// One ticket type: name, unit price and a quantity stepper.
class _TicketRow extends StatelessWidget {
  const _TicketRow({
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

  @override
  Widget build(BuildContext context) => _Card(
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(
                '$price /người',
                style: const TextStyle(color: AppColors.amber, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        IconButton(
          key: Key('$keyPrefix-minus'),
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_circle_outline),
        ),
        SizedBox(
          width: 28,
          child: Text(
            '$value',
            key: Key('$keyPrefix-count'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
        ),
        IconButton(
          key: Key('$keyPrefix-plus'),
          onPressed: canIncrease ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    ),
  );
}
