// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/booking.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import '../common/account_tab.dart';
import '../common/status_colors.dart';

/// Tour-company staff: aggregate view of the linked cooperatives.
class OperatorShell extends StatelessWidget {
  const OperatorShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  static const destinations = [
    NavDestination('Tổng quan', Icons.dashboard_outlined, '/operator'),
    NavDestination('Duyệt bài', Icons.fact_check_outlined, '/operator/articles'),
    NavDestination('Đặt tour', Icons.confirmation_number_outlined, '/operator/bookings'),
    NavDestination('Tài khoản', Icons.person_outline, '/operator/me'),
  ];

  @override
  Widget build(BuildContext context) =>
      RoleShell(destinations: destinations, location: location, roleLabel: 'Công ty du lịch', child: child);
}

class OperatorOverviewTab extends StatelessWidget {
  const OperatorOverviewTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<HtxSummary>>(
      load: repo.listLinkedSummaries,
      builder: (context, list, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            const PageTitle('Tổng quan', subtitle: 'Số liệu gộp của các HTX liên kết'),
            StatGrid([
              StatTile('HTX liên kết', '${list.length}', Icons.account_balance_outlined),
              StatTile('Đơn chờ', '${list.fold(0, (a, s) => a + s.pendingOrders)}', Icons.receipt_long_outlined),
              StatTile('Đặt tour chờ', '${list.fold(0, (a, s) => a + s.pendingBookings)}', Icons.hourglass_bottom),
              StatTile('Đã thu', formatVnd(list.fold(0, (a, s) => a + s.revenue)), Icons.payments_outlined),
            ]),
            const SectionTitle('Các HTX liên kết'),
            for (final s in list)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.htx, style: serif(17)),
                      const SizedBox(height: 8),
                      InfoRow('Đơn chờ', '${s.pendingOrders}'),
                      InfoRow('Đặt tour chờ', '${s.pendingBookings}'),
                      InfoRow('Đặt tour đã xác nhận', '${s.confirmedBookings}'),
                      InfoRow('Đã thu', formatVnd(s.revenue)),
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

class OperatorArticlesTab extends StatelessWidget {
  const OperatorArticlesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Article>>(
      load: repo.listPendingArticles,
      builder: (context, articles, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            PageTitle('Bài chờ duyệt'),
            if (articles.isEmpty) const SizedBox(height: 240, child: EmptyState('Không có bài nào chờ duyệt')),
            for (final a in articles)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(a.body),
                      Text(
                        'HTX: ${a.htxCode} · ${formatDate(a.createdAt)}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            key: Key('reject-${a.id}'),
                            onPressed: () async {
                              await repo.reviewArticle(a.id, approve: false);
                              await reload();
                            },
                            child: const Text('Từ chối'),
                          ),
                          FilledButton(
                            key: Key('approve-${a.id}'),
                            onPressed: () async {
                              await repo.reviewArticle(a.id, approve: true);
                              await reload();
                            },
                            child: const Text('Duyệt'),
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

class OperatorBookingsTab extends StatelessWidget {
  const OperatorBookingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<List<Booking>>(
      load: repo.listAllBookings,
      builder: (context, bookings, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            PageTitle('Theo dõi đặt tour'),
            for (final b in bookings)
              Card(
                child: ListTile(
                  title: Text('${b.code} · ${b.htxCode}'),
                  subtitle: Text(
                    '${b.tourName}\n${formatDate(b.departureDate)} · ${b.guests} khách · ${formatVnd(b.total)}',
                  ),
                  isThreeLine: true,
                  trailing: StatusChip(b.status.label, color: bookingStatusColor(b.status)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class OperatorAccountTab extends StatelessWidget {
  const OperatorAccountTab({super.key});
  @override
  Widget build(BuildContext context) => const AccountTab();
}
