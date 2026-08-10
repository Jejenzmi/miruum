import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../feedback.dart';
import '../image_upload.dart';
import '../l10n.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'auth.dart';
import 'corporate.dart';
import 'chat_screen.dart';
import 'loyalty.dart';
import 'wallet_screen.dart';
import 'trips_screen.dart';
import 'security_screen.dart';
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
              Text(tr('Akun Saya', 'My Account'), style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.logout_rounded, color: Colors.white),
                onPressed: () async {
                  final ok = await confirmDialog(context,
                      title: tr('Keluar dari Akun?', 'Log Out?'),
                      message: tr('Kamu perlu masuk lagi untuk mengelola pesanan & favoritmu.', 'You will need to log in again to manage your orders and favorites.'),
                      confirmText: tr('Ya, keluar', 'Yes, log out'), cancelText: tr('Batal', 'Cancel'),
                      icon: Icons.logout_rounded, danger: true);
                  if (ok && context.mounted) {
                    context.read<AuthBloc>().add(const AuthLoggedOut());
                    showSnack(context, tr('Kamu telah keluar dari akun.', 'You have been logged out.'), kind: SnackKind.info, title: tr('Sampai jumpa 👋', 'See you soon 👋'));
                  }
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
                if (session.user!.isCorporate)
                  _menuTile(context, Icons.business_center_rounded, tr('Portal Bisnis', 'Business Portal'), MC.primaryDark,
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CorporatePortalScreen()))),
                _menuTile(context, Icons.person_outline_rounded, tr('Data Pribadi', 'Personal Data'), MC.blue,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PersonalDataScreen()))),
                _menuTile(context, Icons.stars_rounded, tr('Poin & Membership', 'Points & Membership'), MC.primary,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoyaltyScreen()))),
                _menuTile(context, Icons.confirmation_num_outlined, tr('Voucher Saya', 'My Vouchers'), MC.accent,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WalletScreen()))),
                _menuTile(context, Icons.luggage_outlined, tr('Trips Saya', 'My Trips'), MC.success,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TripsScreen()))),
                _menuTile(context, Icons.security_rounded, tr('Keamanan', 'Security'), MC.blue,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SecurityScreen()))),
                _menuTile(context, Icons.receipt_long_outlined, tr('Pesanan Saya', 'My Orders'), MC.primary,
                    () => goToTab(context, 1)),
                _menuTile(context, Icons.favorite_border_rounded, tr('Hotel Favorit', 'Favorite Hotels'), MC.danger,
                    () => goToTab(context, 3)),
                _menuTile(context, Icons.lock_outline_rounded, tr('Ganti Password', 'Change Password'), MC.accent,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen()))),
                _menuTile(context, Icons.support_agent_rounded, tr('Live Chat CS', 'Live Chat CS'), MC.blue,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen()))),
                _menuTile(context, Icons.help_outline_rounded, tr('FAQ & Bantuan', 'FAQ & Help'), MC.success, () => _faq(context)),
                _menuTile(context, Icons.settings_outlined, tr('Pengaturan', 'Settings'), MC.inkMuted,
                    () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingScreen()))),
              ]),
              const SizedBox(height: 20),
              Center(child: Text(tr('Miruum · Versi 1.0', 'Miruum · Version 1.0'), style: TextStyle(color: MC.inkFaint, fontSize: 12))),
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
          Text(tr('FAQ', 'FAQ'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          SizedBox(height: 12),
          Text(tr('Bagaimana cara memesan hotel?', 'How do I book a hotel?'), style: TextStyle(fontWeight: FontWeight.w600)),
          Text(tr('Pilih hotel → Pilih Kamar → isi Rincian → Bayar → E-Voucher terbit.', 'Pick a hotel → Choose a Room → fill in Details → Pay → E-Voucher issued.'), style: TextStyle(color: MC.inkMuted, fontSize: 13)),
          SizedBox(height: 12),
          Text(tr('Bagaimana kebijakan refund?', 'What is the refund policy?'), style: TextStyle(fontWeight: FontWeight.w600)),
          Text(tr('Kamar refundable dapat dibatalkan sesuai ketentuan hotel.', 'Refundable rooms can be cancelled according to the hotel\'s terms.'), style: TextStyle(color: MC.inkMuted, fontSize: 13)),
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

  Widget _initial(String name) => Container(
        width: 64, height: 64, alignment: Alignment.center, color: MC.primarySoft,
        child: Text(name.characters.first.toUpperCase(),
            style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 26)),
      );

  Future<void> _change() async {
    if (_busy) return;
    final url = await pickAndUploadImage(context, folder: 'avatars');
    if (url == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final user = await context.read<Api>().updateMe({'avatarUrl': url});
      if (!mounted) return;
      context.read<AuthBloc>().add(AuthUserUpdated(user));
      showSnack(context, tr('Foto profil berhasil diperbarui.', 'Profile photo updated successfully.'), kind: SnackKind.success);
    } catch (_) {
      if (mounted) {
        showSnack(context, tr('Gagal menyimpan foto. Coba lagi.', 'Failed to save photo. Try again.'), kind: SnackKind.error);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthBloc>().state.user!;
    final hasPhoto = isHttpUrl(user.avatarUrl);
    return GestureDetector(
      onTap: _change,
      child: Stack(children: [
        CircleAvatar(
          radius: 32,
          backgroundColor: MC.primarySoft,
          child: ClipOval(
            child: hasPhoto
                ? Image.network(
                    user.avatarUrl!,
                    width: 64, height: 64, fit: BoxFit.cover,
                    // Fall back to the initial if the image fails to load.
                    errorBuilder: (_, __, ___) => _initial(user.name),
                    loadingBuilder: (ctx, child, prog) =>
                        prog == null ? child : const SizedBox(width: 64, height: 64, child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: MC.primary)))),
                  )
                : _initial(user.name),
          ),
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
          Text(tr('Hai, Sahabat Miruum 👋', 'Hi, Miruum Friend 👋'), style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800))
              .animate().fadeIn(delay: 120.ms).slideX(begin: -0.15, end: 0),
          const SizedBox(height: 4),
          Text(tr('Masuk untuk pengalaman terbaik', 'Log in for the best experience'), style: const TextStyle(color: Colors.white70, fontSize: 13.5))
              .animate().fadeIn(delay: 220.ms),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(24, 26, 24, 24), children: [
          ...stagger([
            _benefit(Icons.receipt_long_rounded, MC.primary, tr('Kelola Pesanan', 'Manage Orders'), tr('Lihat & lanjutkan pembayaran pesananmu', 'View & continue paying for your orders')),
            _benefit(Icons.favorite_rounded, MC.danger, tr('Simpan Favorit', 'Save Favorites'), tr('Bookmark hotel kesukaanmu', 'Bookmark your favorite hotels')),
            _benefit(Icons.local_offer_rounded, MC.accent, tr('Promo Eksklusif', 'Exclusive Promos'), tr('Dapatkan penawaran & diskon khusus member', 'Get member-only offers & discounts')),
            _benefit(Icons.verified_user_rounded, MC.blue, tr('Aman & Terverifikasi', 'Safe & Verified'), tr('Transaksi & e-voucher tersimpan rapi', 'Transactions & e-vouchers kept neatly')),
          ], startMs: 250),
          const SizedBox(height: 10),
          PrimaryButton(tr('Masuk', 'Log In'), icon: Icons.login_rounded,
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen())))
              .animate().fadeIn(delay: 560.ms).slideY(begin: 0.2, end: 0),
          const SizedBox(height: 10),
          Center(
            child: GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
              child: RichText(text: TextSpan(style: TextStyle(color: MC.inkMuted, fontSize: 13), children: [
                TextSpan(text: tr('Belum punya akun? ', 'Don\'t have an account? ')),
                TextSpan(text: tr('Daftar', 'Sign Up'), style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700)),
              ])),
            ),
          ).animate().fadeIn(delay: 640.ms),
        ]),
      ),
    ]);
  }
}
