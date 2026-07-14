import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';

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
              _tile(Icons.description_outlined, tr('Syarat & Ketentuan', 'Terms & Conditions'), MC.blue, () => _info(context)),
              Divider(height: 1, color: MC.line, indent: 60),
              _tile(Icons.shield_outlined, tr('Kebijakan Privasi', 'Privacy Policy'), MC.success, () => _info(context)),
              Divider(height: 1, color: MC.line, indent: 60),
              _tile(Icons.info_outline_rounded, tr('Tentang Miruum', 'About Miruum'), MC.primary, () => _info(context)),
            ])),
            const SizedBox(height: 24),
            Center(child: Text('Miruum · Version 1.0', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
          ],
        ),
      ),
    );
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

  void _info(BuildContext context) => ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr('Segera hadir', 'Coming soon')), backgroundColor: MC.primary));
}
