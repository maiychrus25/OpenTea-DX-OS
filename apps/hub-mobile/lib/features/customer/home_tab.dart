// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/activity_controller.dart';
import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/format/formatting.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/catalog.dart';
import '../../shared/product_image.dart';
import '../../shared/widgets.dart';
import 'notifications_screen.dart';
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
        // The header stays pinned while the page scrolls under it.
        return Column(
          children: [
            const _BrandBar(),
            Expanded(
              child: RefreshIndicator(
                onRefresh: reload,
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    _FeaturedCarousel(tours: tours.take(4).toList(), htxs: htxs),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 6, 18, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _categories(context, htxs),
                          const _AccountLinks(),
                          const SectionTitle('Điểm đến nổi bật'),
                          for (var i = 0; i < htxs.length; i++) _destination(context, htxs[i], i),
                          const SectionTitle('Tour nổi bật'),
                        ],
                      ),
                    ),
                    _tourCarousel(context, tours),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Row(
                        children: [
                          const Expanded(child: SectionTitle('Sản phẩm')),
                          TextButton(
                            key: const Key('home-all-products'),
                            onPressed: () => context.push('/shop/products'),
                            child: const Text('Xem tất cả ›'),
                          ),
                        ],
                      ),
                    ),
                    _productStrip(context, products),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SectionTitle('Tin từ hợp tác xã'),
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
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

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
                ProductImage(key: Key('home-product-image-${p.id}'), seed: p.gradientSeed, height: 78, radius: 12),
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
  Widget build(BuildContext context) {
    final activity = context.watch<ActivityController>();
    final badge = customerNoticeBadge(activity.bookings, activity.orders);
    return Container(
      color: AppColors.cream,
      padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
      child: Row(
        children: [
          IconButton(
            key: const Key('home-menu'),
            tooltip: 'Menu',
            iconSize: 28,
            onPressed: () => Scaffold.of(context).openDrawer(),
            icon: const Icon(Icons.menu),
          ),
          const LeafLogo(size: 36),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: AppColors.paper,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0xFFD3DDD2), width: 1.5),
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
            key: const Key('home-notifications'),
            tooltip: 'Thông báo',
            iconSize: 28,
            onPressed: () => context.push('/shop/notifications'),
            icon: Badge(
              isLabelVisible: badge > 0,
              label: Text('$badge'),
              backgroundColor: AppColors.danger,
              child: const Icon(Icons.notifications_none),
            ),
          ),
        ],
      ),
    );
  }
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

/// The top of the home page: featured tours as swipeable photo cards (name, cooperative, duration and price over the
/// photo), page dots and a link to all tours.
class _FeaturedCarousel extends StatefulWidget {
  const _FeaturedCarousel({required this.tours, required this.htxs});
  final List<Tour> tours;
  final List<Htx> htxs;

  @override
  State<_FeaturedCarousel> createState() => _FeaturedCarouselState();
}

class _FeaturedCarouselState extends State<_FeaturedCarousel> {
  final _controller = PageController(viewportFraction: 0.9);
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _htxName(String code) {
    for (final h in widget.htxs) {
      if (h.code == code) return shortHtxName(h);
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final tours = widget.tours;
    return Column(
      children: [
        SizedBox(
          height: 250,
          child: PageView.builder(
            key: const Key('home-carousel'),
            controller: _controller,
            itemCount: tours.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (context, i) {
              final t = tours[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: InkWell(
                  key: Key('home-hero-${t.id}'),
                  borderRadius: BorderRadius.circular(24),
                  onTap: () => context.push('/shop/tours/${t.id}'),
                  child: TeaPhoto(
                    asset: teaPhotoFor(t.gradientSeed),
                    radius: 24,
                    shade: true,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(children: [Flexible(child: PhotoBadge(_htxName(t.htxCode)))]),
                          const SizedBox(height: 8),
                          Text(
                            t.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: serif(23, color: Colors.white, height: 1.2),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${t.durationLabel} · Từ ${formatVnd(t.adultPrice)} /người',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              Container(
                                width: 34,
                                height: 34,
                                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                                child: const Icon(Icons.arrow_forward, size: 18, color: AppColors.teaDark),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 4),
          child: Row(
            children: [
              for (var i = 0; i < tours.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.only(right: 6),
                  width: i == _page ? 20 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: i == _page ? AppColors.teaDark : const Color(0xFFC9D5C8),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              const Spacer(),
              TextButton(
                key: const Key('home-explore'),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 40),
                ),
                onPressed: () => context.push('/shop/tours'),
                child: const Text('Khám phá ngay ›', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
