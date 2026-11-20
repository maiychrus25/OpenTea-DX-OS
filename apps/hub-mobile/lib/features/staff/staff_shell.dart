// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/format/formatting.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/staff.dart';
import '../../shared/widgets.dart' show SampleDataChip;
import 'staff_nav.dart';
import 'staff_widgets.dart';

final ThemeData _staffTheme = buildStaffTheme();

/// Wraps [child] in the DX-OS web look. Used by pages that live outside the shell.
class StaffTheme extends StatelessWidget {
  const StaffTheme({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Theme(data: _staffTheme, child: child);
}

/// Pushed page (detail, form) with a back arrow, in the staff look.
class DetailScaffold extends StatelessWidget {
  const DetailScaffold({super.key, required this.title, required this.body, this.actions, this.floating});
  final String title;
  final Widget body;
  final List<Widget>? actions;
  final Widget? floating;

  @override
  Widget build(BuildContext context) => StaffTheme(
    child: Scaffold(
      appBar: AppBar(title: Text(title), actions: actions),
      floatingActionButton: floating,
      body: body,
    ),
  );
}

/// Figures shown as badges on the menu and the bell.
class _Counts {
  const _Counts({this.unread = 0, this.pendingJournal = 0});
  final int unread;
  final int pendingJournal;
}

/// Shell of every staff role: dark green drawer like the web sidebar, top bar with
/// menu, search, bell and avatar, and a bottom bar with the most used pages.
class StaffShell extends StatefulWidget {
  const StaffShell({super.key, required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  _Counts _counts = const _Counts();

  StaffNav get _nav => navFor(staffKindOf(context.read<AppState>().claims) ?? StaffKind.manager);

  @override
  void initState() {
    super.initState();
    _loadCounts();
  }

  @override
  void didUpdateWidget(StaffShell old) {
    super.didUpdateWidget(old);
    if (old.location != widget.location) _loadCounts();
  }

  Future<void> _loadCounts() async {
    final claims = context.read<AppState>().claims;
    final repo = context.read<HubRepository>();
    final nav = _nav;
    if (claims == null || nav.kind == StaffKind.guide) return;
    final code = claims.htxCode ?? '';
    final household = nav.kind == StaffKind.farmer ? claims.householdId : null;
    try {
      final notes = await repo.listNotifications(code, householdId: household);
      final journal = nav.kind == StaffKind.manager ? await repo.listJournal(code) : const <JournalEntry>[];
      if (!mounted) return;
      setState(() {
        _counts = _Counts(
          unread: notes.where((n) => !n.isRead).length,
          pendingJournal: journal.where((e) => e.status == JournalStatus.pendingApproval).length,
        );
      });
    } on HubException {
      // badges are optional
    }
  }

  Future<void> _search() async {
    final path = await showSearch<String>(context: context, delegate: _MenuSearch(_nav));
    if (path != null && path.isNotEmpty && mounted) context.go(path);
  }

  void _go(String path) {
    Navigator.of(context).maybePop();
    context.go(path);
  }

  @override
  Widget build(BuildContext context) {
    final nav = _nav;
    final claims = context.watch<AppState>().claims;
    final name = claims?.name ?? '';
    return StaffTheme(
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: StaffColors.background,
        appBar: _TopBar(
          nav: nav,
          name: name,
          unread: _counts.unread,
          onMenu: () => _scaffoldKey.currentState?.openDrawer(),
          // A page opened from the menu or a card (not the home or a bottom bar tab) has a way back.
          onBack: _isSubPage(nav, widget.location)
              ? () => context.canPop() ? context.pop() : context.go(nav.home)
              : null,
          onSearch: _search,
          onBell: () => context.go(nav.notificationsPath),
          onAvatar: () => context.go(nav.accountPath),
        ),
        drawer: _StaffDrawer(nav: nav, location: widget.location, counts: _counts, onGo: _go),
        body: Column(
          children: [
            if (_showsSample(context, widget.location)) const SampleDataChip(),
            Expanded(child: widget.child),
          ],
        ),
        bottomNavigationBar: _BottomBar(nav: nav, location: widget.location, onGo: (p) => context.go(p)),
      ),
    );
  }
}

/// Pages served by the core ("Lõi"): real with the real repository, sample with the mock.
const _corePaths = {
  '/farmer',
  '/farmer/journal',
  '/farmer/schedule',
  '/farmer/notifications',
  '/farmer/parcels',
  '/manager',
  '/manager/schedule',
  '/manager/members',
  '/manager/households',
  '/manager/journal',
  '/manager/journal-approve',
  '/manager/zones',
  '/manager/lots',
  '/manager/notifications',
  '/manager/profile',
};

/// Whether the page at [location] shows sample data, so it carries the "Dữ liệu mẫu" chip.
/// Account pages hold no data; everything outside the core is sample until its mini-app exists.
bool _showsSample(BuildContext context, String location) {
  // Chat owns its sample/online label; the storefront fallback is not its data source online.
  if (location.endsWith('/me') || location.endsWith('/chat')) return false;
  final isCore = _corePaths.any(
    (p) => location == p || (p != '/farmer' && p != '/manager' && location.startsWith('$p/')),
  );
  return !isCore || context.read<HubRepository>().coreIsSample;
}

/// True for a page inside the shell that is neither the role's home nor a bottom bar tab.
bool _isSubPage(StaffNav nav, String location) => location != nav.home && !nav.bottom.any((m) => m.path == location);

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return 'U';
  final pick = parts.length == 1 ? [parts.first] : [parts[parts.length - 2], parts.last];
  return pick.map((p) => p[0]).join().toUpperCase();
}

class _TopBar extends StatelessWidget implements PreferredSizeWidget {
  const _TopBar({
    required this.nav,
    required this.name,
    required this.unread,
    required this.onMenu,
    this.onBack,
    required this.onSearch,
    required this.onBell,
    required this.onAvatar,
  });
  final StaffNav nav;
  final String name;
  final int unread;
  final VoidCallback onMenu;

  /// Set on pages that are not the home or a bottom bar tab: an arrow before the menu button.
  final VoidCallback? onBack;
  final VoidCallback onSearch;
  final VoidCallback onBell;
  final VoidCallback onAvatar;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    child: Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: StaffColors.border)),
      ),
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      height: 60 + MediaQuery.paddingOf(context).top,
      child: Row(
        children: [
          if (onBack != null)
            IconButton(
              key: const Key('staff-back'),
              tooltip: 'Quay lại',
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back, size: 26),
            ),
          IconButton(
            key: const Key('menu-button'),
            tooltip: 'Mở menu',
            onPressed: onMenu,
            icon: const Icon(Icons.menu, size: 26),
          ),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'OpenTea DX-OS',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: StaffColors.ink),
                ),
                Text(
                  nav.roleName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: StaffColors.muted),
                ),
              ],
            ),
          ),
          IconButton(
            key: const Key('staff-search'),
            tooltip: 'Tìm kiếm',
            onPressed: onSearch,
            icon: const Icon(Icons.search),
          ),
          IconButton(
            key: const Key('staff-bell'),
            tooltip: 'Thông báo',
            onPressed: onBell,
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              backgroundColor: StaffColors.bad,
              child: const Icon(Icons.notifications_none),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              key: const Key('staff-avatar'),
              tooltip: 'Hồ sơ tài khoản',
              onPressed: onAvatar,
              icon: CircleAvatar(
                radius: 17,
                backgroundColor: StaffColors.neutralSoft,
                child: Text(
                  initialsOf(name),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: StaffColors.ink),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.nav, required this.location, required this.onGo});
  final StaffNav nav;
  final String location;
  final void Function(String path) onGo;

  bool _selected(MenuItem m) =>
      m.path == nav.home ? location == nav.home : (location == m.path || location.startsWith('${m.path}/'));

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: StaffColors.border)),
    ),
    padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
    child: SizedBox(
      height: 62,
      child: Row(
        children: [
          for (final (i, m) in nav.bottom.indexed) ...[
            if (i == 1) _videoButton(context),
            Expanded(
              child: InkWell(
                key: Key('bottom-${m.path}'),
                onTap: () => onGo(m.path),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 44,
                      height: 26,
                      decoration: BoxDecoration(
                        color: _selected(m) ? StaffColors.secondary : Colors.transparent,
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: Icon(m.icon, size: 21, color: _selected(m) ? StaffColors.primary : StaffColors.muted),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      m.bottomLabel ?? m.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: _selected(m) ? FontWeight.w800 : FontWeight.w500,
                        color: _selected(m) ? StaffColors.primary : StaffColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    ),
  );

  Widget _videoButton(BuildContext context) => Expanded(
    child: InkWell(
      key: const Key('bottom-videos'),
      onTap: () => context.push(nav.videosPath),
      // Same look as the tabs beside it: it opens a page on top, so it is never shown as selected.
      child: const Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 26,
            child: Icon(Icons.smart_display_outlined, size: 21, color: StaffColors.muted),
          ),
          SizedBox(height: 2),
          Text(
            'Reels',
            maxLines: 1,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: StaffColors.muted),
          ),
        ],
      ),
    ),
  );
}

class _StaffDrawer extends StatefulWidget {
  const _StaffDrawer({required this.nav, required this.location, required this.counts, required this.onGo});
  final StaffNav nav;
  final String location;
  final _Counts counts;
  final void Function(String path) onGo;

  @override
  State<_StaffDrawer> createState() => _StaffDrawerState();
}

class _StaffDrawerState extends State<_StaffDrawer> {
  static const _fg = Colors.white;
  static final _dim = Colors.white.withValues(alpha: 0.75);

  StaffNav get nav => widget.nav;
  String get location => widget.location;
  _Counts get counts => widget.counts;
  void Function(String path) get onGo => widget.onGo;

  late bool _shopOpen = nav.shop.any((m) => m.path == nav.itemFor(location)?.path);

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final claims = state.claims;
    final active = nav.itemFor(location);
    final isGuide = nav.kind == StaffKind.guide;
    return Drawer(
      width: 300,
      backgroundColor: StaffColors.sidebar,
      shape: const RoundedRectangleBorder(),
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [StaffColors.sidebar, StaffColors.sidebarDeep],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Brand
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(color: StaffColors.lime, borderRadius: BorderRadius.circular(12)),
                      child: const Icon(Icons.eco, color: StaffColors.sidebar, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'OpenTea DX-OS',
                            style: TextStyle(color: _fg, fontWeight: FontWeight.w800, fontSize: 17),
                          ),
                          Text('Chuyển đổi số HTX', style: TextStyle(color: _dim, fontSize: 12)),
                        ],
                      ),
                    ),
                    IconButton(
                      key: const Key('drawer-close'),
                      tooltip: 'Đóng menu',
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: Icon(Icons.close, color: _dim),
                    ),
                  ],
                ),
              ),
              const Divider(color: Color(0x1FFFFFFF), height: 1),
              // HTX block
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: isGuide
                    ? _CoopBlock(
                        badge: 'NV',
                        name: claims?.name ?? 'Nhân viên dẫn tour',
                        place: 'Dẫn các tour do HTX giao',
                      )
                    : _HtxBlock(code: claims?.htxCode ?? ''),
              ),
              const Divider(color: Color(0x1FFFFFFF), height: 1),
              Expanded(
                child: ListView(
                  key: const Key('drawer-menu'),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  children: [
                    for (final m in nav.main) _item(m, active, badge: _badgeFor(m)),
                    if (nav.shop.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 1),
                        child: InkWell(
                          key: const Key('drawer-shop-toggle'),
                          borderRadius: BorderRadius.circular(8),
                          onTap: () => setState(() => _shopOpen = !_shopOpen),
                          child: Container(
                            height: 44,
                            padding: const EdgeInsets.only(left: 12, right: 10),
                            child: Row(
                              children: [
                                Icon(Icons.storefront_outlined, size: 20, color: _dim),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    'Gian hàng',
                                    style: TextStyle(color: _dim, fontSize: 14.5, fontWeight: FontWeight.w500),
                                  ),
                                ),
                                Icon(_shopOpen ? Icons.expand_less : Icons.expand_more, color: _dim),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (_shopOpen)
                        for (final m in nav.shop) _item(m, active, indent: 20),
                    ],
                  ],
                ),
              ),
              const Divider(color: Color(0x1FFFFFFF), height: 1),
              // Footer
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'ĐANG XEM VỚI VAI TRÒ',
                      style: TextStyle(
                        color: _dim.withValues(alpha: 0.6),
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      nav.roleName,
                      key: const Key('drawer-role'),
                      style: const TextStyle(color: _fg, fontWeight: FontWeight.w700, fontSize: 14),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        InkResponse(
                          onTap: () => onGo(nav.accountPath),
                          child: CircleAvatar(
                            radius: 18,
                            backgroundColor: Colors.white.withValues(alpha: 0.12),
                            child: Text(
                              initialsOf(claims?.name ?? ''),
                              style: const TextStyle(color: _fg, fontWeight: FontWeight.w800, fontSize: 13),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                claims?.name ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: _fg, fontWeight: FontWeight.w700, fontSize: 13.5),
                              ),
                              Text(nav.roleName, style: TextStyle(color: _dim, fontSize: 12)),
                            ],
                          ),
                        ),
                        TextButton(
                          key: const Key('staff-logout'),
                          onPressed: () => state.signOut(),
                          style: TextButton.styleFrom(foregroundColor: _dim, minimumSize: const Size(0, 40)),
                          child: const Text('Đăng xuất', style: TextStyle(fontSize: 13)),
                        ),
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
  }

  int _badgeFor(MenuItem m) {
    if (m.path == nav.notificationsPath && nav.kind != StaffKind.guide) return counts.unread;
    if (m.path == '/manager/journal-approve') return counts.pendingJournal;
    return 0;
  }

  Widget _item(MenuItem m, MenuItem? active, {int badge = 0, double indent = 0}) {
    final isActive = identical(m, active) || (active != null && m.path == active.path);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: Key('menu-${m.path}'),
          borderRadius: BorderRadius.circular(8),
          onTap: () => onGo(m.path),
          child: Container(
            height: 44,
            padding: EdgeInsets.only(left: 12 + indent, right: 10),
            decoration: BoxDecoration(
              color: isActive ? Colors.white.withValues(alpha: 0.08) : null,
              borderRadius: BorderRadius.circular(8),
              border: isActive ? const Border(left: BorderSide(color: StaffColors.lime, width: 3)) : null,
            ),
            child: Row(
              children: [
                Icon(m.icon, size: 20, color: isActive ? _fg : _dim),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    m.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isActive ? _fg : _dim,
                      fontSize: 14.5,
                      fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ),
                if (badge > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                    decoration: BoxDecoration(color: StaffColors.lime, borderRadius: BorderRadius.circular(999)),
                    child: Text(
                      '$badge',
                      style: const TextStyle(color: StaffColors.sidebar, fontSize: 11, fontWeight: FontWeight.w800),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CoopBlock extends StatelessWidget {
  const _CoopBlock({required this.badge, required this.name, required this.place});
  final String badge;
  final String name;
  final String place;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
        child: Text(
          badge,
          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 0.5),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name,
              key: const Key('drawer-htx-name'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14.5),
            ),
            Text(
              place,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12),
            ),
          ],
        ),
      ),
    ],
  );
}

class _HtxBlock extends StatelessWidget {
  const _HtxBlock({required this.code});
  final String code;
  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return FutureBuilder<HtxProfile>(
      future: repo.getHtxProfile(code),
      builder: (context, snap) =>
          _CoopBlock(badge: 'HTX', name: snap.data?.name ?? 'Đang tải...', place: snap.data?.address ?? '---'),
    );
  }
}

/// Search box of the top bar: finds menu pages by name.
class _MenuSearch extends SearchDelegate<String> {
  _MenuSearch(this.nav) : super(searchFieldLabel: 'Tìm trang hoặc mục...');
  final StaffNav nav;

  @override
  ThemeData appBarTheme(BuildContext context) => _staffTheme.copyWith(
    inputDecorationTheme: const InputDecorationTheme(
      border: InputBorder.none,
      filled: false,
      enabledBorder: InputBorder.none,
      focusedBorder: InputBorder.none,
    ),
  );

  @override
  List<Widget>? buildActions(BuildContext context) => [
    if (query.isNotEmpty) IconButton(onPressed: () => query = '', icon: const Icon(Icons.clear)),
  ];

  @override
  Widget? buildLeading(BuildContext context) =>
      IconButton(onPressed: () => close(context, ''), icon: const Icon(Icons.arrow_back));

  @override
  Widget buildResults(BuildContext context) => _list(context);

  @override
  Widget buildSuggestions(BuildContext context) => _list(context);

  Widget _list(BuildContext context) {
    final q = stripDiacritics(query.trim().toLowerCase());
    final hits = [
      for (final m in nav.all)
        if (q.isEmpty || stripDiacritics(m.label.toLowerCase()).contains(q)) m,
    ];
    return Container(
      color: StaffColors.background,
      child: hits.isEmpty
          ? const StaffEmpty('Không có trang nào khớp')
          : ListView(
              children: [
                for (final m in hits)
                  ListTile(
                    leading: Icon(m.icon, color: StaffColors.primary),
                    title: Text(m.label),
                    onTap: () => close(context, m.path),
                  ),
              ],
            ),
    );
  }
}
