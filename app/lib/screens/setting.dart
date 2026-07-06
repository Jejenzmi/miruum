import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';

class SettingScreen extends StatelessWidget {
  const SettingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pengaturan')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            _section('PENGATURAN AKUN'),
            _group(context, [
              (Icons.shield_outlined, 'Keamanan', 'Kelola kata sandi & keamanan'),
              (Icons.language_rounded, 'Bahasa', 'Indonesia'),
            ]),
            const SizedBox(height: 18),
            _section('INFORMASI'),
            _group(context, [
              (Icons.description_outlined, 'Syarat & Ketentuan', ''),
              (Icons.lock_outline_rounded, 'Kebijakan Privasi', ''),
              (Icons.info_outline_rounded, 'Tentang Kami', ''),
            ]),
            const SizedBox(height: 18),
            _section('AKUN'),
            Container(
              decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
              child: ListTile(
                leading: Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(color: MC.danger.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.delete_outline_rounded, color: MC.danger, size: 20),
                ),
                title: const Text('Hapus Akun', style: TextStyle(fontWeight: FontWeight.w600, color: MC.danger)),
                trailing: const Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
                onTap: () => _deleteAccount(context),
              ),
            ),
            const SizedBox(height: 24),
            const Center(child: Text('Miruum 2022, Version 1.0', style: TextStyle(color: MC.inkFaint, fontSize: 12))),
          ],
        ),
      ),
    );
  }

  Widget _section(String label) => Padding(
        padding: const EdgeInsets.only(bottom: 10, left: 4),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: MC.inkMuted, fontSize: 12, letterSpacing: 0.5)),
      );

  Widget _group(BuildContext context, List<(IconData, String, String)> items) => Container(
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow]),
        child: Column(children: [
          for (var i = 0; i < items.length; i++) ...[
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(12)),
                child: Icon(items[i].$1, color: MC.primaryDark, size: 20),
              ),
              title: Text(items[i].$2, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
              subtitle: items[i].$3.isEmpty ? null : Text(items[i].$3, style: const TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.chevron_right_rounded, color: MC.inkFaint),
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${items[i].$2} (demo)'), backgroundColor: MC.primary)),
            ),
            if (i < items.length - 1) const Divider(height: 1, color: MC.line, indent: 60),
          ],
        ]),
      );

  void _deleteAccount(BuildContext context) {
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Hapus Akun'),
      content: const Text('Tindakan ini permanen. Yakin ingin menghapus akun?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hapus', style: TextStyle(color: MC.danger))),
      ],
    ));
  }
}
