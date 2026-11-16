// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../core/router/app_router.dart';
import '../core/theme/app_theme.dart';
import '../data/auth_service.dart';
import '../data/hub_repository.dart';
import '../data/local_store.dart';
import 'activity_controller.dart';
import 'app_state.dart';
import 'cart_controller.dart';

/// Root widget. Everything it needs is passed in, so tests and the real
/// backend can swap the implementations behind the interfaces.
class HubApp extends StatefulWidget {
  const HubApp({super.key, required this.repository, required this.auth, required this.store});
  final HubRepository repository;
  final AuthService auth;
  final LocalStore store;

  @override
  State<HubApp> createState() => _HubAppState();
}

class _HubAppState extends State<HubApp> {
  late final AppState _state = AppState(widget.auth);
  late final CartController _cart = CartController(widget.store);
  late final ActivityController _activity = ActivityController(widget.repository, widget.store);
  late final GoRouter _router = buildRouter(_state);
  late final Future<void> _restored = _state.restore();

  void _syncUser() => _activity.bind(_state.claims?.subject);

  @override
  void initState() {
    super.initState();
    _state.addListener(_syncUser);
  }

  @override
  void dispose() {
    _state.removeListener(_syncUser);
    _router.dispose();
    _state.dispose();
    _cart.dispose();
    _activity.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<HubRepository>.value(value: widget.repository),
        ChangeNotifierProvider<AppState>.value(value: _state),
        ChangeNotifierProvider<CartController>.value(value: _cart),
        ChangeNotifierProvider<ActivityController>.value(value: _activity),
      ],
      child: FutureBuilder<void>(
        future: _restored,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return MaterialApp(
              theme: buildAppTheme(),
              home: const Scaffold(body: Center(child: CircularProgressIndicator())),
            );
          }
          return MaterialApp.router(
            title: 'Về Xứ Chè',
            debugShowCheckedModeBanner: false,
            theme: buildAppTheme(),
            routerConfig: _router,
          );
        },
      ),
    );
  }
}
