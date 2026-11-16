// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_theme.dart';
import '../data/hub_repository.dart' show HubException;

/// Bundled demo photos (assets/images). Each falls back to a gradient if the
/// file is missing, so the app never shows a broken image.
const teaPhotos = ['assets/images/hero2.jpg', 'assets/images/dest.jpg', 'assets/images/hero.jpg'];
String teaPhotoFor(int seed) => teaPhotos[seed.abs() % teaPhotos.length];

/// A photo (or gradient fallback) filling its box, with an optional overlay.
class TeaPhoto extends StatelessWidget {
  const TeaPhoto({
    super.key,
    required this.asset,
    this.height,
    this.radius = 0,
    this.alignment = Alignment.center,
    this.shade = false,
    this.child,
  });
  final String asset;
  final double? height;
  final double radius;
  final Alignment alignment;

  /// Dark gradient from the bottom, so white text stays readable.
  final bool shade;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(
              asset,
              fit: BoxFit.cover,
              alignment: alignment,
              errorBuilder: (c, e, s) =>
                  DecoratedBox(decoration: BoxDecoration(gradient: placeholderGradient(asset.length))),
            ),
            if (shade)
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.center,
                    colors: [Color(0xC70F3A27), Color(0x000F3A27)],
                  ),
                ),
              ),
            ?child,
          ],
        ),
      ),
    );
  }
}

/// Placeholder for a photo: gradient with an icon (used where no photo fits).
class GradientBanner extends StatelessWidget {
  const GradientBanner({
    super.key,
    required this.seed,
    this.icon = Icons.eco,
    this.height = 120,
    this.radius = cardRadius,
  });
  final int seed;
  final IconData icon;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(gradient: placeholderGradient(seed), borderRadius: BorderRadius.circular(radius)),
      alignment: Alignment.center,
      child: Icon(icon, size: height * 0.4, color: Colors.white.withValues(alpha: 0.85)),
    );
  }
}

/// The two-leaf brand mark.
class LeafLogo extends StatelessWidget {
  const LeafLogo({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _LeafPainter());
}

class _LeafPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 64);
    final left = Path()
      ..moveTo(30, 58)
      ..cubicTo(30, 40, 18, 36, 8, 22)
      ..cubicTo(26, 20, 38, 28, 38, 44)
      ..close();
    final right = Path()
      ..moveTo(34, 58)
      ..cubicTo(34, 36, 44, 26, 60, 18)
      ..cubicTo(58, 38, 50, 52, 34, 58)
      ..close();
    canvas.drawPath(left, Paint()..color = AppColors.leafDark);
    canvas.drawPath(right, Paint()..color = AppColors.leaf);
    canvas.drawLine(
      const Offset(33, 58),
      const Offset(33, 30),
      Paint()
        ..color = const Color(0xB3FFFFFF)
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.color = AppColors.teaGreen});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(20)),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}

/// Small outlined "Nguồn: ..." chip that says where a block of data comes from.
class SourceChip extends StatelessWidget {
  const SourceChip(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0xFFD9D2BD)),
        ),
        child: Text(text, style: const TextStyle(fontSize: 11, color: AppColors.faint)),
      ),
    ),
  );
}

/// Small "Dữ liệu mẫu" chip: the screen under it is served by the sample
/// repository, not by the real backend. Shown only where that is true.
class SampleDataChip extends StatelessWidget {
  const SampleDataChip({super.key});
  @override
  Widget build(BuildContext context) => Container(
    key: const Key('sample-chip'),
    width: double.infinity,
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 2),
    alignment: Alignment.centerRight,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4D6),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE6C979)),
      ),
      child: const Text(
        'Dữ liệu mẫu',
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF7A5A00)),
      ),
    ),
  );
}

/// Pale yellow dashed notice banner.
class NoticeBanner extends StatelessWidget {
  const NoticeBanner(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => CustomPaint(
    painter: DashedBorderPainter(AppColors.noteBorder, 12),
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: AppColors.noteBg, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: const TextStyle(fontSize: 12.5, color: Color(0xFF6B5600), height: 1.35)),
    ),
  );
}

/// Thin dashed rounded border (notice banners, demo-account box).
class DashedBorderPainter extends CustomPainter {
  DashedBorderPainter(this.color, this.radius);
  final Color color;
  final double radius;
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)));
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += 7) {
        canvas.drawPath(m.extractPath(d, (d + 4).clamp(0, m.length)), paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant DashedBorderPainter old) => old.color != color;
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.message, {super.key, this.icon = Icons.spa_outlined});
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.leaf),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
          ],
        ),
      ),
    );
  }
}

/// Serif section heading.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
    child: Text(text, style: serif(21)),
  );
}

/// Big serif page title with an optional sub line.
class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 16, 4, 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: serif(28)),
        if (subtitle != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(subtitle!, style: const TextStyle(color: AppColors.muted, fontSize: 15, height: 1.45)),
          ),
      ],
    ),
  );
}

/// 2-column grid of small fact cards (label above, bold value below).
class FactsGrid extends StatelessWidget {
  const FactsGrid(this.facts, {super.key});
  final List<(String, String)> facts;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final w = (c.maxWidth - 10) / 2;
      return Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final (label, value) in facts)
            Container(
              width: w,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.ink),
                  ),
                ],
              ),
            ),
        ],
      );
    },
  );
}

/// Header of an inner page: round outlined back button, serif title, heart.
class PageHeader extends StatelessWidget {
  const PageHeader(this.title, {super.key, this.onBack, this.trailing, this.showBack = true});
  final String title;
  final VoidCallback? onBack;
  final Widget? trailing;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.cream,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          if (showBack) ...[BackCircle(onBack: onBack), const SizedBox(width: 12)],
          Expanded(
            child: Text(title, style: serif(19), maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

class BackCircle extends StatelessWidget {
  const BackCircle({super.key, this.onBack});
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: 'Quay lại',
    child: InkResponse(
      key: const Key('back'),
      onTap: onBack ?? () => context.canPop() ? context.pop() : context.go('/shop'),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.border),
        ),
        alignment: Alignment.center,
        child: const Icon(Icons.chevron_left, size: 24, color: AppColors.ink),
      ),
    ),
  );
}

/// Page used inside a shell (which already has the bottom bar): [PageHeader]
/// on top, content below.
class InnerPage extends StatelessWidget {
  const InnerPage({super.key, required this.title, required this.child, this.trailing, this.showBack = true});
  final String title;
  final Widget child;
  final Widget? trailing;
  final bool showBack;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      PageHeader(title, trailing: trailing, showBack: showBack),
      Expanded(child: child),
    ],
  );
}

class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(label, style: TextStyle(color: Colors.grey.shade700)),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
      ],
    ),
  );
}

void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
}

/// Loads a future and shows spinner, error with retry, or the data.
/// [builder] receives a `reload` callback to call after changing data.
class LoadView<T> extends StatefulWidget {
  const LoadView({super.key, required this.load, required this.builder});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<LoadView<T>> createState() => _LoadViewState<T>();
}

class _LoadViewState<T> extends State<LoadView<T>> {
  late Future<T> _future = widget.load();

  Future<void> _reload() async {
    setState(() {
      _future = widget.load();
    });
    try {
      await _future;
    } catch (_) {
      // the error is shown by the FutureBuilder
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          // Only Vietnamese messages written for the user are shown; raw errors never are.
          final error = snapshot.error;
          final message = error is HubException ? error.message : 'Không tải được dữ liệu. Thử lại sau.';
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off_outlined, size: 40, color: AppColors.faint),
                  const SizedBox(height: 10),
                  Text(message, key: const Key('load-error'), textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(key: const Key('load-retry'), onPressed: _reload, child: const Text('Thử lại')),
                ],
              ),
            ),
          );
        }
        return widget.builder(context, snapshot.data as T, _reload);
      },
    );
  }
}

/// Bottom navigation shell shared by every role.
class NavDestination {
  const NavDestination(this.label, this.icon, this.location);
  final String label;
  final IconData icon;
  final String location;
}

class RoleShell extends StatelessWidget {
  const RoleShell({
    super.key,
    required this.destinations,
    required this.location,
    required this.child,
    this.badges = const {},
    this.indexFor,
    this.roleLabel,
  });
  final List<NavDestination> destinations;

  /// Overrides which tab is highlighted for [location] (pages under a tab).
  final int Function(String location)? indexFor;

  /// Staff roles show a dark green band with the brand and this role name.
  final String? roleLabel;
  final String location;
  final Widget child;

  /// Badge count per destination location.
  final Map<String, int> badges;

  @override
  Widget build(BuildContext context) {
    var index = indexFor?.call(location) ?? destinations.indexWhere((d) => d.location == location);
    if (index < 0) {
      index = destinations.lastIndexWhere((d) => location.startsWith(d.location));
    }
    if (index < 0) index = 0;
    return Scaffold(
      backgroundColor: AppColors.cream,
      body: roleLabel == null
          ? SafeArea(bottom: false, child: child)
          : Column(
              children: [
                _RoleBand(roleLabel!),
                Expanded(child: child),
              ],
            ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (i) => context.go(destinations[i].location),
          destinations: [
            for (final d in destinations)
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: (badges[d.location] ?? 0) > 0,
                  label: Text('${badges[d.location] ?? 0}'),
                  child: Icon(d.icon),
                ),
                label: d.label,
              ),
          ],
        ),
      ),
    );
  }
}

/// Dark green top band of the staff interfaces (same green as the web sidebar).
class _RoleBand extends StatelessWidget {
  const _RoleBand(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: const Color(0xFF143C2D),
    padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 10, 16, 10),
    child: Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: AppColors.lime, borderRadius: BorderRadius.circular(10)),
          alignment: Alignment.center,
          child: const Icon(Icons.eco, size: 20, color: Color(0xFF143C2D)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text('Về Xứ Chè', style: serif(18, color: Colors.white)),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(color: AppColors.lime, borderRadius: BorderRadius.circular(999)),
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF143C2D)),
          ),
        ),
      ],
    ),
  );
}

/// Dashboard figure tile: icon, big serif value, label.
class StatTile extends StatelessWidget {
  const StatTile(this.label, this.value, this.icon, {super.key});
  final String label;
  final String value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(color: AppColors.tileLight, borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, size: 20, color: AppColors.teaDark),
        ),
        const SizedBox(height: 10),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: serif(24)),
        ),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
      ],
    ),
  );
}

/// Two-column grid of [StatTile]s.
class StatGrid extends StatelessWidget {
  const StatGrid(this.tiles, {super.key});
  final List<StatTile> tiles;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, c) {
      final w = (c.maxWidth - 12) / 2;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [for (final t in tiles) SizedBox(width: w, child: t)],
      );
    },
  );
}
