import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../image_upload.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'auth.dart';
import 'personal_data.dart';
import 'setting.dart';
import 'shell.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<AuthBloc>().state;
    if (!session.isLoggedIn) {
      return Scaffold(backgroundColor: MC.bg, body: _GuestProfile());
    }
    return Scaffold(
      backgroundColor: MC.bg,
      body: Column(children: [
        HeroHeader(
          height: 220,
          showBack: false,
          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
            Row(children: [
              const Text('Akun Saya', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.logout_rounded, color: Colors.white),
                onPressed: () async {
                  final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                    title: const Text('Keluar'),
                    content: const Text('Yakin ingin keluar dari akun?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Keluar', style: TextStyle(color: MC.danger))),
                    ],
                  ));
                  if (ok == true && context.mounted) context.read<AuthBloc>().add(const AuthLoggedOut());
                },
              ),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              const _EditableAvatar(),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(session.user!.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                const SizedBox(height: 2),
                Text(session.user!.email, style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
              ])),
            ]).animate().fadeIn(delay: 120.ms).slideY(begin: 0.2, end: 0),
          ]),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            children: [
              ...stagger([
                _menuTile(context, Icons.person_outline_rounded, 'Data Pribadi', MC.blue,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PersonalDataScreen()))),
                _menuTile(context, Icons.receipt_long_outlined, 'Pesanan Saya', MC.primary,
                    () => goToTab(context, 1)),
                _menuTile(context, Icons.favorite_border_rounded, 'Hotel Favorit', MC.danger,
                    () => goToTab(context, 3)),
                _menuTile(context, Icons.lock_outline_rounded, 'Ganti Password', MC.accent,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen()))),
                _menuTile(context, Icons.help_outline_rounded, 'FAQ & Bantuan', MC.success, () => _faq(context)),
                _menuTile(context, Icons.settings_outlined, 'Pengaturan', MC.inkMuted,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingScreen()))),
              ]),
              const SizedBox(height: 20),
              Center(child: Text('Miruum · Version 1.0', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
            ],
          ),
        ),
      ]),
    );
  }

  Widget _menuTile(BuildContext context, IconData icon, String label, Color color, VoidCallback onTap) => Pressable(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
          child: Row(children: [
            Container(
              width: 42, height: 42,
              decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: color, size: 21),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5))),
            Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
          ]),
        ),
      );

  void _faq(BuildContext context) {
    showModalBottomSheet(context: context, backgroundColor: MC.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('FAQ', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          SizedBox(height: 12),
          Text('Bagaimana cara memesan hotel?', style: TextStyle(fontWeight: FontWeight.w600)),
          Text('Pilih hotel → Pilih Kamar → isi Rincian → Bayar → E-Voucher terbit.', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          SizedBox(height: 12),
          Text('Bagaimana kebijakan refund?', style: TextStyle(fontWeight: FontWeight.w600)),
          Text('Kamar refundable dapat dibatalkan sesuai ketentuan hotel.', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
        ]),
      ),
    );
  }
}

/// Profile avatar that shows the uploaded photo (or the name initial) and lets
/// the user replace it via camera/gallery → MinIO upload.
class _EditableAvatar extends StatefulWidget {
  const _EditableAvatar();
  @override
  State<_EditableAvatar> createState() => _EditableAvatarState();
}

class _EditableAvatarState extends State<_EditableAvatar> {
  bool _busy = false;

  Future<void> _change() async {
    if (_busy) return;
    final url = await pickAndUploadImage(context, folder: 'avatars');
    if (url == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final user = await context.read<Api>().updateMe({'avatarUrl': url});
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthUserUpdated(user));
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Foto profil diperbarui'), backgroundColor: MC.primary));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Gagal menyimpan foto'), backgroundColor: MC.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthBloc>().state.user!;
    final hasPhoto = (user.avatarUrl ?? '').isNotEmpty;
    return GestureDetector(
      onTap: _change,
      child: Stack(children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: MC.primarySoft,
          backgroundImage: hasPhoto ? NetworkImage(user.avatarUrl!) : null,
          child: hasPhoto
              ? null
              : Text(user.name.characters.first.toUpperCase(),
                  style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 26)),
        ),
        Positioned(
          right: 0, bottom: 0,
          child: Container(
            width: 22, height: 22,
            decoration: BoxDecoration(color: MC.primary, shape: BoxShape.circle, border: Border.all(color: MC.bg, width: 2)),
            child: _busy
                ? const Padding(padding: EdgeInsets.all(4), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.photo_camera_rounded, color: Colors.white, size: 12),
          ),
        ),
      ]),
    );
  }
}

class _GuestProfile extends StatelessWidget {
  Widget _benefit(IconData icon, Color color, String title, String sub) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 2),
            Text(sub, style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ])),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      HeroHeader(
        height: 210,
        showBack: false,
        child: Column(mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 60, height: 60,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.22), borderRadius: BorderRadius.circular(18)),
            child: const Icon(Icons.person_rounded, color: Colors.white, size: 34),
          ).animate().scale(begin: const Offset(0.6, 0.6), duration: 500.ms, curve: Curves.elasticOut),
          const SizedBox(height: 14),
          const Text('Hai, Sahabat Miruum 👋', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800))
              .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
          const SizedBox(height: 4),
          const Text('Masuk untuk pengalaman terbaik', style: TextStyle(color: Colors.white70, fontSize: 13.5))
              .animate().fadeIn(delay: 220.ms),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(24, 26, 24, 24), children: [
          ...stagger([
            _benefit(Icons.receipt_long_rounded, MC.primary, 'Kelola Pesanan', 'Lihat & lanjutkan pembayaran pesananmu'),
            _benefit(Icons.favorite_rounded, MC.danger, 'Simpan Favorit', 'Bookmark hotel kesukaanmu'),
            _benefit(Icons.local_offer_rounded, MC.accent, 'Promo Eksklusif', 'Dapatkan penawaran & diskon khusus member'),
            _benefit(Icons.verified_user_rounded, MC.blue, 'Aman & Terverifikasi', 'Transaksi & e-voucher tersimpan rapi'),
          ], startMs: 250),
          const SizedBox(height: 10),
          PrimaryButton('Masuk', icon: Icons.login_rounded,
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen())))
              .animate().fadeIn(delay: 560.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 10),
          Center(
            child: GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
              child: RichText(text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                TextSpan(text: 'Belum punya akun? '),
                TextSpan(text: 'Daftar', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
              ])),
            ),
          ).animate().fadeIn(delay: 640.ms),
        ]),
      ),
    ]);
  }
}
