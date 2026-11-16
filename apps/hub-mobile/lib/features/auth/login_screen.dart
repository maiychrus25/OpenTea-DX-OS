// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/role/role.dart';
import '../../data/auth_service.dart';
import '../../data/demo_auth_service.dart';
import '../../shared/widgets.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.from});

  /// Where to go after signing in (the screen that asked for an account).
  final String? from;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final state = context.read<AppState>();
    final router = GoRouter.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await state.signIn(_email.text, _password.text);
      final from = widget.from;
      router.go(from != null && from.startsWith('/') ? from : homeRouteFor(state.role));
    } on AuthException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Đăng nhập'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/shop'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (widget.from != null)
            const Padding(padding: EdgeInsets.only(bottom: 12), child: StatusChip('Cần đăng nhập để tiếp tục')),
          TextField(
            key: const Key('login-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('login-password'),
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Mật khẩu'),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                _error!,
                key: const Key('login-error'),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('login-submit'),
            onPressed: _busy ? null : _submit,
            child: Text(_busy ? 'Đang đăng nhập...' : 'Đăng nhập'),
          ),
          const SizedBox(height: 24),
          const SectionTitle('Tài khoản dùng thử'),
          Text(
            'Mật khẩu chung: ${DemoAuthService.demoPassword}. Bản chính thức sẽ đăng nhập bằng Keycloak.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          for (final entry in DemoAuthService.accounts.entries)
            Card(
              child: ListTile(
                dense: true,
                title: Text(entry.key),
                subtitle: Text(roleLabel(roleFromClaims(entry.value))),
                onTap: () => setState(() {
                  _email.text = entry.key;
                  _password.text = DemoAuthService.demoPassword;
                }),
              ),
            ),
        ],
      ),
    );
  }
}
