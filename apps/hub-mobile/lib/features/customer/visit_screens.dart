// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:math';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../shared/widgets.dart';
import 'tour_detail_screen.dart' show AmberButton;

/// Request to visit a household or tour directly. No account needed. Visits are
/// tours, so the travel company handles the request (the cooperative and the
/// household have no part in it in the app). The request is not sent anywhere
/// yet: the event gateway is not defined and the company has no screen for it.
class VisitRequestScreen extends StatefulWidget {
  const VisitRequestScreen({super.key, this.householdId, this.tourId});
  final String? householdId;
  final String? tourId;

  @override
  State<VisitRequestScreen> createState() => _VisitRequestScreenState();
}

class _VisitRequestScreenState extends State<VisitRequestScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _note = TextEditingController();
  int _people = 2;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _note.dispose();
    super.dispose();
  }

  static String _newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final r = Random();
    return 'VT-${List.generate(4, (_) => alphabet[r.nextInt(alphabet.length)]).join()}';
  }

  Future<String> _targetName(HubRepository repo) async {
    try {
      if (widget.tourId != null) return (await repo.getTour(widget.tourId!)).name;
      if (widget.householdId != null) return (await repo.getHousehold(widget.householdId!)).name;
    } on HubException {
      // fall through to the generic name
    }
    return 'HTX Chè Tân Cương';
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty || _phone.text.trim().length < 8) {
      setState(() => _error = 'Nhập họ tên và số điện thoại để đơn vị tổ chức liên hệ lại.');
      return;
    }
    final repo = context.read<HubRepository>();
    final router = GoRouter.of(context);
    final target = await _targetName(repo);
    router.pushReplacement('/shop/visit/sent?code=${_newCode()}&to=${Uri.encodeQueryComponent(target)}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const PageHeader('Yêu cầu tham quan'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  const PageTitle(
                    'Gửi yêu cầu tham quan trực tiếp',
                    subtitle: 'Đơn vị tổ chức sẽ xem và trả lời bạn. Không cần tài khoản.',
                  ),
                  TextField(
                    key: const Key('visit-name'),
                    controller: _name,
                    decoration: const InputDecoration(labelText: 'Họ tên'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('visit-phone'),
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Số điện thoại'),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.paper,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppColors.teaDark, width: 2),
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 8),
                        const Expanded(child: Text('Số người', style: TextStyle(fontSize: 16))),
                        IconButton(
                          onPressed: _people > 1 ? () => setState(() => _people--) : null,
                          icon: const Icon(Icons.remove_circle_outline),
                        ),
                        Text(
                          '$_people',
                          key: const Key('visit-people'),
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                        ),
                        IconButton(
                          onPressed: _people < 20 ? () => setState(() => _people++) : null,
                          icon: const Icon(Icons.add_circle_outline),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    maxLines: 3,
                    decoration: InputDecoration(
                      labelText: 'Ghi chú (đi cùng trẻ nhỏ, ăn chay...)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(
                        _error!,
                        key: const Key('visit-error'),
                        style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
                      ),
                    ),
                  const SizedBox(height: 16),
                  AmberButton(buttonKey: const Key('visit-submit'), label: 'Gửi yêu cầu', onPressed: _submit),
                  const SizedBox(height: 12),
                  const SourceChip('Sau khi gửi: đơn vị tổ chức xem, sắp lịch đón, rồi chuyển sang đặt chỗ ở tea-tour'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Status of a sent request, as a vertical timeline.
class VisitSentScreen extends StatelessWidget {
  const VisitSentScreen({super.key, required this.code, required this.target});
  final String code;
  final String target;

  static const _steps = [
    ('Đã gửi', 'Vừa xong'),
    ('Đơn vị tổ chức xem và duyệt', 'Thường trả lời trong 24 giờ'),
    ('Đơn vị tổ chức sắp lịch đón', 'Báo bạn ngày phù hợp'),
    ('Đặt chỗ ở tea-tour', 'Giữ chỗ và nhận mã đặt chỗ'),
    ('Sau chuyến đi: mua chè, xem nguồn gốc lô', 'tea-shop và trang truy xuất'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            PageHeader('Đã gửi yêu cầu', onBack: () => context.go('/shop/tours')),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  const PageTitle('Đã gửi yêu cầu tham quan'),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Mã yêu cầu', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                        Text(code, key: const Key('visit-code'), style: serif(30).copyWith(letterSpacing: 2)),
                        const SizedBox(height: 4),
                        Text(
                          'Dùng mã này cùng số điện thoại để tra lại. Điểm đến: $target',
                          style: const TextStyle(color: AppColors.muted, fontSize: 13.5, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                  const SectionTitle('Trạng thái'),
                  for (var i = 0; i < _steps.length; i++)
                    _StatusStep(index: i, title: _steps[i].$1, subtitle: _steps[i].$2, last: i == _steps.length - 1),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 54,
                    child: OutlinedButton(
                      key: const Key('visit-back-to-tours'),
                      onPressed: () => context.go('/shop/tours'),
                      child: const Text('Về danh sách tour'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusStep extends StatelessWidget {
  const _StatusStep({required this.index, required this.title, required this.subtitle, required this.last});
  final int index;
  final String title;
  final String subtitle;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final done = index == 0;
    final now = index == 1;
    final color = done ? AppColors.leaf : (now ? AppColors.amber : const Color(0xFFCFD9C4));
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 28,
            child: Column(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  child: done
                      ? const Icon(Icons.check, size: 16, color: Colors.white)
                      : Text(
                          '${index + 1}',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: now ? Colors.white : AppColors.ink,
                          ),
                        ),
                ),
                if (!last) Expanded(child: Container(width: 2, color: const Color(0xFFCFD9C4))),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
