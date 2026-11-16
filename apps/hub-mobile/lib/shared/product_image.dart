// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// The picture seed of a product known only by its id ('prod-03' gives 2, like the seed of the seeded products).
int productSeedFromId(String id) {
  final digits = RegExp(r'\d+$').firstMatch(id)?.group(0);
  final n = digits == null ? null : int.tryParse(digits);
  return n == null ? id.length : n - 1;
}

/// A demo picture of a tea product, drawn in code (no image file): a pouch, a tin or a cup, chosen by [seed].
/// It stands in for the photo a cooperative will upload for each product.
class ProductImage extends StatelessWidget {
  const ProductImage({super.key, required this.seed, this.productId, this.height, this.width, this.radius = 14});
  final int seed;

  /// When a picture named after the product exists in assets/images/products (prod-01.png), it is shown instead of the
  /// drawing; without the file the drawing stays.
  final String? productId;
  final double? height;
  final double? width;
  final double radius;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: SizedBox(
      height: height,
      width: width ?? double.infinity,
      child: productId == null
          ? CustomPaint(painter: _ProductPainter(seed.abs()))
          : Image.asset(
              'assets/images/products/$productId.png',
              fit: BoxFit.cover,
              errorBuilder: (context, error, stack) => CustomPaint(painter: _ProductPainter(seed.abs())),
            ),
    ),
  );
}

class _ProductPainter extends CustomPainter {
  _ProductPainter(this.seed);
  final int seed;

  static const _backgrounds = [Color(0xFFE4EFD9), Color(0xFFE7F0EA), Color(0xFFDDE9D2), Color(0xFFEAF1E4)];

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    canvas.drawRect(Offset.zero & size, Paint()..color = _backgrounds[seed % _backgrounds.length]);
    // A soft round "sun" behind the product.
    canvas.drawCircle(Offset(w * 0.5, h * 0.52), h * 0.42, Paint()..color = Colors.white.withValues(alpha: 0.55));
    // A few tea leaves around it.
    _leaf(canvas, Offset(w * 0.16, h * 0.28), h * 0.16, -0.7, AppColors.leaf.withValues(alpha: 0.55));
    _leaf(canvas, Offset(w * 0.84, h * 0.72), h * 0.14, 2.4, AppColors.leafDark.withValues(alpha: 0.45));
    _leaf(canvas, Offset(w * 0.82, h * 0.22), h * 0.1, 0.5, AppColors.leaf.withValues(alpha: 0.4));
    switch (seed % 3) {
      case 0:
        _pouch(canvas, size);
      case 1:
        _tin(canvas, size);
      default:
        _cup(canvas, size);
    }
  }

  void _leaf(Canvas canvas, Offset c, double len, double angle, Color color) {
    canvas.save();
    canvas.translate(c.dx, c.dy);
    canvas.rotate(angle);
    final path = Path()
      ..moveTo(0, -len / 2)
      ..quadraticBezierTo(len * 0.42, -len * 0.05, 0, len / 2)
      ..quadraticBezierTo(-len * 0.42, -len * 0.05, 0, -len / 2);
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawLine(
      Offset(0, -len / 2),
      Offset(0, len / 2),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.5)
        ..strokeWidth = len * 0.04,
    );
    canvas.restore();
  }

  void _label(Canvas canvas, Rect r) {
    canvas.drawRRect(
      RRect.fromRectAndRadius(r, Radius.circular(r.shortestSide * 0.12)),
      Paint()..color = AppColors.paper,
    );
    _leaf(canvas, Offset(r.center.dx, r.top + r.height * 0.34), r.height * 0.34, 0.4, AppColors.leaf);
    final line = Paint()..color = AppColors.teaDark.withValues(alpha: 0.55);
    final lw = r.width * 0.56;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(r.center.dx, r.top + r.height * 0.72), width: lw, height: r.height * 0.07),
        const Radius.circular(3),
      ),
      line,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(r.center.dx, r.top + r.height * 0.86), width: lw * 0.6, height: r.height * 0.06),
        const Radius.circular(3),
      ),
      line,
    );
  }

  void _pouch(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    final body = Rect.fromCenter(center: Offset(w * 0.5, h * 0.56), width: h * 0.52, height: h * 0.74);
    final path = Path()
      ..moveTo(body.left, body.top + body.height * 0.06)
      ..lineTo(body.left + body.width * 0.04, body.bottom)
      ..lineTo(body.right - body.width * 0.04, body.bottom)
      ..lineTo(body.right, body.top + body.height * 0.06)
      ..close();
    canvas.drawPath(path, Paint()..color = AppColors.teaDark);
    // The tear-off top and the zip line.
    canvas.drawRect(
      Rect.fromLTWH(body.left, body.top, body.width, body.height * 0.07),
      Paint()..color = AppColors.teaDeeper,
    );
    canvas.drawLine(
      Offset(body.left + body.width * 0.06, body.top + body.height * 0.14),
      Offset(body.right - body.width * 0.06, body.top + body.height * 0.14),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..strokeWidth = 1.5,
    );
    _label(
      canvas,
      Rect.fromLTWH(
        body.left + body.width * 0.14,
        body.top + body.height * 0.26,
        body.width * 0.72,
        body.height * 0.58,
      ),
    );
  }

  void _tin(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    final body = Rect.fromCenter(center: Offset(w * 0.5, h * 0.58), width: h * 0.5, height: h * 0.6);
    canvas.drawRRect(RRect.fromRectAndRadius(body, Radius.circular(h * 0.04)), Paint()..color = AppColors.leafDark);
    final lid = Rect.fromLTWH(body.left - h * 0.02, body.top - h * 0.1, body.width + h * 0.04, h * 0.11);
    canvas.drawRRect(RRect.fromRectAndRadius(lid, Radius.circular(h * 0.03)), Paint()..color = AppColors.teaDark);
    _label(
      canvas,
      Rect.fromLTWH(
        body.left + body.width * 0.12,
        body.top + body.height * 0.14,
        body.width * 0.76,
        body.height * 0.72,
      ),
    );
  }

  void _cup(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    final cx = w * 0.5;
    // Saucer.
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.8), width: h * 0.74, height: h * 0.14),
      Paint()..color = Colors.white,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.8), width: h * 0.74, height: h * 0.14),
      Paint()
        ..style = PaintingStyle.stroke
        ..color = AppColors.border
        ..strokeWidth = 1.5,
    );
    // Cup body and handle.
    final cup = Path()
      ..moveTo(cx - h * 0.27, h * 0.5)
      ..quadraticBezierTo(cx - h * 0.25, h * 0.8, cx, h * 0.8)
      ..quadraticBezierTo(cx + h * 0.25, h * 0.8, cx + h * 0.27, h * 0.5)
      ..close();
    canvas.drawPath(cup, Paint()..color = Colors.white);
    canvas.drawPath(
      cup,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = AppColors.border
        ..strokeWidth = 1.5,
    );
    canvas.drawArc(
      Rect.fromCenter(center: Offset(cx + h * 0.29, h * 0.58), width: h * 0.2, height: h * 0.2),
      -1.4,
      3.0,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..color = AppColors.border
        ..strokeWidth = h * 0.03,
    );
    // The tea, and the rim.
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.5), width: h * 0.54, height: h * 0.1),
      Paint()..color = AppColors.leaf,
    );
    // Steam.
    final steam = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..color = AppColors.teaDark.withValues(alpha: 0.3)
      ..strokeWidth = h * 0.025;
    for (var i = -1; i <= 1; i++) {
      final x = cx + i * h * 0.12;
      canvas.drawPath(
        Path()
          ..moveTo(x, h * 0.42)
          ..cubicTo(x - h * 0.05, h * 0.34, x + h * 0.05, h * 0.28, x, h * 0.2),
        steam,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ProductPainter old) => old.seed != seed;
}
