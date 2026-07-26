import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../brand.dart';
import '../feedback.dart';
import '../l10n.dart';
import 'content_screen.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'corporate.dart';

void _toast(BuildContext c, String m, {bool err = true}) =>
    showSnack(c, m, kind: err ? SnackKind.error : SnackKind.success);

// OAuth Web client ID, injected at build time once Google sign-in is enabled
// in Firebase (--dart-define=GOOGLE_SERVER_CLIENT_ID=...). Empty → button shows
// a "coming soon" message instead of failing.
const _googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: '');

Future<void> signInWithGoogle(BuildContext context) async {
  if (_googleServerClientId.isEmpty) {
    resultDialog(context,
        title: tr('Login dengan Google', 'Sign in with Google'),
        message: tr('Login Google sedang disiapkan. Untuk sekarang, gunakan email atau daftar akun baru.',
            'Google sign-in is being set up. For now, please use email or create a new account.'),
        kind: SnackKind.info, okText: tr('Mengerti', 'Got it'));
    return;
  }
  try {
    // google_sign_in 7.x: singleton + initialize() + interactive authenticate().
    final gsi = GoogleSignIn.instance;
    await gsi.initialize(serverClientId: _googleServerClientId);
    final acct = await gsi.authenticate(scopeHint: const ['email', 'profile']);
    final idToken = acct.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      if (context.mounted) showSnack(context, tr('Gagal memperoleh token Google.', 'Failed to obtain Google token.'), kind: SnackKind.error);
      return;
    }
    final (token, user) = await context.read<Api>().googleLogin(idToken);
    if (context.mounted) {
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      Navigator.pop(context);
    }
  } on GoogleSignInException catch (e) {
    if (e.code == GoogleSignInExceptionCode.canceled) return; // user dismissed the picker
    if (context.mounted) showSnack(context, tr('Login Google gagal. Coba lagi.', 'Google sign-in failed. Please try again.'), kind: SnackKind.error);
  } catch (e) {
    if (context.mounted) showSnack(context, tr('Login Google gagal. Coba lagi.', 'Google sign-in failed. Please try again.'), kind: SnackKind.error);
  }
}

/// A crisp multi-color Google "G" mark (blue right + bar, green bottom, yellow
/// left, red top), drawn so the Google sign-in button looks authentic.
class GoogleGLogo extends StatelessWidget {
  final double size;
  const GoogleGLogo({super.key, this.size = 20});
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: CustomPaint(painter: _GoogleGPainter()));
}

class _GoogleGPainter extends CustomPainter {
  double _rad(double deg) => deg * 3.1415926535 / 180.0;
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final sw = w * 0.26;
    final rect = Rect.fromLTWH(sw / 2, sw / 2, w - sw, w - sw);
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.butt;
    p.color = const Color(0xFF4285F4); canvas.drawArc(rect, _rad(-45), _rad(90), false, p); // blue (right)
    p.color = const Color(0xFF34A853); canvas.drawArc(rect, _rad(45), _rad(90), false, p);  // green (bottom)
    p.color = const Color(0xFFFBBC05); canvas.drawArc(rect, _rad(135), _rad(90), false, p); // yellow (left)
    p.color = const Color(0xFFEA4335); canvas.drawArc(rect, _rad(225), _rad(90), false, p); // red (top)
    // Inner blue crossbar of the "G".
    final bar = Paint()..color = const Color(0xFF4285F4)..style = PaintingStyle.fill;
    canvas.drawRect(Rect.fromLTWH(w * 0.5, w * 0.5 - sw / 2, w * 0.5 - sw / 2 + 1, sw), bar);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
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

  Future<void> _submit({String? code}) async {
    if (_email.text.trim().isEmpty || _pass.text.isEmpty) {
      _toast(context, tr('Isi email & kata sandi terlebih dahulu.', 'Enter your email & password first.'));
      return;
    }
    setState(() => _loading = true);
    try {
      final (token, user) = await context.read<Api>().login(_email.text.trim(), _pass.text, code: code);
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      Navigator.pop(context);
    } on TwoFactorRequired {
      if (mounted) { setState(() => _loading = false); _promptTwoFactor(); }
    } on ApiException catch (e) {
      if (mounted) _toast(context, e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _promptTwoFactor() async {
    final ctl = TextEditingController();
    final code = await showDialog<String>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: Text(tr('Verifikasi 2 Langkah', 'Two-Step Verification')),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(tr('Kode verifikasi dikirim ke emailmu. Masukkan di bawah.', 'A verification code was sent to your email. Enter it below.'), style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 12),
        TextField(controller: ctl, keyboardType: TextInputType.number, textAlign: TextAlign.center,
          decoration: const InputDecoration(hintText: '••••••'), maxLength: 6),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(tr('Batal', 'Cancel'))),
        FilledButton(onPressed: () => Navigator.pop(context, ctl.text.trim()), style: FilledButton.styleFrom(backgroundColor: MC.primary), child: Text(tr('Verifikasi', 'Verify'))),
      ],
    ));
    if (code != null && code.length >= 4) _submit(code: code);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 210,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.center, children: [
            const MiruumLogo(size: 34, onDark: true).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.85, 0.85)),
            const SizedBox(height: 14),
            Text(tr('Masuk', 'Sign In'), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).scale(begin: const Offset(0.9, 0.9)),
            const SizedBox(height: 4),
            Text(tr('Halo Sahabat Miruum! Ayo login dulu 👋', 'Hi there! Let\'s get you signed in 👋'),
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField(tr('Masukkan email', 'Enter email'), Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress, required: true),
              const SizedBox(height: 14),
              AuthTextField(tr('Masukkan kata sandi', 'Enter Password'), Icons.lock_outline_rounded, _pass, obscure: _obscure, required: true,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
                    child: Text(tr('Lupa Kata Sandi ?', 'Forgot Password ?'), style: const TextStyle(color: MC.primary, fontSize: 12.5))),
              ),
              PrimaryButton(tr('Masuk', 'Sign In'), loading: _loading, onPressed: _submit),
              const SizedBox(height: 20),
              Row(children: [
                Expanded(child: Divider(color: MC.line)),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Text(tr('atau lanjutkan dengan', 'or continue with'), style: TextStyle(color: MC.inkFaint, fontSize: 12))),
                Expanded(child: Divider(color: MC.line)),
              ]),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => signInWithGoogle(context),
                  icon: const Padding(padding: EdgeInsets.only(right: 2), child: GoogleGLogo(size: 20)),
                  label: Text(tr('Masuk dengan Google', 'Sign In with Google'), style: TextStyle(color: MC.ink, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.center,
                    side: BorderSide(color: MC.line),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              // Corporate / Government login — for company & agency accounts.
              SizedBox(
                height: 50,
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CorporateLoginScreen())),
                  icon: const Icon(Icons.business_center_rounded, size: 20, color: MC.primary),
                  label: Text(tr('Login Bisnis', 'Business Login'), style: const TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.center,
                    side: const BorderSide(color: MC.primary),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Center(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
                  child: RichText(
                    text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: tr('Belum punya akun ? ', "Don't Have an Account ? ")),
                      TextSpan(text: tr('Daftar', 'Sign Up'), style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
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
  bool _loading = false, _obscure = true, _consent = false;

  Future<void> _submit() async {
    if (_name.text.trim().length < 2 || !_email.text.contains('@') || _pass.text.length < 6) {
      _toast(context, tr('Lengkapi nama, email valid, & kata sandi min. 6 karakter', 'Enter your name, a valid email, and a password of at least 6 characters'));
      return;
    }
    if (!_consent) {
      _toast(context, tr('Setujui Kebijakan Privasi & Syarat Ketentuan dulu', 'Please agree to the Privacy Policy & Terms first'));
      return;
    }
    setState(() => _loading = true);
    try {
      final (token, user) = await context.read<Api>().register(_name.text.trim(), _email.text.trim(), _pass.text, consent: _consent);
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
            Text(tr('Registrasi', 'Register'), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
            const SizedBox(height: 4),
            Text(tr('Buat akun & nikmati promo terbaik ✨', 'Create an account & enjoy the best deals ✨'), style: const TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField(tr('Nama Lengkap', 'Full Name'), Icons.person_outline_rounded, _name, required: true),
              const SizedBox(height: 14),
              AuthTextField(tr('Email', 'Email'), Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress, required: true),
              const SizedBox(height: 14),
              AuthTextField(tr('Kata Sandi', 'Password'), Icons.lock_outline_rounded, _pass, obscure: _obscure, required: true,
                  suffix: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )),
              const SizedBox(height: 14),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 24, height: 24, child: Checkbox(
                  value: _consent, onChanged: (v) => setState(() => _consent = v ?? false),
                  activeColor: MC.primary, materialTapTargetSize: MaterialTapTargetSize.shrinkWrap)),
                const SizedBox(width: 8),
                Expanded(child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(tr('Saya menyetujui ', 'I agree to '), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ContentScreen(slug: 'privacy', fallbackTitle: 'Kebijakan Privasi'))),
                    child: Text(tr('Kebijakan Privasi', 'Privacy Policy'), style: const TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w700))),
                  Text(tr(' dan ', ' and '), style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                  GestureDetector(
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ContentScreen(slug: 'terms', fallbackTitle: 'Syarat & Ketentuan'))),
                    child: Text(tr('Syarat & Ketentuan', 'Terms & Conditions'), style: const TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w700))),
                ])),
              ]),
              const SizedBox(height: 20),
              PrimaryButton(tr('Daftar', 'Sign Up'), loading: _loading, onPressed: _submit),
              const SizedBox(height: 22),
              Center(
                child: GestureDetector(
                  onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SignInScreen())),
                  child: RichText(
                    text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                      TextSpan(text: tr('Sudah punya akun Miruum ? ', 'Already have a Miruum account ? ')),
                      TextSpan(text: tr('Masuk', 'Sign In'), style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
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
    if (!_email.text.contains('@')) { _toast(context, tr('Masukkan email yang valid', 'Enter a valid email')); return; }
    setState(() => _loading = true);
    try {
      await context.read<Api>().forgotPassword(_email.text.trim());
      if (mounted) { setState(() => _sent = true); _toast(context, tr('Kode reset telah dikirim ke email Anda.', 'A reset code has been sent to your email.'), err: false); }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reset() async {
    if (_code.text.trim().length < 4 || _pass.text.length < 6) {
      _toast(context, tr('Kode 4 digit & kata sandi baru min. 6 karakter', '4-digit code & new password of at least 6 characters')); return;
    }
    setState(() => _loading = true);
    try {
      await context.read<Api>().resetPassword(_email.text.trim(), _code.text.trim(), _pass.text);
      if (!mounted) return;
      _toast(context, tr('Kata sandi berhasil diubah, silakan masuk', 'Password changed successfully, please sign in'), err: false);
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
            Text(tr('Lupa Password', 'Forgot Password'), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
            const SizedBox(height: 4),
            Text(tr('Reset kata sandimu dengan mudah', 'Reset your password easily'), style: const TextStyle(color: Colors.white70, fontSize: 13.5))
                .animate().fadeIn(delay: 220.ms),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField(tr('Email terdaftar', 'Registered email'), Icons.mail_outline_rounded, _email, keyboard: TextInputType.emailAddress, required: true),
              if (_sent) ...[
                const SizedBox(height: 14),
                AuthTextField(tr('Kode reset dari email', 'Reset code from email'), Icons.pin_rounded, _code, keyboard: TextInputType.number, required: true),
                const SizedBox(height: 14),
                AuthTextField(tr('Kata sandi baru', 'New password'), Icons.lock_outline_rounded, _pass, obscure: _obscure, required: true,
                    suffix: IconButton(
                      icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    )),
              ],
              const SizedBox(height: 22),
              PrimaryButton(_sent ? tr('Reset Kata Sandi', 'Reset Password') : tr('Kirim Kode', 'Send Code'), loading: _loading, onPressed: _sent ? _reset : _sendCode),
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
    if (_next.text.length < 6) { _toast(context, tr('Kata sandi baru minimal 6 karakter', 'New password must be at least 6 characters')); return; }
    setState(() => _loading = true);
    try {
      await context.read<Api>().changePassword(_current.text, _next.text);
      if (!mounted) return;
      _toast(context, tr('Kata sandi berhasil diubah', 'Password changed successfully'), err: false);
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
            Text(tr('Ganti Password', 'Change Password'), style: const TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
          ]),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: stagger([
              AuthTextField(tr('Kata sandi saat ini', 'Current password'), Icons.lock_outline_rounded, _current, obscure: _o1, required: true,
                  suffix: IconButton(icon: Icon(_o1 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _o1 = !_o1))),
              const SizedBox(height: 14),
              AuthTextField(tr('Kata sandi baru', 'New password'), Icons.lock_reset_rounded, _next, obscure: _o2, required: true,
                  suffix: IconButton(icon: Icon(_o2 ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 20, color: MC.inkFaint),
                      onPressed: () => setState(() => _o2 = !_o2))),
              const SizedBox(height: 22),
              PrimaryButton(tr('Simpan Kata Sandi', 'Save Password'), loading: _loading, onPressed: _submit),
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
  String? _devCode; // shown only when no email/WA channel is configured

  @override
  void initState() {
    super.initState();
    _sendCode();
  }

  Future<void> _sendCode() async {
    try {
      final r = await context.read<Api>().requestOtp();
      if (mounted && r != null) setState(() => _devCode = r);
    } catch (_) {/* ignore — user can resend */}
  }

  Future<void> _confirm() async {
    final code = _controllers.map((c) => c.text).join();
    if (code.length < 4) {
      _toast(context, tr('Masukkan 4 digit kode', 'Enter the 4-digit code'));
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
              Text(tr('Cek Email Anda', 'Check Your Email'), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(tr('Masukan 4 digit kode yang dikirim ke email ${widget.email}', 'Enter the 4-digit code sent to ${widget.email}'),
                  style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              const SizedBox(height: 8),
              if (_devCode != null)
                Text(tr('Kode Anda: $_devCode', 'Your code: $_devCode'), style: const TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w600))
              else
                TextButton(onPressed: _sendCode, style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    child: Text(tr('Kirim ulang kode', 'Resend code'), style: const TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w600))),
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
              PrimaryButton(tr('Konfirmasi', 'Confirm'), loading: _loading, onPressed: _confirm),
            ],
          ),
        ),
      ),
    );
  }
}
