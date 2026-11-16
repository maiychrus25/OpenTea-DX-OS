// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
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

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit(Tour tour, Departure dep) async {
    if (_name.text.trim().isEmpty || _phone.text.trim().length < 9) {
      showMessage(context, 'Nhập họ tên và số điện thoại hợp lệ');
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
      appBar: AppBar(title: const Text('Đặt tour')),
      body: LoadView<(Tour, Departure)>(
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
          final total = _adults * tour.adultPrice + _children * tour.childPrice;
          final guests = _adults + _children;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(tour.name, style: Theme.of(context).textTheme.titleLarge),
              Text(formatDateLong(dep.date)),
              const SizedBox(height: 16),
              _Stepper(
                label: 'Người lớn (${formatVnd(tour.adultPrice)})',
                value: _adults,
                min: 1,
                onChanged: (v) => setState(() => _adults = v),
                canIncrease: guests < dep.seatsLeft,
              ),
              _Stepper(
                label: 'Trẻ em (${formatVnd(tour.childPrice)})',
                value: _children,
                min: 0,
                onChanged: (v) => setState(() => _children = v),
                canIncrease: guests < dep.seatsLeft,
              ),
              Text('Còn ${dep.seatsLeft} chỗ', style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              TextField(
                key: const Key('booking-name'),
                controller: _name,
                decoration: const InputDecoration(labelText: 'Họ tên người liên hệ'),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('booking-phone'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Số điện thoại'),
              ),
              const SizedBox(height: 16),
              Text('Tổng: ${formatVnd(total)}', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('booking-submit'),
                onPressed: _busy ? null : () => _submit(tour, dep),
                child: const Text('Tiếp tục thanh toán'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.min,
    required this.onChanged,
    required this.canIncrease,
  });
  final String label;
  final int value;
  final int min;
  final ValueChanged<int> onChanged;
  final bool canIncrease;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Text(label)),
        IconButton(
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_circle_outline),
        ),
        Text('$value', style: Theme.of(context).textTheme.titleMedium),
        IconButton(
          onPressed: canIncrease ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    );
  }
}
