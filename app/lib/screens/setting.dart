import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../feedback.dart';
import '../l10n.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'content_screen.dart';

class SettingScreen extends StatefulWidget {
  const SettingScreen({super.key});
  @override
  State<SettingScreen> createState() => _SettingScreenState();
}

class _SettingScreenState extends State<SettingScreen> {
  Future<void> _setTheme(ThemeMode m) async {
    AppSettings.themeMode.value = m;
    (await SharedPreferences.getInstance())
        .setString('miruum_theme', m == ThemeMode.dark ? 'dark' : m == ThemeMode.light ? 'light' : 'system');
    setState(() {});
  }

  Future<void> _setLang(String code) async {
    AppSettings.locale.value = Locale(code);
    (await SharedPreferences.getInstance()).setString('miruum_lang', code);
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final mode = AppSettings.themeMode.value;
    return Scaffold(
      appBar: AppBar(title: Text(tr('Pengaturan', 'Settings'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _section(tr('TAMPILAN', 'APPEARANCE')),
            _card(child: Column(children: [
              _rowLabel(Icons.dark_mode_outlined, tr('Tema', 'Theme')),
              const SizedBox(height: 10),
              _segments([
                (ThemeMode.system, tr('Sistem', 'System'), Icons.brightness_auto_rounded),
                (ThemeMode.light, tr('Terang', 'Light'), Icons.light_mode_rounded),
                (ThemeMode.dark, tr('Gelap', 'Dark'), Icons.dark_mode_rounded),
              ].map((e) => _seg(e.$2, e.$3, mode == e.$1, () => _setTheme(e.$1))).toList()),
              Divider(height: 26, color: MC.line),
              _rowLabel(Icons.language_rounded, tr('Bahasa', 'Language')),
              const SizedBox(height: 10),
              _segments([
                _seg('Indonesia', Icons.flag_rounded, !isEn, () => _setLang('id')),
                _seg('English', Icons.flag_outlined, isEn, () => _setLang('en')),
              ]),
            ])),
            const SizedBox(height: 18),
            _section(tr('AKUN', 'ACCOUNT')),
            _card(child: Column(children: [
              _tile(Icons.lock_outline_rounded, tr('Ganti Password', 'Change Password'), MC.accent,
                  () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ChangePasswordScreen()))),
            ])),
            const SizedBox(height: 18),
            _section(tr('INFORMASI', 'INFORMATION')),
            _card(child: Column(children: [
              _tile(Icons.description_outlined, tr('Syarat & Ketentuan', 'Terms & Conditions'), MC.blue,
                  () => _openContent(context, 'terms', tr('Syarat & Ketentuan', 'Terms & Conditions'))),
              Divider(height: 1, color: MC.line, indent: 60),
              _tile(Icons.shield_outlined, tr('Kebijakan Privasi', 'Privacy Policy'), MC.success,
                  () => _openContent(context, 'privacy', tr('Kebijakan Privasi', 'Privacy Policy'))),
              Divider(height: 1, color: MC.line, indent: 60),
              _tile(Icons.info_outline_rounded, tr('Tentang Miruum', 'About Miruum'), MC.primary,
                  () => _openContent(context, 'about', tr('Tentang Miruum', 'About Miruum'))),
            ])),
            const SizedBox(height: 16),
            // UU PDP — data subject rights
            if (context.read<AuthBloc>().state.isLoggedIn)
              _card(child: Column(children: [
                _tile(Icons.download_rounded, tr('Unduh Data Saya', 'Download My Data'), MC.blue, _exportData),
                Divider(height: 1, color: MC.line, indent: 60),
                _tile(Icons.delete_outline_rounded, tr('Hapus Akun', 'Delete Account'), MC.danger, _deleteAccount),
              ])),
            const SizedBox(height: 24),
            Center(child: Text('Miruum · Version 1.1', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
          ],
        ),
      ),
    );
  }

  Future<void> _exportData() async {
    try {
      final data = await context.read<Api>().exportMyData();
      const encoder = JsonEncoder.withIndent('  ');
      await Share.share(encoder.convert(data), subject: tr('Data Miruum Saya', 'My Miruum Data'));
    } catch (_) {
      if (mounted) showSnack(context, tr('Gagal mengunduh data.', 'Failed to export data.'), kind: SnackKind.error);
    }
  }

  Future<void> _deleteAccount() async {
    final ok = await confirmDialog(context,
        title: tr('Hapus Akun?', 'Delete Account?'),
        message: tr(
            'Akun & data pribadi Anda akan dihapus permanen. Catatan transaksi disimpan secara anonim sesuai kewajiban hukum. Tindakan ini tak bisa dibatalkan.',
            'Your account & personal data will be permanently deleted. Transaction records are kept anonymized per legal obligations. This cannot be undone.'),
        confirmText: tr('Ya, Hapus Akun', 'Yes, Delete'), cancelText: tr('Batal', 'Cancel'),
        icon: Icons.delete_forever_rounded, danger: true);
    if (!ok || !mounted) return;
    try {
      await context.read<Api>().deleteAccount();
      if (!mounted) return;
      context.read<AuthBloc>().add(const AuthLoggedOut());
      Navigator.of(context).popUntil((r) => r.isFirst);
      showSnack(context, tr('Akun Anda telah dihapus.', 'Your account has been deleted.'), kind: SnackKind.info);
    } catch (e) {
      if (mounted) showSnack(context, e is ApiException ? e.message : tr('Gagal menghapus akun.', 'Failed to delete account.'), kind: SnackKind.error);
    }
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.only(bottom: 10, left: 4),
        child: Text(label, style: TextStyle(fontWeight: FontWeight.w700, color: MC.inkMuted, fontSize: 12, letterSpacing: 0.5)),
      );

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(16), boxShadow: [softShadow]),
        child: child,
      );

  Widget _rowLabel(IconData icon, String label) => Row(children: [
        Icon(icon, size: 20, color: MC.primary),
        const SizedBox(width: 10),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
      ]);

  Widget _segments(List<Widget> segs) => Row(children: [
        for (var i = 0; i < segs.length; i++) ...[
          Expanded(child: segs[i]),
          if (i < segs.length - 1) const SizedBox(width: 8),
        ],
      ]);

  Widget _seg(String label, IconData icon, bool sel, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: sel ? MC.primary : MC.field,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(children: [
            Icon(icon, size: 18, color: sel ? Colors.white : MC.inkMuted),
            const SizedBox(height: 4),
            Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: sel ? Colors.white : MC.inkMuted)),
          ]),
        ),
      );

  Widget _tile(IconData icon, String label, Color color, VoidCallback onTap) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: color, size: 20),
        ),
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
        trailing: Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
        onTap: onTap,
      );

  void _openContent(BuildContext context, String slug, String title) => Navigator.push(
      context, MaterialPageRoute(builder: (_) => ContentScreen(slug: slug, fallbackTitle: title)));
}
