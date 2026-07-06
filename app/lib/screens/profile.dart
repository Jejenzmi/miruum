import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'personal_data.dart';
import 'setting.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Menu'),
        centerTitle: false,
        titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
        actions: [
          if (session.isLoggedIn)
            IconButton(
              icon: const Icon(Icons.power_settings_new_rounded, color: MC.danger),
              onPressed: () async {
                final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
                  title: const Text('Keluar'),
                  content: const Text('Yakin ingin keluar dari akun?'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
                    TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Keluar', style: TextStyle(color: MC.danger))),
                  ],
                ));
                if (ok == true) session.logout();
              },
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: !session.isLoggedIn
            ? _GuestProfile()
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Row(children: [
                    Stack(children: [
                      CircleAvatar(radius: 32, backgroundColor: MC.primarySoft,
                          child: Text(session.user!.name.characters.first.toUpperCase(),
                              style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 26))),
                      Positioned(right: 0, bottom: 0, child: Container(
                        width: 14, height: 14,
                        decoration: BoxDecoration(color: MC.primary, shape: BoxShape.circle, border: Border.all(color: MC.bg, width: 2)),
                      )),
                    ]),
                    const SizedBox(width: 16),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Selamat Datang', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                      Text(session.user!.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                      Text(session.user!.email, style: const TextStyle(color: MC.inkMuted, fontSize: 12.5)),
                    ])),
                  ]),
                  const SizedBox(height: 24),
                  _menuTile(context, Icons.person_outline_rounded, 'Data Pribadi',
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PersonalDataScreen()))),
                  _menuTile(context, Icons.help_outline_rounded, 'FAQ', () => _faq(context)),
                  _menuTile(context, Icons.settings_outlined, 'Pengaturan',
                      () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingScreen()))),
                  const SizedBox(height: 30),
                  const Center(child: Text('Miruum 2022, Version 1.0', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
                ],
              ),
      ),
    );
  }

  Widget _menuTile(BuildContext context, IconData icon, String label, VoidCallback onTap) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
        child: ListTile(
          leading: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: MC.primaryDark, size: 20),
          ),
          title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
          trailing: const Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
          onTap: onTap,
        ),
      );

  void _faq(BuildContext context) {
    showModalBottomSheet(context: context, backgroundColor: MC.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const Padding(
        padding: EdgeInsets.all(24),
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

class _GuestProfile extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const CircleAvatar(radius: 40, backgroundColor: MC.primarySoft, child: Icon(Icons.person_rounded, size: 44, color: MC.primaryDark)),
            const SizedBox(height: 16),
            const Text('Belum masuk', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            const Text('Masuk untuk mengelola akun & pesananmu', textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted)),
            const SizedBox(height: 20),
            PrimaryButton('Masuk', expand: false, onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignInScreen()))),
            const SizedBox(height: 10),
            TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignUpScreen())),
                child: const Text('Belum punya akun? Daftar', style: TextStyle(color: MC.primary))),
          ]),
        ),
      );
}
