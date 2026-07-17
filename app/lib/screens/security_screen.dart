import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../feedback.dart';
import '../theme.dart';
import '../widgets.dart';

/// "Keamanan" — 2FA, active sessions/devices, and login history.
class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});
  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  bool _twoFa = false, _loading = true, _busy = false;
  List<dynamic> _sessions = [], _history = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final api = context.read<Api>();
      final fa = await api.get2fa();
      final s = await api.sessions();
      final h = await api.loginHistory();
      if (mounted) setState(() { _twoFa = fa; _sessions = s; _history = h; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle2fa(bool v) async {
    setState(() => _busy = true);
    try {
      final r = await context.read<Api>().set2fa(v);
      setState(() => _twoFa = r);
      showSnack(context, v ? 'Verifikasi 2 langkah aktif — kode dikirim ke email saat login.' : 'Verifikasi 2 langkah dimatikan.', kind: SnackKind.success);
    } catch (_) {
      if (mounted) showSnack(context, 'Gagal memperbarui.', kind: SnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(String id) async {
    try { await context.read<Api>().revokeSession(id); _load(); } catch (_) {}
  }

  Future<void> _revokeOthers() async {
    try {
      await context.read<Api>().revokeOtherSessions();
      showSnack(context, 'Keluar dari semua perangkat lain.', kind: SnackKind.success);
      _load();
    } catch (_) {}
  }

  String _fmt(String? iso) {
    final d = DateTime.tryParse(iso ?? '');
    return d == null ? '' : DateFormat('d MMM yyyy, HH:mm', 'id_ID').format(d.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Keamanan')),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MC.primary))
          : ListView(padding: const EdgeInsets.all(20), children: [
              // 2FA
              cardBox(child: Row(children: [
                Container(width: 42, height: 42, decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.verified_user_rounded, color: MC.primaryDark)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Verifikasi 2 Langkah', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                  const SizedBox(height: 2),
                  Text('Kode via email setiap kali login.', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
                ])),
                Switch(value: _twoFa, activeColor: MC.primary, onChanged: _busy ? null : _toggle2fa),
              ])),
              const SizedBox(height: 22),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                const Text('Perangkat Aktif', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                if (_sessions.length > 1)
                  GestureDetector(onTap: _revokeOthers, child: const Text('Keluar lainnya', style: TextStyle(color: MC.danger, fontWeight: FontWeight.w600, fontSize: 12.5))),
              ]),
              const SizedBox(height: 10),
              for (final s in _sessions) _sessionTile(s),
              const SizedBox(height: 22),
              const Text('Riwayat Login', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 10),
              if (_history.isEmpty) Text('Belum ada riwayat.', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              for (final h in _history.take(15)) _historyTile(h),
            ]),
    );
  }

  Widget _sessionTile(Map s) {
    final current = s['current'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(12), boxShadow: [softShadow]),
      child: Row(children: [
        Icon(Icons.devices_rounded, color: current ? MC.success : MC.inkMuted, size: 22),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((s['device'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
          Text('Masuk ${_fmt(s['createdAt'])}${current ? ' · Perangkat ini' : ''}',
              style: TextStyle(color: current ? MC.success : MC.inkFaint, fontSize: 11.5)),
        ])),
        if (!current)
          TextButton(onPressed: () => _revoke((s['id']).toString()), child: const Text('Keluar', style: TextStyle(color: MC.danger, fontSize: 12.5))),
      ]),
    );
  }

  Widget _historyTile(Map h) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Icon(h['ok'] == true ? Icons.check_circle_rounded : Icons.cancel_rounded, size: 15, color: h['ok'] == true ? MC.success : MC.danger),
          const SizedBox(width: 8),
          Expanded(child: Text((h['device'] ?? 'Perangkat').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5))),
          Text(_fmt(h['createdAt']), style: TextStyle(color: MC.inkFaint, fontSize: 11.5)),
        ]),
      );
}
