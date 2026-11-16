// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/app_state.dart';
import '../../features/auth/login_screen.dart';
import '../../features/customer/booking_form_screen.dart';
import '../../features/customer/cart_tab.dart';
import '../../features/customer/home_tab.dart';
import '../../features/customer/household_screen.dart';
import '../../features/customer/htx_screen.dart';
import '../../features/customer/map_tab.dart';
import '../../features/customer/saved_tab.dart';
import '../../features/customer/trips_tab.dart';
import '../../features/customer/visit_screens.dart';
import '../../features/customer/checkout_screen.dart';
import '../../features/customer/customer_account_tab.dart';
import '../../features/customer/customer_shell.dart';
import '../../features/customer/news_screen.dart';
import '../../features/customer/orders_screen.dart';
import '../../features/customer/payment_screen.dart';
import '../../features/customer/products_tab.dart';
import '../../features/customer/tickets_screen.dart';
import '../../features/customer/tour_detail_screen.dart';
import '../../features/customer/tours_tab.dart';
import '../../features/farmer/farmer_screens.dart';
import '../../features/manager/manager_screens.dart';
import '../../features/operator/operator_screens.dart';
import '../../shared/widgets.dart' show InnerPage;
import '../role/role.dart';

/// Decides redirects for the router: login page first, then role rules.
String? appRedirect(AppState state, Uri uri) {
  final path = uri.path;
  if (!state.welcomeDone && path != '/login') return '/login';
  return redirectFor(state.role, uri.toString());
}

Page<void> _noAnim(Widget child, GoRouterState s) => NoTransitionPage(key: s.pageKey, child: child);

GoRouter buildRouter(AppState state, {String initialLocation = '/shop'}) {
  ShellRoute shell(Widget Function(String, Widget) make, List<RouteBase> routes) =>
      ShellRoute(builder: (context, st, child) => make(st.uri.path, child), routes: routes);

  GoRoute tab(String path, Widget child) => GoRoute(path: path, pageBuilder: (c, s) => _noAnim(child, s));

  return GoRouter(
    initialLocation: initialLocation,
    refreshListenable: state,
    redirect: (context, st) => appRedirect(state, st.uri),
    routes: [
      GoRoute(
        path: '/login',
        builder: (c, s) => LoginScreen(from: s.uri.queryParameters['from']),
      ),
      shell((loc, child) => CustomerShell(location: loc, child: child), [
        tab('/shop', const HomeTab()),
        tab('/shop/map', const MapTab()),
        tab('/shop/trips', const TripsTab()),
        tab('/shop/saved', const SavedTab()),
        GoRoute(
          path: '/shop/tours',
          pageBuilder: (c, s) => _noAnim(ToursTab(query: s.uri.queryParameters['q'] ?? ''), s),
        ),
        tab('/shop/products', const InnerPage(title: 'Sản phẩm', child: ProductsTab())),
        tab('/shop/cart', const InnerPage(title: 'Giỏ hàng', child: CartTab())),
        tab('/shop/me', const InnerPage(title: 'Tài khoản', child: CustomerAccountTab())),
        tab('/shop/news', const NewsScreen()),
        GoRoute(
          path: '/shop/tours/:id',
          pageBuilder: (c, s) => _noAnim(TourDetailScreen(tourId: s.pathParameters['id']!), s),
        ),
        GoRoute(
          path: '/shop/htx/:code',
          pageBuilder: (c, s) => _noAnim(HtxScreen(code: s.pathParameters['code']!), s),
        ),
        GoRoute(
          path: '/shop/farm/:id',
          pageBuilder: (c, s) => _noAnim(HouseholdScreen(id: s.pathParameters['id']!), s),
        ),
      ]),
      GoRoute(
        path: '/shop/visit',
        builder: (c, s) =>
            VisitRequestScreen(householdId: s.uri.queryParameters['household'], tourId: s.uri.queryParameters['tour']),
      ),
      GoRoute(
        path: '/shop/visit/sent',
        builder: (c, s) => VisitSentScreen(
          code: s.uri.queryParameters['code'] ?? '',
          target: s.uri.queryParameters['to'] ?? 'HTX Chè Tân Cương',
        ),
      ),
      GoRoute(
        path: '/shop/booking/:tourId',
        builder: (c, s) =>
            BookingFormScreen(tourId: s.pathParameters['tourId']!, departureId: s.uri.queryParameters['dep'] ?? ''),
      ),
      GoRoute(path: '/shop/checkout', builder: (c, s) => const CheckoutScreen()),
      GoRoute(
        path: '/shop/pay/:code',
        builder: (c, s) => PaymentScreen(code: s.pathParameters['code']!),
      ),
      GoRoute(path: '/shop/orders', builder: (c, s) => const OrdersScreen()),
      GoRoute(
        path: '/shop/orders/:id',
        builder: (c, s) => OrderDetailScreen(orderId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/shop/tickets', builder: (c, s) => const TicketsScreen()),
      GoRoute(
        path: '/shop/tickets/:id',
        builder: (c, s) => TicketScreen(bookingId: s.pathParameters['id']!),
      ),
      shell((loc, child) => FarmerShell(location: loc, child: child), [
        tab('/farmer', const VisitsTab()),
        tab('/farmer/products', const FarmerProductsTab()),
        tab('/farmer/me', const FarmerAccountTab()),
      ]),
      GoRoute(
        path: '/farmer/visits/:id',
        builder: (c, s) => VisitDetailScreen(bookingId: s.pathParameters['id']!),
      ),
      shell((loc, child) => ManagerShell(location: loc, child: child), [
        tab('/manager', const OverviewTab()),
        tab('/manager/orders', const OrdersTab()),
        tab('/manager/bookings', const BookingsTab()),
        tab('/manager/more', const MoreTab()),
        tab('/manager/me', const ManagerAccountTab()),
      ]),
      GoRoute(
        path: '/manager/orders/:id',
        builder: (c, s) => ManagerOrderDetailScreen(orderId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/manager/bookings/:id',
        builder: (c, s) => ManagerBookingDetailScreen(bookingId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/manager/articles', builder: (c, s) => const ManagerArticlesScreen()),
      GoRoute(path: '/manager/payments', builder: (c, s) => const ManagerPaymentsScreen()),
      GoRoute(path: '/manager/catalog', builder: (c, s) => const ManagerCatalogScreen()),
      shell((loc, child) => OperatorShell(location: loc, child: child), [
        tab('/operator', const OperatorOverviewTab()),
        tab('/operator/articles', const OperatorArticlesTab()),
        tab('/operator/bookings', const OperatorBookingsTab()),
        tab('/operator/me', const OperatorAccountTab()),
      ]),
    ],
  );
}
