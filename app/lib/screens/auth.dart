import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../brand.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';

void _toast(BuildContext c, String m, {bool err = true}) {
  ScaffoldMessenger.of(c).showSnackBar(SnackBar(
    content: Text(m),
    backgroundColor: err ? MC.danger : MC.primary,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  ));
}

// ─────────────────────────── Sign In ───────────────────────────
class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});
  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false, _obscure = true;

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      final (token, user) = await context.read<Api>().login(_email.text.trim(), _pass.text);
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 210,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const MiruumLogo(size: 34, onDark: true).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.85, 0.85)),
            const SizedBox(height: 14),
            const Text('Sign In', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
            const SizedBox(height: 4),
            const Text('Halo Sahabat Miruum! Ayo login dulu 👋',
                    style: TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField('Enter email', Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              AuthTextField('Enter Password', Icons.lock_outline_rounded, _pass, obscure: _obscure,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
                    child: const Text('Forgot Password ?', style: TextStyle(color: MC.primary, fontSize: 12.5))),
              ),
              PrimaryButton('Sign In', loading: _loading, onPressed: _submit),
              const SizedBox(height: 20),
              Row(children: const [
                Expanded(child: Divider(color: MC.line)),
                Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('or continue with', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
                Expanded(child: Divider(color: MC.line)),
              ]),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: () => _toast(context, 'Login Google (demo) — pakai demo@miruum.id', err: false),
                  icon: const Icon(Icons.g_mobiledata_rounded, size: 30, color: MC.danger),
                  label: Text('Sign In with Google', style: TextStyle(color: MC.ink, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: MC.line),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(12)),
                child: const Text('Demo: demo@miruum.id / demo123',
                    textAlign: TextAlign.center, style: TextStyle(color: MC.primaryDark, fontSize: 12, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 20),
              Center(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
                  child: RichText(
                    text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: "Don't Have an Account ? "),
                      TextSpan(text: 'Sign Up', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ),
            ], startMs: 260)),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────── Sign Up ───────────────────────────
class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});
  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false, _obscure = true;

  Future<void> _submit() async {
    if (_name.text.trim().length < 2 || !_email.text.contains('@') || _pass.text.length < 6) {
      _toast(context, 'Lengkapi nama, email valid, & kata sandi min. 6 karakter');
      return;
    }
    setState(() => _loading = true);
    try {
      final (token, user) = await context.read<Api>().register(_name.text.trim(), _email.text.trim(), _pass.text);
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      // OTP step (mock) then done.
      await Navigator.push(context, MaterialPageRoute(builder: (_) => OtpScreen(email: _email.text.trim())));
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 200,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const MiruumLogo(size: 34, onDark: true).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.85, 0.85)),
            const SizedBox(height: 14),
            const Text('Registrasi', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
            const SizedBox(height: 4),
            const Text('Buat akun & nikmati promo terbaik ✨', style: TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField('Nama Lengkap', Icons.person_outline_rounded, _name),
              const SizedBox(height: 14),
              AuthTextField('Email', Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              AuthTextField('Kata Sandi', Icons.lock_outline_rounded, _pass, obscure: _obscure,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              const SizedBox(height: 14),
              const Text('Dengan mendaftar, Anda menyetujui Syarat & Ketentuan dan Kebijakan Privasi Miruum',
                  style: TextStyle(color: MC.inkMuted, fontSize: 12)),
              const SizedBox(height: 20),
              PrimaryButton('Daftar', loading: _loading, onPressed: _submit),
              const SizedBox(height: 22),
              Center(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SignInScreen())),
                  child: RichText(
                    text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: 'Sudah punya akun Miruum ? '),
                      TextSpan(text: 'Masuk', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ),
            ], startMs: 240)),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────── Forgot Password ───────────────────────────
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _pass = TextEditingController();
  bool _sent = false, _loading = false, _obscure = true;

  Future<void> _sendCode() async {
    if (!_email.text.contains('@')) { _toast(context, 'Masukkan email yang valid'); return; }
    setState(() => _loading = true);
    try {
      await context.read<Api>().forgotPassword(_email.text.trim());
      if (mounted) { setState(() => _sent = true); _toast(context, 'Kode reset dikirim (demo: 1234)', err: false); }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reset() async {
    if (_code.text.trim().length < 4 || _pass.text.length < 6) {
      _toast(context, 'Kode 4 digit & kata sandi baru min. 6 karakter'); return;
    }
    setState(() => _loading = true);
    try {
      await context.read<Api>().resetPassword(_email.text.trim(), _code.text.trim(), _pass.text);
      if (!mounted) return;
      _toast(context, 'Kata sandi berhasil diubah, silakan masuk', err: false);
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 190,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.lock_reset_rounded, color: Colors.white, size: 40)
                .animate().scale(begin: const Offset(0.6, 0.6), duration: 500.ms, curve: Curves.elasticOut),
            const SizedBox(height: 10),
            const Text('Lupa Password', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
            const SizedBox(height: 4),
            const Text('Reset kata sandimu dengan mudah', style: TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField('Email terdaftar', Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress),
              if (_sent) ...[
                const SizedBox(height: 14),
                AuthTextField('Kode reset (demo: 1234)', Icons.pin_rounded, _code, keyboard: TextInputType.number),
                const SizedBox(height: 14),
                AuthTextField('Kata sandi baru', Icons.lock_outline_rounded, _pass, obscure: _obscure,
                    suffix: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    )),
              ],
              const SizedBox(height: 22),
              PrimaryButton(_sent ? 'Reset Kata Sandi' : 'Kirim Kode', loading: _loading, onPressed: _sent ? _reset : _sendCode),
            ], startMs: 240)),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────── Change Password ───────────────────────────
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  bool _loading = false, _o1 = true, _o2 = true;

  Future<void> _submit() async {
    if (_next.text.length < 6) { _toast(context, 'Kata sandi baru minimal 6 karakter'); return; }
    setState(() => _loading = true);
    try {
      await context.read<Api>().changePassword(_current.text, _next.text);
      if (!mounted) return;
      _toast(context, 'Kata sandi berhasil diubah', err: false);
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 180,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.password_rounded, color: Colors.white, size: 38)
                .animate().scale(begin: const Offset(0.6, 0.6), duration: 500.ms, curve: Curves.elasticOut),
            const SizedBox(height: 10),
            const Text('Ganti Password', style: TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField('Kata sandi saat ini', Icons.lock_outline_rounded, _current, obscure: _o1,
                  suffix: IconButton(icon: Icon(_o1 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _o1 = !_o1))),
              const SizedBox(height: 14),
              AuthTextField('Kata sandi baru', Icons.lock_reset_rounded, _next, obscure: _o2,
                  suffix: IconButton(icon: Icon(_o2 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _o2 = !_o2))),
              const SizedBox(height: 22),
              PrimaryButton('Simpan Kata Sandi', loading: _loading, onPressed: _submit),
            ], startMs: 240)),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────── OTP ───────────────────────────
class OtpScreen extends StatefulWidget {
  final String email;
  const OtpScreen({super.key, required this.email});
  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final _controllers = List.generate(4, (_) => TextEditingController());
  final _nodes = List.generate(4, (_) => FocusNode());
  bool _loading = false;

  Future<void> _confirm() async {
    final code = _controllers.map((c) => c.text).join();
    if (code.length < 4) {
      _toast(context, 'Masukkan 4 digit kode');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<Api>().verifyOtp(code);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Cek Email Anda', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text('Masukan 4 digit kode yang dikirim ke email ${widget.email}',
                  style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              const SizedBox(height: 8),
              const Text('Gunakan kode 1234 (demo)', style: TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(height: 32),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: List.generate(4, (i) {
                  return SizedBox(
                    width: 62, height: 62,
                    child: TextField(
                      controller: _controllers[i],
                      focusNode: _nodes[i],
                      textAlign: TextAlign.center,
                      keyboardType: TextInputType.number,
                      maxLength: 1,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                      decoration: const InputDecoration(counterText: ''),
                      onChanged: (v) {
                        if (v.isNotEmpty && i < 3) _nodes[i + 1].requestFocus();
                        if (v.isEmpty && i > 0) _nodes[i - 1].requestFocus();
                      },
                    ),
                  );
                }),
              ),
              const SizedBox(height: 32),
              PrimaryButton('Konfirmasi', loading: _loading, onPressed: _confirm),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shown when a guest tries a member-only action.
Future<bool> ensureLoggedIn(BuildContext context) async {
  if (context.read<AuthBloc>().state.isLoggedIn) return true;
  await Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen()));
  return context.read<AuthBloc>().state.isLoggedIn;
}
