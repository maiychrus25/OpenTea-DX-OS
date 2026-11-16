// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../data/models/staff.dart';
import '../../shared/widgets.dart' show LoadView, showMessage;
import '../staff/staff_format.dart';
import '../staff/staff_shell.dart';
import '../staff/staff_widgets.dart';

// Pages of the tour company (operator). Mock data only; see the repository.

Widget _page(Future<void> Function() reload, List<Widget> children) => RefreshIndicator(
  onRefresh: reload,
  child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 28), children: children),
);

/// "Hợp tác xã liên kết".
class OperatorHtxPage extends StatelessWidget {
  const OperatorHtxPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<LinkedHtx>>(
      load: repo.listLinkedHtxs,
      builder: (context, list, reload) => _page(reload, [
        const PageHead(
          'Hợp tác xã liên kết',
          subtitle: 'Mỗi HTX tự đồng ý liên kết và chọn dữ liệu chia sẻ với công ty.',
        ),
        Stack10([
          for (final h in list)
            RowCard(
              key: Key('htx-${h.code}'),
              title: h.name,
              subtitle: '${h.location} · ${h.households} hộ (${h.hosting} đón khách)',
              meta: '${h.tours} tour · ${h.articles} bài',
              trailing: Pill(h.stateLabel, tone: toneOfState(h.state)),
              footer: Row(
                children: [
                  const Text('Sẵn sàng', style: TextStyle(fontSize: 12.5)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: h.readiness / 100,
                        minHeight: 8,
                        backgroundColor: const Color(0xFFE7F0EA),
                        color: const Color(0xFF176C4B),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${h.readiness}%', style: const TextStyle(fontWeight: FontWeight.w800)),
                ],
              ),
              onTap: () => showModalBottomSheet<void>(
                context: context,
                showDragHandle: true,
                backgroundColor: Colors.white,
                builder: (_) => StaffTheme(child: _HtxSheet(h)),
              ),
            ),
        ]),
        const SizedBox(height: 12),
        const InfoNote('HTX nhận lời mời, chấp nhận hoặc từ chối. Rút lui bất cứ lúc nào.', tone: Tone.neutral),
      ]),
    );
  }
}

class _HtxSheet extends StatelessWidget {
  const _HtxSheet(this.h);
  final LinkedHtx h;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(h.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Pill(h.stateLabel, tone: toneOfState(h.state)),
        const SizedBox(height: 10),
        DetailRow('Khu vực', h.location),
        DetailRow('Hộ thành viên', '${h.households}'),
        DetailRow('Hộ đón khách', '${h.hosting}'),
        DetailRow('Khách tháng này', '${h.guestsThisMonth}'),
        DetailRow('Doanh thu', '${h.revenueMillion} triệu ₫'),
        const SizedBox(height: 8),
        const Text(
          'Không chia sẻ với công ty: tên, số điện thoại khách và vị trí thửa của hộ.',
          style: TextStyle(fontSize: 12.5, color: Color(0xFF5B6B62)),
        ),
      ],
    ),
  );
}

/// "Chỉ đạo và nhiệm vụ": directives to the linked cooperatives, with a create form.
class OperatorDirectivesPage extends StatelessWidget {
  const OperatorDirectivesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Directive>>(
      load: repo.listDirectives,
      builder: (context, list, reload) => _page(reload, [
        PageHead(
          'Chỉ đạo và nhiệm vụ',
          subtitle: 'Công ty giao việc, HTX xác nhận, làm xong thì đính kèm bằng chứng.',
          action: FilledButton.icon(
            key: const Key('directive-new'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            icon: const Icon(Icons.add, size: 20),
            label: const Text('Giao việc'),
            onPressed: () async {
              final created = await showModalBottomSheet<bool>(
                context: context,
                isScrollControlled: true,
                showDragHandle: true,
                backgroundColor: Colors.white,
                builder: (_) => StaffTheme(child: DirectiveForm(repo: repo)),
              );
              if (created == true) await reload();
            },
          ),
        ),
        Stack10([
          for (final d in list)
            RowCard(
              key: Key('directive-${d.id}'),
              title: d.title,
              subtitle: 'Hạn ${formatDate(d.dueDate)} · ${d.doneCount}/${d.assignments.length} HTX hoàn thành',
              footer: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final a in d.assignments) Pill('${a.htxName}: ${a.state.label}', tone: directiveTone(a.state)),
                ],
              ),
            ),
        ]),
      ]),
    );
  }
}

/// Bottom sheet form "Giao nhiệm vụ mới".
class DirectiveForm extends StatefulWidget {
  const DirectiveForm({super.key, required this.repo});
  final HubRepository repo;
  @override
  State<DirectiveForm> createState() => _DirectiveFormState();
}

class _DirectiveFormState extends State<DirectiveForm> {
  final _title = TextEditingController();
  DateTime _due = DateTime.now().add(const Duration(days: 30));
  String? _target;
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      await widget.repo.createDirective(NewDirective(title: _title.text, dueDate: _due, htxName: _target));
      if (mounted) Navigator.of(context).pop(true);
    } on HubException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Giao nhiệm vụ mới', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          TextField(
            key: const Key('directive-title'),
            controller: _title,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Nội dung', hintText: 'Ví dụ: Chuẩn bị lễ hội chè tháng 3'),
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String?>(
            isExpanded: true,
            key: const Key('directive-target'),
            initialValue: _target,
            decoration: const InputDecoration(labelText: 'Giao cho'),
            items: const [
              DropdownMenuItem(value: null, child: Text('Tất cả HTX liên kết')),
              DropdownMenuItem(value: 'Tân Cương', child: Text('HTX Tân Cương')),
              DropdownMenuItem(value: 'Suối Giàng', child: Text('HTX Suối Giàng')),
              DropdownMenuItem(value: 'Trại Cài', child: Text('HTX Trại Cài')),
            ],
            onChanged: (v) => setState(() => _target = v),
          ),
          const SizedBox(height: 14),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: _due,
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 730)),
              );
              if (picked != null) setState(() => _due = picked);
            },
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: 'Hạn hoàn thành',
                suffixIcon: Icon(Icons.calendar_today_outlined, size: 20),
              ),
              child: Text(formatDate(_due)),
            ),
          ),
          const SizedBox(height: 18),
          FilledButton(
            key: const Key('directive-send'),
            onPressed: _busy ? null : _send,
            child: Text(_busy ? 'Đang gửi...' : 'Gửi nhiệm vụ'),
          ),
        ],
      ),
    ),
  );
}

/// "Tour toàn vùng".
class OperatorToursPage extends StatelessWidget {
  const OperatorToursPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<RegionTour>>(
      load: repo.listRegionTours,
      builder: (context, tours, reload) => _page(reload, [
        const PageHead(
          'Tour toàn vùng',
          subtitle: 'Tour tuyến nối nhiều HTX. Lịch khởi hành và đặt chỗ vẫn nằm ở từng HTX.',
        ),
        Stack10([
          for (final t in tours)
            RowCard(
              key: Key('region-${t.id}'),
              title: t.name,
              subtitle: '${t.route} · ${formatVnd(t.price)}',
              meta: '${t.htxCount} HTX tham gia',
              trailing: Pill(t.stateLabel, tone: toneOfState(t.state)),
            ),
        ]),
        const SizedBox(height: 12),
        const InfoNote('Tạo tour tuyến mới làm trên bản web.', tone: Tone.neutral),
      ]),
    );
  }
}

/// "Bài viết HTX": articles waiting for the company to approve.
class OperatorArticlesTab extends StatelessWidget {
  const OperatorArticlesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Article>>(
      load: repo.listPendingArticles,
      builder: (context, articles, reload) => _page(reload, [
        const PageHead(
          'Bài viết của hợp tác xã',
          subtitle: 'HTX viết bài, công ty duyệt rồi bài hiện trong ứng dụng khách.',
        ),
        if (articles.isEmpty)
          const StaffEmpty('Không có bài nào chờ duyệt', icon: Icons.fact_check_outlined)
        else
          Stack10([
            for (final a in articles)
              RowCard(
                title: a.title,
                subtitle: a.body,
                meta: 'HTX: ${a.htxCode} · ${formatDate(a.createdAt)}',
                trailing: const Pill('Chờ duyệt', tone: Tone.warn),
                footer: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: Key('reject-${a.id}'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFB3261E),
                          side: const BorderSide(color: Color(0xFFB3261E)),
                          minimumSize: const Size(0, 42),
                        ),
                        onPressed: () async {
                          await repo.reviewArticle(a.id, approve: false);
                          await reload();
                        },
                        child: const Text('Từ chối'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        key: Key('approve-${a.id}'),
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 42)),
                        onPressed: () async {
                          await repo.reviewArticle(a.id, approve: true);
                          await reload();
                        },
                        child: const Text('Duyệt'),
                      ),
                    ),
                  ],
                ),
              ),
          ]),
      ]),
    );
  }
}

/// "Báo cáo tổng hợp".
class OperatorReportsPage extends StatelessWidget {
  const OperatorReportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<ReportRow>>(
      load: repo.reportRows,
      builder: (context, rows, reload) => _page(reload, [
        const PageHead('Báo cáo tổng hợp', subtitle: 'Chỉ số liệu tổng, không có dữ liệu cá nhân khách hay hộ.'),
        SectionCard(
          title: 'Tháng này',
          child: Column(
            children: [
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(r.metric, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                            Text('Nguồn: ${r.source}', style: const TextStyle(fontSize: 12, color: Color(0xFF8A978F))),
                          ],
                        ),
                      ),
                      Text(r.value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const InfoNote('Số liệu mẫu cho bản trình diễn. Tải tệp CSV làm trên bản web.', tone: Tone.neutral),
      ]),
    );
  }
}

/// "Lượt đặt tour" across every linked cooperative.
class OperatorBookingsTab extends StatelessWidget {
  const OperatorBookingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Booking>>(
      load: repo.listAllBookings,
      builder: (context, bookings, reload) => _page(reload, [
        const PageHead('Theo dõi đặt tour', subtitle: 'Tất cả lượt đặt của các HTX liên kết.'),
        Stack10([
          for (final b in bookings)
            RowCard(
              title: '${b.code} · ${b.htxCode}',
              subtitle: b.tourName,
              meta: '${formatDate(b.departureDate)} · ${b.guests} khách · ${formatVnd(b.total)}',
              trailing: Pill(b.status.label, tone: bookingTone(b.status)),
            ),
        ]),
      ]),
    );
  }
}
