// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/role/role.dart';

/// The four staff interfaces. Officers share the `/manager` routes with
/// managers (see `roleFromClaims`) but have the menu of the web's officer app.
enum StaffKind { manager, officer, farmer, operator }

StaffKind? staffKindOf(Claims? claims) {
  if (claims == null) return null;
  if (claims.hasRole(roleOperator)) return StaffKind.operator;
  if (claims.hasRole(roleManager)) return StaffKind.manager;
  if (claims.hasRole(roleOfficer)) return StaffKind.officer;
  if (claims.hasRole(roleFarmer)) return StaffKind.farmer;
  return null;
}

class MenuItem {
  const MenuItem(this.label, this.icon, this.path, {this.bottomLabel});
  final String label;
  final IconData icon;
  final String path;

  /// Shorter text for the bottom bar when [label] is too long.
  final String? bottomLabel;
}

class StaffNav {
  const StaffNav({
    required this.kind,
    required this.roleName,
    required this.home,
    required this.main,
    required this.shop,
    required this.bottom,
    required this.notificationsPath,
    required this.accountPath,
  });
  final StaffKind kind;

  /// Role label as the web sidebar shows it.
  final String roleName;
  final String home;
  final List<MenuItem> main;

  /// The "Gian hàng" entries: storefront work that already existed before the redesign.
  /// Tour work (bookings, tour money, check-in) is only ever in the operator's.
  final List<MenuItem> shop;
  final List<MenuItem> bottom;
  final String notificationsPath;
  final String accountPath;

  List<MenuItem> get all => [...main, ...shop];

  MenuItem? itemFor(String location) {
    MenuItem? best;
    for (final m in all) {
      final hit = m.path == home ? location == home : (location == m.path || location.startsWith('${m.path}/'));
      if (hit && (best == null || m.path.length > best.path.length)) best = m;
    }
    return best;
  }
}

const _manager = StaffNav(
  kind: StaffKind.manager,
  roleName: 'Trưởng HTX',
  home: '/manager',
  notificationsPath: '/manager/notifications',
  accountPath: '/manager/me',
  main: [
    MenuItem('Tổng quan', Icons.home_outlined, '/manager'),
    MenuItem('Lịch thu hái', Icons.calendar_month_outlined, '/manager/schedule'),
    MenuItem('Quản lý thành viên', Icons.groups_outlined, '/manager/members'),
    MenuItem('Bản tin', Icons.newspaper_outlined, '/manager/bulletin'),
    MenuItem('Duyệt nhật ký', Icons.fact_check_outlined, '/manager/journal-approve'),
    MenuItem('Trợ lý AI', Icons.auto_awesome_outlined, '/manager/chat'),
    MenuItem('Vùng trồng', Icons.eco_outlined, '/manager/zones'),
    MenuItem('Lô hàng', Icons.inventory_2_outlined, '/manager/lots'),
    MenuItem('Thông báo', Icons.notifications_none, '/manager/notifications'),
    MenuItem('Hồ sơ HTX', Icons.account_balance_outlined, '/manager/profile'),
  ],
  shop: [
    MenuItem('Sản phẩm', Icons.local_cafe_outlined, '/manager/products'),
    MenuItem('Đơn hàng', Icons.receipt_long_outlined, '/manager/orders'),
    MenuItem('Thu tiền', Icons.payments_outlined, '/manager/payments'),
    MenuItem('Bài gửi duyệt', Icons.article_outlined, '/manager/articles'),
  ],
  bottom: [
    MenuItem('Tổng quan', Icons.home_outlined, '/manager'),
    MenuItem('Lịch thu hái', Icons.calendar_month_outlined, '/manager/schedule', bottomLabel: 'Thu hái'),
    MenuItem('Duyệt nhật ký', Icons.fact_check_outlined, '/manager/journal-approve'),
    MenuItem('Đơn hàng', Icons.receipt_long_outlined, '/manager/orders'),
    MenuItem('Thông báo', Icons.notifications_none, '/manager/notifications'),
  ],
);

const _officer = StaffNav(
  kind: StaffKind.officer,
  roleName: 'Cán bộ KT',
  home: '/manager',
  notificationsPath: '/manager/notifications',
  accountPath: '/manager/me',
  main: [
    MenuItem('Tổng quan', Icons.home_outlined, '/manager'),
    MenuItem('Lịch thu hái', Icons.calendar_month_outlined, '/manager/schedule'),
    MenuItem('Vùng trồng', Icons.eco_outlined, '/manager/zones'),
    MenuItem('Nông hộ', Icons.groups_outlined, '/manager/households'),
    MenuItem('Nhật ký', Icons.description_outlined, '/manager/journal'),
    MenuItem('Trợ lý AI', Icons.auto_awesome_outlined, '/manager/chat'),
    MenuItem('Lô hàng', Icons.inventory_2_outlined, '/manager/lots'),
    MenuItem('Thông báo', Icons.notifications_none, '/manager/notifications'),
    MenuItem('Tài khoản', Icons.person_outline, '/manager/me'),
  ],
  shop: [
    MenuItem('Sản phẩm', Icons.local_cafe_outlined, '/manager/products'),
    MenuItem('Đơn hàng', Icons.receipt_long_outlined, '/manager/orders'),
    MenuItem('Thu tiền', Icons.payments_outlined, '/manager/payments'),
  ],
  bottom: [
    MenuItem('Tổng quan', Icons.home_outlined, '/manager'),
    MenuItem('Nông hộ', Icons.groups_outlined, '/manager/households'),
    MenuItem('Nhật ký', Icons.description_outlined, '/manager/journal'),
    MenuItem('Lô hàng', Icons.inventory_2_outlined, '/manager/lots'),
    MenuItem('Đơn hàng', Icons.receipt_long_outlined, '/manager/orders'),
  ],
);

const _farmer = StaffNav(
  kind: StaffKind.farmer,
  roleName: 'Nông dân',
  home: '/farmer',
  notificationsPath: '/farmer/notifications',
  accountPath: '/farmer/me',
  main: [
    MenuItem('Tổng quan', Icons.home_outlined, '/farmer'),
    MenuItem('Nhật ký đồng ruộng', Icons.description_outlined, '/farmer/journal'),
    MenuItem('Quét bệnh cây', Icons.photo_camera_outlined, '/farmer/scan'),
    MenuItem('Trợ lý AI', Icons.auto_awesome_outlined, '/farmer/chat'),
    MenuItem('Lịch', Icons.calendar_month_outlined, '/farmer/schedule'),
    MenuItem('Bản tin', Icons.newspaper_outlined, '/farmer/bulletin'),
    MenuItem('Thông báo', Icons.notifications_none, '/farmer/notifications'),
    MenuItem('Thửa đất của tôi', Icons.eco_outlined, '/farmer/parcels'),
    MenuItem('Hồ sơ', Icons.person_outline, '/farmer/me'),
  ],
  shop: [MenuItem('Sản phẩm của hộ', Icons.local_cafe_outlined, '/farmer/products')],
  bottom: [
    MenuItem('Tổng quan', Icons.home_outlined, '/farmer'),
    MenuItem('Nhật ký đồng ruộng', Icons.description_outlined, '/farmer/journal', bottomLabel: 'Nhật ký'),
    MenuItem('Quét bệnh cây', Icons.photo_camera_outlined, '/farmer/scan', bottomLabel: 'Quét'),
    MenuItem('Thông báo', Icons.notifications_none, '/farmer/notifications'),
    MenuItem('Hồ sơ', Icons.person_outline, '/farmer/me'),
  ],
);

const _operator = StaffNav(
  kind: StaffKind.operator,
  roleName: 'Công ty du lịch',
  home: '/operator',
  notificationsPath: '/operator/articles',
  accountPath: '/operator/me',
  main: [
    MenuItem('Tổng quan', Icons.home_outlined, '/operator'),
    MenuItem('Hợp tác xã liên kết', Icons.account_balance_outlined, '/operator/htx'),
    MenuItem('Tour toàn vùng', Icons.route_outlined, '/operator/tours'),
    MenuItem('Bài viết HTX', Icons.article_outlined, '/operator/articles'),
    MenuItem('Báo cáo tổng hợp', Icons.bar_chart_outlined, '/operator/reports'),
    MenuItem('Trợ lý AI', Icons.auto_awesome_outlined, '/operator/chat'),
  ],
  shop: [
    MenuItem('Lượt đặt tour', Icons.confirmation_number_outlined, '/operator/bookings'),
    MenuItem('Thu tiền tour', Icons.payments_outlined, '/operator/payments'),
  ],
  bottom: [
    MenuItem('Tổng quan', Icons.home_outlined, '/operator'),
    MenuItem('Hợp tác xã liên kết', Icons.account_balance_outlined, '/operator/htx', bottomLabel: 'HTX'),
    MenuItem('Tour toàn vùng', Icons.route_outlined, '/operator/tours', bottomLabel: 'Tour'),
    MenuItem('Bài viết HTX', Icons.fact_check_outlined, '/operator/articles', bottomLabel: 'Duyệt bài'),
    MenuItem('Báo cáo tổng hợp', Icons.bar_chart_outlined, '/operator/reports', bottomLabel: 'Báo cáo'),
  ],
);

StaffNav navFor(StaffKind kind) => switch (kind) {
  StaffKind.manager => _manager,
  StaffKind.officer => _officer,
  StaffKind.farmer => _farmer,
  StaffKind.operator => _operator,
};
