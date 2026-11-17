// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../app/cart_controller.dart';
import '../../core/money/money.dart';
import '../../core/theme/app_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/cart.dart';
import '../../data/models/catalog.dart';
import '../../shared/product_image.dart';
import '../../shared/widgets.dart';
import 'tour_widgets.dart';

const _page = Color(0xFFE6EFE3);
const _chip = Color(0xFFD8E8D1);

/// One product: the picture, the price and the stock, the quantity, and the two ways to buy it: put it in the cart or
/// order it now (the cart opens at the checkout with this product in it).
class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});
  final String productId;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  int _quantity = 1;

  Future<bool> _addToCart(Product p) async {
    final result = await context.read<CartController>().add(p, quantity: _quantity);
    if (!mounted) return false;
    if (result != CartAddResult.added) {
      showMessage(
        context,
        result == CartAddResult.otherHtx
            ? 'Giỏ hàng chỉ chứa sản phẩm của một HTX. Hãy thanh toán hoặc xoá giỏ trước.'
            : 'Không đủ hàng trong kho',
      );
    }
    return result == CartAddResult.added;
  }

  Future<void> _addOnly(Product p) async {
    if (await _addToCart(p) && mounted) showMessage(context, 'Đã thêm "${p.name}" vào giỏ');
  }

  Future<void> _orderNow(Product p) async {
    if (context.read<AppState>().claims == null) {
      final here = GoRouterState.of(context).uri.toString();
      context.push('/login?from=${Uri.encodeComponent(here)}');
      return;
    }
    if (await _addToCart(p) && mounted) context.push('/shop/checkout');
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return Scaffold(
      backgroundColor: _page,
      body: LoadView<(Product, Htx)>(
        load: () async {
          final all = await repo.listProducts();
          final product = all.firstWhere(
            (p) => p.id == widget.productId,
            orElse: () => throw const HubException('Không tìm thấy sản phẩm'),
          );
          return (product, await repo.getHtx(product.htxCode));
        },
        builder: (context, data, _) {
          final (p, htx) = data;
          final inStock = p.stock > 0;
          final maxQty = p.stock < 1 ? 1 : p.stock;
          if (_quantity > maxQty) _quantity = maxQty;
          final top = MediaQuery.paddingOf(context).top;
          return Stack(
            children: [
              ListView(
                padding: EdgeInsets.only(bottom: 150 + MediaQuery.paddingOf(context).bottom),
                children: [
                  SizedBox(
                    height: 340 + top,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ProductImage(
                          key: Key('product-hero-${p.id}'),
                          productId: p.id,
                          seed: p.gradientSeed,
                          radius: 0,
                        ),
                        Positioned(
                          top: top + 14,
                          left: 16,
                          child: Material(
                            color: Colors.white,
                            shape: const CircleBorder(),
                            child: InkWell(
                              key: const Key('back'),
                              customBorder: const CircleBorder(),
                              onTap: () => context.canPop() ? context.pop() : context.go('/shop/products'),
                              child: const SizedBox(
                                width: 50,
                                height: 50,
                                child: Icon(Icons.chevron_left, size: 26, color: AppColors.ink),
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          top: top + 14,
                          right: 16,
                          child: Material(
                            color: Colors.white,
                            shape: const CircleBorder(),
                            child: InkWell(
                              key: const Key('product-cart'),
                              customBorder: const CircleBorder(),
                              onTap: () => context.go('/shop/cart'),
                              child: SizedBox(
                                width: 50,
                                height: 50,
                                child: Center(
                                  child: Badge(
                                    isLabelVisible: context.watch<CartController>().itemCount > 0,
                                    label: Text('${context.watch<CartController>().itemCount}'),
                                    backgroundColor: AppColors.teaDark,
                                    child: const Icon(Icons.shopping_cart_outlined, size: 24, color: AppColors.ink),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -30),
                    child: Container(
                      decoration: const BoxDecoration(
                        color: _page,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                      ),
                      padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _Pill(p.unit),
                              if (!inStock)
                                const _Pill('Hết hàng', color: Color(0xFFF6D6D3), textColor: AppColors.danger)
                              else if (p.stock <= 5)
                                _Pill('Chỉ còn ${p.stock}', color: const Color(0xFFFDE8D2), textColor: AppColors.amber)
                              else
                                const _Pill('Còn hàng'),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            p.name,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                              height: 1.2,
                              color: AppColors.ink,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Icon(Icons.storefront_outlined, size: 19, color: AppColors.ink),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  '${shortHtxName(htx)}, ${htx.province}',
                                  style: const TextStyle(fontSize: 15, color: AppColors.ink),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Text(
                            formatVnd(p.price),
                            key: const Key('product-price'),
                            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: AppColors.teaDark),
                          ),
                          Text('/ ${p.unit}', style: const TextStyle(fontSize: 14, color: AppColors.muted)),
                          const SizedBox(height: 16),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('Giới thiệu', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                Text(
                                  p.description.isEmpty
                                      ? 'Hợp tác xã chưa viết giới thiệu cho sản phẩm này.'
                                      : p.description,
                                  style: const TextStyle(fontSize: 15.5, height: 1.5, color: AppColors.ink),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Container(
                            padding: const EdgeInsets.fromLTRB(18, 14, 12, 14),
                            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)),
                            child: Row(
                              children: [
                                const Expanded(
                                  child: Text(
                                    'Số lượng',
                                    style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w600),
                                  ),
                                ),
                                _QtyButton(
                                  key: const Key('qty-minus'),
                                  icon: Icons.remove,
                                  onTap: inStock && _quantity > 1 ? () => setState(() => _quantity--) : null,
                                ),
                                SizedBox(
                                  width: 44,
                                  child: Text(
                                    '$_quantity',
                                    key: const Key('qty-count'),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
                                  ),
                                ),
                                _QtyButton(
                                  key: const Key('qty-plus'),
                                  icon: Icons.add,
                                  onTap: inStock && _quantity < maxQty ? () => setState(() => _quantity++) : null,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12 + MediaQuery.paddingOf(context).bottom,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 12, 12, 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: const [BoxShadow(color: Color(0x1A143C2D), blurRadius: 18, offset: Offset(0, 6))],
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Text('Tạm tính', style: TextStyle(fontSize: 13.5, color: AppColors.muted)),
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                formatVnd(p.price * _quantity),
                                key: const Key('product-total'),
                                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.black),
                              ),
                            ),
                          ],
                        ),
                      ),
                      SizedBox(
                        height: 52,
                        width: 52,
                        child: OutlinedButton(
                          key: const Key('product-add'),
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            shape: const CircleBorder(),
                            side: const BorderSide(color: AppColors.teaDark, width: 1.4),
                          ),
                          onPressed: inStock ? () => _addOnly(p) : null,
                          child: const Icon(Icons.add_shopping_cart, size: 22),
                        ),
                      ),
                      const SizedBox(width: 10),
                      SizedBox(
                        height: 54,
                        child: FilledButton.icon(
                          key: const Key('product-order'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.teaDark,
                            shape: const StadiumBorder(),
                            padding: const EdgeInsets.symmetric(horizontal: 22),
                            textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                          ),
                          onPressed: inStock ? () => _orderNow(p) : null,
                          icon: const Icon(Icons.arrow_forward),
                          iconAlignment: IconAlignment.end,
                          label: Text(inStock ? 'Đặt hàng' : 'Hết hàng'),
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
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {this.color = _chip, this.textColor = AppColors.ink});
  final String text;
  final Color color;
  final Color textColor;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
    child: Text(
      text,
      style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: textColor),
    ),
  );
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({super.key, required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 42,
    height: 42,
    child: IconButton(
      padding: EdgeInsets.zero,
      onPressed: onTap,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white,
        disabledBackgroundColor: Colors.white,
        side: BorderSide(color: onTap == null ? const Color(0xFFB7D3AF) : AppColors.teaDark, width: 1.4),
        foregroundColor: AppColors.ink,
        disabledForegroundColor: const Color(0xFF8DB485),
      ),
      icon: Icon(icon, size: 22),
    ),
  );
}
