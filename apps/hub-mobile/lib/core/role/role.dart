// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/// What the user can do in the app. Hiding screens is for tidiness only; the
/// server must check the real permission on every call (direction doc §3).
enum AppRole { guest, customer, farmer, manager, operator }

/// Keycloak realm roles the app understands.
const roleCustomer = 'customer';
const roleFarmer = 'farmer';
const roleManager = 'manager';
const roleOfficer = 'officer';
// TODO: the operator realm role name is not decided (operator-and-articles design, Q-OP-1..5).
const roleOperator = 'operator';

/// Token-like claims. In production these come from the Keycloak ID/access
/// token (client `dxos-mobile`); the demo auth service builds them locally.
class Claims {
  const Claims({
    required this.subject,
    required this.name,
    required this.email,
    required this.roles,
    this.htxCode,
    this.householdId,
  });

  final String subject;
  final String name;
  final String email;
  final List<String> roles;

  /// Absent for customers (they belong to no cooperative).
  final String? htxCode;

  /// Farmer only: the household whose data the farmer may see.
  final String? householdId;

  bool hasRole(String role) => roles.contains(role);

  /// Officers view the cooperative but cannot change anything.
  bool get canWriteHtx => hasRole(roleManager);

  Map<String, Object?> toJson() => {
    'sub': subject,
    'name': name,
    'email': email,
    'roles': roles,
    'htx_code': htxCode,
    'household_id': householdId,
  };

  factory Claims.fromJson(Map<String, Object?> json) => Claims(
    subject: json['sub']! as String,
    name: json['name']! as String,
    email: json['email']! as String,
    roles: (json['roles']! as List).cast<String>(),
    htxCode: json['htx_code'] as String?,
    householdId: json['household_id'] as String?,
  );
}

/// Picks the single interface for a set of claims. Highest privilege wins:
/// operator, manager/officer, farmer, customer. No claims means guest.
AppRole roleFromClaims(Claims? claims) {
  if (claims == null) return AppRole.guest;
  if (claims.hasRole(roleOperator)) return AppRole.operator;
  if (claims.hasRole(roleManager) || claims.hasRole(roleOfficer)) return AppRole.manager;
  if (claims.hasRole(roleFarmer)) return AppRole.farmer;
  if (claims.hasRole(roleCustomer)) return AppRole.customer;
  return AppRole.guest;
}

String roleLabel(AppRole role) => switch (role) {
  AppRole.guest => 'Khách',
  AppRole.customer => 'Khách hàng',
  AppRole.farmer => 'Nông dân',
  AppRole.manager => 'Hợp tác xã',
  AppRole.operator => 'Công ty du lịch',
};

/// Home route of each role; also the prefix every screen of that role lives under.
String homeRouteFor(AppRole role) => switch (role) {
  AppRole.guest => '/shop',
  AppRole.customer => '/shop',
  AppRole.farmer => '/farmer',
  AppRole.manager => '/manager',
  AppRole.operator => '/operator',
};

/// Routes of the storefront that need an account (guest is sent to login).
const customerOnlyPrefixes = ['/shop/checkout', '/shop/orders', '/shop/tickets', '/shop/booking', '/shop/pay'];

/// Where to send [role] when it asks for [location], or null to let it through.
/// Pure function so the routing rules can be unit-tested without a widget tree.
String? redirectFor(AppRole role, String location) {
  const staff = {'/farmer': AppRole.farmer, '/manager': AppRole.manager, '/operator': AppRole.operator};
  for (final entry in staff.entries) {
    if (location.startsWith(entry.key)) {
      return role == entry.value ? null : (role == AppRole.guest ? '/login' : homeRouteFor(role));
    }
  }
  if (location.startsWith('/shop')) {
    if (role != AppRole.guest && role != AppRole.customer) return homeRouteFor(role);
    final needsAccount = customerOnlyPrefixes.any(location.startsWith);
    if (needsAccount && role == AppRole.guest) return '/login?from=${Uri.encodeComponent(location)}';
    return null;
  }
  if (location == '/login' && role != AppRole.guest) return homeRouteFor(role);
  return null;
}
