// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/money/money.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart' show GradientBanner, LoadView;
import '../staff/staff_widgets.dart';

// The storefront work of a farming household ("Gian hàng" in the drawer): the
// household's products. Tours (visits, check-in) belong to the travel company.

String _householdOf(BuildContext context) => context.read<AppState>().claims?.householdId ?? '';

class FarmerProductsTab extends StatelessWidget {
  const FarmerProductsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    final household = _householdOf(context);
    return LoadView<List<Product>>(
      load: () => repo.listHouseholdProducts(household),
      builder: (context, products, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const PageHead('Sản phẩm của hộ'),
            if (products.isEmpty)
              const StaffEmpty('Hộ chưa có sản phẩm', icon: Icons.local_cafe_outlined)
            else
              Stack10([
                for (final p in products)
                  RowCard(
                    leading: SizedBox(
                      width: 52,
                      child: GradientBanner(
                        seed: p.gradientSeed,
                        icon: Icons.local_cafe_outlined,
                        height: 52,
                        radius: 12,
                      ),
                    ),
                    title: p.name,
                    subtitle: '${formatVnd(p.price)} · ${p.unit}',
                    trailing: p.stock == 0
                        ? const Pill('Hết hàng', tone: Tone.bad)
                        : Text('Kho: ${p.stock}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
              ]),
          ],
        ),
      ),
    );
  }
}
