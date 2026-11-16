// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

typedef _HomeData = (List<Tour>, List<Htx>, List<Product>, List<Article>);

/// "Khám phá": the landing page of guests and customers.
class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return LoadView<_HomeData>(
      load: () async => (
        await repo.listTours(),
        await repo.listHtxs(),
        await repo.listProducts(),
        await repo.listPublishedArticles(),
      ),
      builder: (context, data, reload) {
        final (tours, htxs, products, articles) = data;
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              const _BrandBar(),
              _hero(context),
              Transform.translate(
                offset: const Offset(0, -30),
                child: Container(
                  decoration: const BoxDecoration(
                    color: AppColors.cream,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
                  ),
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _categories(context, htxs),
                      const _AccountLinks(),
                      const SectionTitle('Điểm đến nổi bật'),
                      const SourceChip('Nguồn: lõi · hồ sơ HTX'),
                      for (var i = 0; i < htxs.length; i++) _destination(context, htxs[i], i),
                      const SectionTitle('Tour nổi bật'),
                      const SourceChip('Nguồn: app du lịch · chỗ trống và đặt chỗ: tea-tour'),
                    ],
                  ),
                ),
              ),
              Transform.translate(offset: const Offset(0, -30), child: _tourCarousel(context, tours)),
              Transform.translate(
                offset: const Offset(0, -30),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(child: SectionTitle('Sản phẩm')),
                          TextButton(
                            key: const Key('home-all-products'),
                            onPressed: () => context.push('/shop/products'),
                            child: const Text('Xem tất cả ›'),
                          ),
                        ],
                      ),
                      const SourceChip('Nguồn: app bán hàng · tồn kho của HTX'),
                    ],
                  ),
                ),
              ),
              Transform.translate(offset: const Offset(0, -30), child: _productStrip(context, products)),
              Transform.translate(
                offset: const Offset(0, -30),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SectionTitle('Tin từ hợp tác xã'),
                      const SourceChip('Nguồn: bài viết HTX · công ty du lịch duyệt'),
                      for (final a in articles.take(2)) _newsCard(context, a),
                      const SizedBox(height: 4),
                      SizedBox(
                        height: 52,
                        width: double.infinity,
                        child: OutlinedButton(
                          key: const Key('home-all-news'),
                          onPressed: () => context.push('/shop/news'),
                          child: const Text('Xem tất cả tin'),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _hero(BuildContext context) => SizedBox(
    height: 330,
    child: TeaPhoto(
      asset: 'assets/images/hero2.jpg',
      alignment: const Alignment(0.6, 0),
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xC70F3A27), Color(0x590F3A27), Color(0x000F3A27)],
                stops: [0, 0.48, 0.75],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 52),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                FilledButton(
                  key: const Key('home-explore'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.limeButton,
                    foregroundColor: AppColors.teaDark,
                    minimumSize: const Size(0, 50),
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  onPressed: () => context.push('/shop/tours'),
                  child: const Text('Khám phá ngay ›'),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _categories(BuildContext context, List<Htx> htxs) {
    Widget tile(Key key, Widget icon, String label, VoidCallback onTap) => Expanded(
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(4, 16, 4, 12),
          decoration: BoxDecoration(color: AppColors.tile, borderRadius: BorderRadius.circular(18)),
          child: Column(
            children: [
              icon,
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(fontSize: 15, color: AppColors.teaDark)),
            ],
          ),
        ),
      ),
    );
    return Row(
      children: [
        tile(
          const Key('cat-hills'),
          const LeafLogo(size: 44),
          'Đồi chè',
          () => htxs.isEmpty ? context.push('/shop/tours') : context.push('/shop/htx/${htxs.first.code}'),
        ),
        const SizedBox(width: 12),
        tile(
          const Key('cat-tours'),
          const Icon(Icons.hiking, size: 44, color: AppColors.leafDark),
          'Trải nghiệm',
          () => context.push('/shop/tours'),
        ),
        const SizedBox(width: 12),
        tile(
          const Key('cat-products'),
          const Icon(Icons.emoji_food_beverage_outlined, size: 44, color: AppColors.leafDark),
          'Đặc sản',
          () => context.push('/shop/products'),
        ),
      ],
    );
  }

  Widget _destination(BuildContext context, Htx h, int i) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: InkWell(
      key: Key('dest-${h.code}'),
      borderRadius: BorderRadius.circular(20),
      onTap: () => context.push('/shop/htx/${h.code}'),
      child: TeaPhoto(
        asset: i.isEven ? 'assets/images/dest.jpg' : 'assets/images/hero.jpg',
        height: 190,
        radius: 20,
        shade: true,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(shortHtxName(h), style: serif(24, color: Colors.white, height: 1.15)),
              const SizedBox(height: 2),
              Row(
                children: [
                  const Icon(Icons.place, size: 16, color: Colors.white),
                  const SizedBox(width: 4),
                  Text(h.province, style: const TextStyle(color: Colors.white, fontSize: 15)),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _tourCarousel(BuildContext context, List<Tour> tours) => SizedBox(
    height: 292,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      itemCount: tours.length,
      separatorBuilder: (_, _) => const SizedBox(width: 14),
      itemBuilder: (context, i) {
        final t = tours[i];
        return SizedBox(
          width: 270,
          child: InkWell(
            key: Key('home-tour-${t.id}'),
            borderRadius: BorderRadius.circular(22),
            onTap: () => context.push('/shop/tours/${t.id}'),
            child: Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TeaPhoto(
                    asset: teaPhotoFor(t.gradientSeed),
                    height: 140,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Align(alignment: Alignment.topLeft, child: PhotoBadge(t.durationLabel)),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: serif(17, height: 1.25)),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: Text.rich(
                                TextSpan(
                                  children: [
                                    const TextSpan(
                                      text: 'Từ ',
                                      style: TextStyle(color: AppColors.faint, fontSize: 12),
                                    ),
                                    TextSpan(
                                      text: formatVnd(t.adultPrice),
                                      style: const TextStyle(
                                        color: Color(0xFF8A3D06),
                                        fontSize: 17,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const TagPill('Xem ›', amber: true),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );

  Widget _productStrip(BuildContext context, List<Product> products) => SizedBox(
    height: 186,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      itemCount: products.length,
      separatorBuilder: (_, _) => const SizedBox(width: 12),
      itemBuilder: (context, i) {
        final p = products[i];
        return InkWell(
          key: Key('home-product-${p.id}'),
          borderRadius: BorderRadius.circular(18),
          onTap: () => context.push('/shop/products'),
          child: Container(
            width: 148,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GradientBanner(seed: p.gradientSeed, icon: Icons.emoji_food_beverage_outlined, height: 78, radius: 12),
                const SizedBox(height: 8),
                Text(
                  p.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, height: 1.2),
                ),
                const Spacer(),
                Text(
                  formatVnd(p.price),
                  style: const TextStyle(color: Color(0xFF8A3D06), fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );

  Widget _newsCard(BuildContext context, Article a) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(a.title, style: serif(18, height: 1.25)),
          const SizedBox(height: 6),
          Text(
            a.body,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.muted, height: 1.4),
          ),
          const SizedBox(height: 6),
          Text(formatDate(a.createdAt), style: const TextStyle(fontSize: 12, color: AppColors.faint)),
        ],
      ),
    ),
  );
}

/// Top of the home page, on one row: the logo, the search bar that takes the remaining width, and the account icon.
/// Submitting the search lists the matching tours.
class _BrandBar extends StatefulWidget {
  const _BrandBar();
  @override
  State<_BrandBar> createState() => _BrandBarState();
}

class _BrandBarState extends State<_BrandBar> {
  final _query = TextEditingController();

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _submit(String q) {
    context.push('/shop/tours?q=${Uri.encodeQueryComponent(q.trim())}');
    _query.clear();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 6, 14),
    child: Row(
      children: [
        const LeafLogo(size: 42),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: AppColors.paper,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFFD9D2BD), width: 1.5),
            ),
            child: Row(
              children: [
                const Icon(Icons.search, size: 22, color: AppColors.teaDark),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    key: const Key('home-search'),
                    controller: _query,
                    textInputAction: TextInputAction.search,
                    style: const TextStyle(fontSize: 15),
                    onSubmitted: _submit,
                    decoration: const InputDecoration(
                      hintText: 'Tìm đồi chè, trải nghiệm',
                      hintMaxLines: 1,
                      hintStyle: TextStyle(color: AppColors.faint, fontSize: 15, overflow: TextOverflow.ellipsis),
                      isDense: true,
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        IconButton(
          key: const Key('home-account'),
          tooltip: 'Tài khoản',
          iconSize: 30,
          onPressed: () => context.push('/shop/me'),
          icon: const Icon(Icons.person_outline),
        ),
      ],
    ),
  );
}

/// Quick links to cart, orders and tickets under the category tiles.
class _AccountLinks extends StatelessWidget {
  const _AccountLinks();
  @override
  Widget build(BuildContext context) {
    final signedIn = context.watch<AppState>().claims != null;
    final cartCount = context.watch<CartController>().itemCount;
    Widget link(Key key, IconData icon, String label, String route) => Expanded(
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push(route),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              Icon(icon, size: 22, color: AppColors.teaDark),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.teaDark),
              ),
            ],
          ),
        ),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        children: [
          link(
            const Key('home-cart'),
            Icons.shopping_basket_outlined,
            cartCount > 0 ? 'Giỏ hàng ($cartCount)' : 'Giỏ hàng',
            '/shop/cart',
          ),
          const SizedBox(width: 10),
          link(const Key('home-news'), Icons.newspaper_outlined, 'Tin tức', '/shop/news'),
          if (signedIn) ...[
            const SizedBox(width: 10),
            link(const Key('home-orders'), Icons.receipt_long_outlined, 'Đơn hàng', '/shop/orders'),
            const SizedBox(width: 10),
            link(const Key('home-tickets'), Icons.confirmation_number_outlined, 'Vé của tôi', '/shop/tickets'),
          ],
        ],
      ),
    );
  }
}
