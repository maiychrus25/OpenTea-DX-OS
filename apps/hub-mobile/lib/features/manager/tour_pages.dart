// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

class ManagerToursPage extends StatelessWidget {
  const ManagerToursPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final actor = context.read<AppState>().claims!;
    final code = actor.htxCode ?? '';
    return LoadView<(List<Tour>, List<GuideStaff>, List<Departure>)>(
      load: () async {
        final tours = await repo.listTours(htxCode: code);
        return (
          tours,
          await repo.listHtxGuides(code),
          [for (final tour in tours) ...await repo.listDepartures(tour.id)],
        );
      },
      builder: (context, data, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const PageHead('Tour của HTX', subtitle: 'Quản lý lịch khởi hành và nhân viên dẫn tour.'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (actor.canWriteHtx)
                  FilledButton.icon(
                    key: const Key('create-tour'),
                    icon: const Icon(Icons.add),
                    label: const Text('Tạo tour'),
                    onPressed: () async {
                      await context.push('/manager/tours/new');
                      await reload();
                    },
                  ),
                OutlinedButton(onPressed: () => context.push('/manager/bookings'), child: const Text('Lượt đặt tour')),
                OutlinedButton(
                  onPressed: () => context.push('/manager/tour-payments'),
                  child: const Text('Thu tiền tour'),
                ),
              ],
            ),
            if (!actor.canWriteHtx)
              const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Chế độ chỉ xem')),
            if (data.$1.isEmpty) const StaffEmpty('HTX chưa có tour nào'),
            for (final tour in data.$1)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: SectionCard(
                  key: Key('manager-tour-${tour.id}'),
                  title: tour.name,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${formatVnd(tour.adultPrice)} / người lớn · ${tour.maxGuests} chỗ'),
                      Text('Trẻ em: ${formatVnd(tour.childPrice)}'),
                      const SizedBox(height: 8),
                      for (final dep in data.$3.where((d) => d.tourId == tour.id))
                        Text('${formatDate(dep.date)} · còn ${dep.seatsLeft}/${dep.seatsTotal} chỗ'),
                      const SizedBox(height: 8),
                      Text(tour.guideIds.isEmpty ? 'Chưa có nhân viên dẫn tour' : 'Nhân viên dẫn tour:'),
                      for (final guide in data.$2.where((g) => tour.guideIds.contains(g.id))) Text('• ${guide.name}'),
                      TextButton.icon(
                        key: Key('tour-roster-${tour.id}'),
                        icon: const Icon(Icons.groups_outlined),
                        label: const Text('Thành viên của tour'),
                        onPressed: () => context.push('/manager/tours/${tour.id}/members'),
                      ),
                      if (actor.canWriteHtx)
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            TextButton(
                              key: Key('edit-tour-${tour.id}'),
                              child: const Text('Sửa tour'),
                              onPressed: () async {
                                await context.push('/manager/tours/${tour.id}/edit');
                                await reload();
                              },
                            ),
                            TextButton(
                              key: Key('tour-guides-${tour.id}'),
                              child: const Text('Thêm nhân viên dẫn tour'),
                              onPressed: () async {
                                await context.push('/manager/tours/${tour.id}/guides');
                                await reload();
                              },
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class TourEditorPage extends StatelessWidget {
  const TourEditorPage({super.key, this.tourId});
  final String? tourId;

  @override
  Widget build(BuildContext context) {
    final actor = context.read<AppState>().claims!;
    final repo = context.read<HubRepository>();
    return DetailScaffold(
      title: tourId == null ? 'Tạo tour' : 'Sửa tour',
      body: !actor.canWriteHtx
          ? const StaffEmpty('Bạn chỉ có quyền xem tour')
          : LoadView<(Tour?, List<Departure>)>(
              load: () async {
                if (tourId == null) return (null, <Departure>[]);
                final tour = await repo.getTour(tourId!);
                if (tour.htxCode != actor.htxCode) throw const HubException('Không tìm thấy tour của HTX');
                return (tour, await repo.listDepartures(tour.id));
              },
              builder: (context, data, _) => _TourForm(tour: data.$1, departures: data.$2),
            ),
    );
  }
}

class _TourForm extends StatefulWidget {
  const _TourForm({required this.tour, required this.departures});
  final Tour? tour;
  final List<Departure> departures;
  @override
  State<_TourForm> createState() => _TourFormState();
}

class _TourFormState extends State<_TourForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.tour?.name ?? '');
  late final _adult = TextEditingController(text: '${widget.tour?.adultPrice ?? 350000}');
  late final _child = TextEditingController(text: '${widget.tour?.childPrice ?? 200000}');
  late final _seats = TextEditingController(text: '${widget.tour?.maxGuests ?? 12}');
  late final _briefing = TextEditingController(text: widget.tour?.briefing ?? '');
  late final _dates = [...widget.departures.map((d) => d.date)];
  bool _saving = false;

  @override
  void dispose() {
    for (final controller in [_name, _adult, _child, _seats]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final repo = context.read<HubRepository>();
      final actor = context.read<AppState>().claims!;
      final draft = NewTour(
        name: _name.text,
        adultPrice: int.parse(_adult.text),
        childPrice: int.parse(_child.text),
        maxGuests: int.parse(_seats.text),
        dates: _dates,
        briefing: _briefing.text,
      );
      if (widget.tour == null) {
        await repo.createTour(draft, actor: actor);
      } else {
        await repo.updateTour(widget.tour!.id, draft, actor: actor);
      }
      if (mounted) {
        showMessage(context, 'Đã lưu tour');
        context.pop();
      }
    } on HubException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextFormField(
          key: const Key('tour-name'),
          controller: _name,
          maxLength: 120,
          decoration: const InputDecoration(labelText: 'Tên tour'),
          validator: (value) => value == null || value.trim().isEmpty ? 'Hãy nhập tên tour' : null,
        ),
        for (final field in [
          (_adult, 'Giá người lớn (đ)', 'tour-adult-price', 1),
          (_child, 'Giá trẻ em (đ)', 'tour-child-price', 0),
          (_seats, 'Số chỗ mỗi ngày', 'tour-seats', 1),
        ])
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: TextFormField(
              key: Key(field.$3),
              controller: field.$1,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: field.$2),
              validator: (value) {
                final number = int.tryParse(value ?? '');
                return number == null || number < field.$4 ? 'Hãy nhập số hợp lệ' : null;
              },
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TextFormField(
            key: const Key('tour-briefing'),
            controller: _briefing,
            maxLength: 500,
            minLines: 2,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'Dặn dò cho nhân viên dẫn tour',
              hintText: 'Điểm hẹn, giờ đón, việc cần chuẩn bị',
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text('Ngày khởi hành', style: TextStyle(fontWeight: FontWeight.w700)),
        const Text('Ngày đã có lượt đặt không thể xoá. Số chỗ không được nhỏ hơn số khách đã đặt.'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final date in _dates)
              InputChip(
                label: Text(formatDate(date)),
                onDeleted: _saving ? null : () => setState(() => _dates.remove(date)),
              ),
          ],
        ),
        OutlinedButton.icon(
          key: const Key('add-departure'),
          icon: const Icon(Icons.calendar_month_outlined),
          label: const Text('Thêm ngày khởi hành'),
          onPressed: _saving
              ? null
              : () async {
                  final now = DateUtils.dateOnly(DateTime.now());
                  final date = await showDatePicker(
                    context: context,
                    initialDate: now.add(const Duration(days: 1)),
                    firstDate: now,
                    lastDate: DateTime(now.year + 5),
                  );
                  if (date != null && mounted && !_dates.contains(date)) {
                    setState(() {
                      _dates.add(date);
                      _dates.sort();
                    });
                  }
                },
        ),
        const SizedBox(height: 20),
        FilledButton(
          key: const Key('save-tour'),
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Đang lưu…' : 'Lưu tour'),
        ),
      ],
    ),
  );
}

class TourGuidesPage extends StatefulWidget {
  const TourGuidesPage({super.key, required this.tourId});
  final String tourId;
  @override
  State<TourGuidesPage> createState() => _TourGuidesPageState();
}

class _TourGuidesPageState extends State<TourGuidesPage> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _busy = false;
  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, Future<void> Function() reload) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await reload();
    } on HubException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final actor = context.read<AppState>().claims!;
    return DetailScaffold(
      title: 'Nhân viên dẫn tour',
      body: LoadView<(Tour, List<GuideStaff>)>(
        load: () async {
          final tour = await repo.getTour(widget.tourId);
          if (tour.htxCode != actor.htxCode) throw const HubException('Không tìm thấy tour của HTX');
          return (tour, await repo.listHtxGuides(tour.htxCode));
        },
        builder: (context, data, reload) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            PageHead(data.$1.name, subtitle: 'Chỉ nhân viên được giao mới thấy tour này.'),
            for (final guide in data.$2)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(guide.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(guide.phone),
                      if (actor.canWriteHtx)
                        TextButton(
                          key: Key('assign-${guide.id}'),
                          onPressed: _busy
                              ? null
                              : () => _run(
                                  () => data.$1.guideIds.contains(guide.id)
                                      ? repo.removeGuideFromTour(widget.tourId, guide.id, actor: actor)
                                      : repo.addGuideToTour(widget.tourId, guide.id, actor: actor),
                                  reload,
                                ),
                          child: Text(data.$1.guideIds.contains(guide.id) ? 'Gỡ khỏi tour' : 'Thêm vào tour'),
                        )
                      else
                        Text(data.$1.guideIds.contains(guide.id) ? 'Đã giao tour' : 'Chưa giao tour'),
                    ],
                  ),
                ),
              ),
            if (actor.canWriteHtx) ...[
              const SizedBox(height: 20),
              const Text('Thêm nhân viên dẫn tour', style: TextStyle(fontWeight: FontWeight.w700)),
              TextField(
                key: const Key('guide-name'),
                controller: _name,
                decoration: const InputDecoration(labelText: 'Họ tên'),
              ),
              TextField(
                key: const Key('guide-phone'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Số điện thoại'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                key: const Key('add-guide'),
                onPressed: _busy
                    ? null
                    : () => _run(() async {
                        final guide = await repo.addHtxGuide(name: _name.text, phone: _phone.text, actor: actor);
                        await repo.addGuideToTour(widget.tourId, guide.id, actor: actor);
                        _name.clear();
                        _phone.clear();
                      }, reload),
                child: const Text('Thêm và giao tour'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
