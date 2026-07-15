import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../brand.dart';
import '../feedback.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';

void _toast(BuildContext c, String m, {bool err = true}) =>
    showSnack(c, m, kind: err ? SnackKind.error : SnackKind.success);

// OAuth Web client ID, injected at build time once Google sign-in is enabled
// in Firebase (--dart-define=GOOGLE_SERVER_CLIENT_ID=...). Empty → button shows
// a "coming soon" message instead of failing.
const _googleServerClientId = String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID', defaultValue: '');

Future<void> signInWithGoogle(BuildContext context) async {
  if (_googleServerClientId.isEmpty) {
    resultDialog(context,
        title: 'Login dengan Google',
        message: 'Login Google sedang disiapkan. Untuk sekarang, gunakan email atau daftar akun baru.',
        kind: SnackKind.info, okText: 'Mengerti');
    return;
  }
  try {
    final gsi = GoogleSignIn(serverClientId: _googleServerClientId, scopes: const ['email', 'profile']);
    await gsi.signOut();
    final acct = await gsi.signIn();
    if (acct == null) return; // cancelled
    final idToken = (await acct.authentication).idToken;
    if (idToken == null || idToken.isEmpty) {
      if (context.mounted) showSnack(context, 'Gagal memperoleh token Google.', kind: SnackKind.error);
      return;
    }
    final (token, user) = await context.read<Api>().googleLogin(idToken);
    if (context.mounted) {
      context.read<AuthBloc>().add(AuthSessionGranted(token, user));
      Navigator.pop(context);
    }
  } catch (e) {
    if (context.mounted) showSnack(context, 'Login Google gagal. Coba lagi.', kind: SnackKind.error);
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
          child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.center, children: [
            const MiruumLogo(size: 34, onDark: true).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.85, 0.85)),
            const SizedBox(height: 14),
            const Text('Sign In', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800))
                .animate().fadeIn(delay: 120.ms).scale(begin: const Offset(0.9, 0.9)),
            const SizedBox(height: 4),
            const Text('Halo Sahabat Miruum! Ayo login dulu 👋',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white70, fontSize: 13.5))
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
              Row(children: [
                Expanded(child: Divider(color: MC.line)),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: Text('or continue with', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
                Expanded(child: Divider(color: MC.line)),
              ]),
              const SizedBox(height: 16),
              SizedBox(
                height: 50,
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () => signInWithGoogle(context),
                  icon: const Padding(padding: EdgeInsets.only(right: 2), child: GoogleGLogo(size: 20)),
                  label: Text('Sign In with Google', style: TextStyle(color: MC.ink, fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.center,
                    side: BorderSide(color: MC.line),
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
              Text('Dengan mendaftar, Anda menyetujui Syarat & Ketentuan dan Kebijakan Privasi Miruum',
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
      if (mounted) { setState(() => _sent = true); _toast(context, 'Kode reset telah dikirim ke email Anda.', err: false); }
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
                AuthTextField('Kode reset dari email', Icons.pin_rounded, _code, keyboard: TextInputType.number),
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
              if (_devCode != null)
                Text('Kode Anda: $_devCode', style: const TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w600))
              else
                TextButton(onPressed: _sendCode, style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                    child: const Text('Kirim ulang kode', style: TextStyle(color: MC.primary, fontSize: 12, fontWeight: FontWeight.w600))),
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
