// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/app_state.dart';
import '../../core/role/role.dart';
import '../../core/theme/app_theme.dart';
import '../../data/auth_service.dart';
import '../../data/demo_auth_service.dart';
import '../../shared/widgets.dart';

/// First screen: sign in, or "Tiếp tục khám phá" to browse as a guest.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.from});

  /// Where to go after signing in (the screen that asked for an account).
  final String? from;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

const _shortRole = {
  'farmer@demo.vn': 'Nông dân',
  'manager@demo.vn': 'Quản lý HTX',
  'officer@demo.vn': 'Cán bộ HTX',
  'operator@demo.vn': 'Công ty du lịch',
};

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hidden = true;
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

  void _fill(String email) => setState(() {
    _email.text = email;
    _password.text = DemoAuthService.demoPassword;
  });

  void _guest() {
    context.read<AppState>().continueAsGuest();
    context.go('/shop');
  }

  @override
  Widget build(BuildContext context) {
    final heroHeight = (MediaQuery.sizeOf(context).height * 0.26).clamp(190.0, 300.0);
    return Scaffold(
      backgroundColor: AppColors.cream,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: SingleChildScrollView(
            child: Column(
              children: [
                TeaPhoto(asset: 'assets/images/hero.jpg', height: heroHeight, alignment: const Alignment(0, -0.2)),
                Transform.translate(
                  offset: const Offset(0, -28),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(28, 26, 28, 24),
                    decoration: const BoxDecoration(
                      color: AppColors.cream,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(34)),
                    ),
                    child: _form(context),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _form(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const LeafLogo(size: 48),
            const SizedBox(width: 12),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text('Về Xứ Chè', style: serif(30, color: AppColors.ink)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          'Đăng nhập',
          textAlign: TextAlign.center,
          style: serif(30, color: AppColors.teaDeeper),
        ),
        const SizedBox(height: 14),
        if (widget.from != null)
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Center(child: StatusChip('Cần đăng nhập để tiếp tục')),
          ),
        if (!_browser) ...[_demoBox(), const SizedBox(height: 14), ..._passwordFields()],
        if (_browser) ...[..._browserButton(), const SizedBox(height: 12)],
        SizedBox(
          height: 52,
          child: OutlinedButton(
            key: const Key('login-guest'),
            onPressed: _guest,
            child: const Text('Tiếp tục khám phá', style: TextStyle(fontSize: 17)),
          ),
        ),
      ],
    );
  }

  /// True when sign-in opens the system browser (Keycloak): no demo box, no password field.
  bool get _browser => !context.read<AppState>().usesPasswordForm;

  List<Widget> _browserButton() => [
    const SizedBox(height: 8),
    SizedBox(
      height: 56,
      child: FilledButton(
        key: const Key('login-keycloak'),
        onPressed: _busy ? null : _submit,
        style: FilledButton.styleFrom(
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        child: Text(_busy ? 'Đang mở trang đăng nhập...' : 'Đăng nhập bằng tài khoản HTX'),
      ),
    ),
    if (_error != null)
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
        child: Text(
          _error!,
          key: const Key('login-error'),
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
        ),
      ),
  ];

  List<Widget> _passwordFields() {
    return [
      _PillField(
        fieldKey: const Key('login-email'),
        controller: _email,
        hint: 'Email',
        keyboardType: TextInputType.emailAddress,
      ),
      const SizedBox(height: 14),
      _PillField(
        fieldKey: const Key('login-password'),
        controller: _password,
        hint: 'Mật khẩu',
        obscure: _hidden,
        trailing: IconButton(
          key: const Key('login-eye'),
          tooltip: _hidden ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
          onPressed: () => setState(() => _hidden = !_hidden),
          icon: Icon(_hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined),
        ),
      ),
      if (_error != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
          child: Text(
            _error!,
            key: const Key('login-error'),
            style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600),
          ),
        ),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: () => showMessage(context, 'Bản chính thức sẽ khôi phục mật khẩu qua Keycloak.'),
          child: const Text('Quên mật khẩu?', style: TextStyle(fontSize: 15)),
        ),
      ),
      const SizedBox(height: 6),
      SizedBox(
        height: 56,
        child: FilledButton(
          key: const Key('login-submit'),
          onPressed: _busy ? null : _submit,
          style: FilledButton.styleFrom(textStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600)),
          child: Text(_busy ? 'Đang đăng nhập...' : 'Đăng nhập'),
        ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Wrap(
          alignment: WrapAlignment.center,
          children: [
            const Text('Chưa có tài khoản? ', style: TextStyle(fontSize: 16)),
            InkWell(
              key: const Key('login-register'),
              onTap: () => showMessage(context, 'Bản chính thức sẽ cho đăng ký tài khoản qua Keycloak.'),
              child: const Text(
                'Đăng ký',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.teaGreen),
              ),
            ),
          ],
        ),
      ),
    ];
  }

  Widget _demoBox() {
    const first = 'customer@demo.vn';
    return CustomPaint(
      painter: DashedBorderPainter(const Color(0xFFB9C9B0), 14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: const Color(0xFFE7F0EA), borderRadius: BorderRadius.circular(14)),
        child: Column(
          children: [
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              runSpacing: 4,
              children: [
                const Text(
                  'Tài khoản demo:',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF3B5A48)),
                ),
                _code(first, () => _fill(first)),
                const Text('·', style: TextStyle(fontSize: 13)),
                _code(DemoAuthService.demoPassword, () => _fill(first)),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Vai khác (cùng mật khẩu), chạm để điền:',
              style: TextStyle(fontSize: 12, color: Color(0xFF3B5A48)),
            ),
            const SizedBox(height: 6),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final e in DemoAuthService.accounts.entries)
                  if (e.key != first)
                    ActionChip(
                      key: Key('demo-${e.key}'),
                      visualDensity: VisualDensity.compact,
                      backgroundColor: Colors.white,
                      side: const BorderSide(color: Color(0xFFD3DDD2)),
                      label: Text(_shortRole[e.key] ?? e.key, style: const TextStyle(fontSize: 12)),
                      onPressed: () => _fill(e.key),
                    ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _code(String text, VoidCallback onTap) => InkWell(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFD3DDD2)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: const TextStyle(fontSize: 13, fontFamily: 'monospace')),
    ),
  );
}

class _PillField extends StatelessWidget {
  const _PillField({
    required this.fieldKey,
    required this.controller,
    required this.hint,
    this.obscure = false,
    this.keyboardType,
    this.trailing,
  });
  final Key fieldKey;
  final TextEditingController controller;
  final String hint;
  final bool obscure;
  final TextInputType? keyboardType;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 54,
      padding: EdgeInsets.only(left: 20, right: trailing == null ? 20 : 8),
      decoration: BoxDecoration(
        color: AppColors.paper,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.teaDark, width: 2),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              key: fieldKey,
              controller: controller,
              obscureText: obscure,
              keyboardType: keyboardType,
              style: const TextStyle(fontSize: 17, color: AppColors.ink),
              decoration: InputDecoration(
                hintText: hint,
                hintStyle: const TextStyle(color: Color(0xFF2F5D46), fontSize: 17),
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
