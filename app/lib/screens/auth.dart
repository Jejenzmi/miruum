import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../brand.dart';
import '../theme.dart';
import '../widgets.dart';

class _AuthField extends StatelessWidget {
  final String hint;
  final IconData icon;
  final TextEditingController controller;
  final bool obscure;
  final Widget? suffix;
  final TextInputType? keyboard;
  const _AuthField(this.hint, this.icon, this.controller, {this.obscure = false, this.suffix, this.keyboard});
  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboard,
      decoration: InputDecoration(hintText: hint, prefixIcon: Icon(icon, color: MC.inkFaint, size: 20), suffixIcon: suffix),
    );
  }
}

void _toast(BuildContext c, String m, {bool err = true}) {
  ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m), backgroundColor: err ? MC.danger : MC.primary));
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
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: MiruumLogo(size: 40)),
              const SizedBox(height: 32),
              const Text('Sign In', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              const Text('Halo Sahabat Miruum!', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              const SizedBox(height: 2),
              const Text('Ayo login dulu untuk menikmati fasilitas & layanan dari kami',
                  style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              const SizedBox(height: 28),
              _AuthField('Enter email', Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              _AuthField('Enter Password', Icons.lock_outline_rounded, _pass, obscure: _obscure,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () {}, child: const Text('Forgot Password ?', style: TextStyle(color: MC.primary, fontSize: 12.5))),
              ),
              const SizedBox(height: 8),
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
                  label: const Text('Sign In with Google', style: TextStyle(color: MC.ink, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: MC.line),
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
                    text: const TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: "Don't Have an Account ? "),
                      TextSpan(text: 'Sign Up', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
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
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Center(child: MiruumLogo(size: 40)),
              const SizedBox(height: 30),
              const Text('Registrasi', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
              const SizedBox(height: 24),
              _AuthField('Nama Lengkap', Icons.person_outline_rounded, _name),
              const SizedBox(height: 14),
              _AuthField('Email', Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              _AuthField('Kata Sandi', Icons.lock_outline_rounded, _pass, obscure: _obscure,
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
                    text: const TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: 'Sudah punya akun Miruum ? '),
                      TextSpan(text: 'Masuk', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
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
                  style: const TextStyle(color: MC.inkMuted, fontSize: 13)),
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
