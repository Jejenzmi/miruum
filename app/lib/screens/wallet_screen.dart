import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:share_plus/share_plus.dart';
import '../api.dart';
import '../feedback.dart';
import '../theme.dart';
import '../widgets.dart';

/// "Voucher Saya" — collectible promo wallet + referral / invite friends.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});
  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  Map<String, dynamic>? _vouchers;
  Map<String, dynamic>? _referral;
  bool _loading = true;
  final _codeCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final v = await context.read<Api>().myVouchers();
      final r = await context.read<Api>().referral();
      if (mounted) setState(() { _vouchers = v; _referral = r; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _claim(String promoId) async {
    try {
      await context.read<Api>().claimVoucher(promoId);
      showSnack(context, 'Voucher ditambahkan ke dompetmu.', kind: SnackKind.success);
      _load();
    } catch (e) {
      if (mounted) showSnack(context, 'Gagal mengambil voucher.', kind: SnackKind.error);
    }
  }

  Future<void> _applyReferral() async {
    final code = _codeCtl.text.trim().toUpperCase();
    if (code.isEmpty) return;
    try {
      final r = await context.read<Api>().applyReferral(code);
      showSnack(context, 'Berhasil! +${r['bonus']} poin untukmu & temanmu.', kind: SnackKind.success);
      _codeCtl.clear();
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, kind: SnackKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mine = (_vouchers?['mine'] as List?) ?? [];
    final claimable = (_vouchers?['claimable'] as List?) ?? [];
    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Voucher Saya')),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: MC.primary))
          : ListView(padding: const EdgeInsets.all(20), children: [
              // Referral card
              if (_referral != null) _referralCard(),
              const SizedBox(height: 22),
              const Text('Voucher Saya', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 10),
              if (mine.isEmpty)
                Text('Belum ada voucher. Ambil voucher yang tersedia di bawah.', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              for (final v in mine) _voucherCard(v, owned: true),
              const SizedBox(height: 22),
              const Text('Voucher Tersedia', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 10),
              if (claimable.isEmpty)
                Text('Belum ada voucher baru untuk diambil.', style: TextStyle(color: MC.inkMuted, fontSize: 13)),
              for (final v in claimable) _voucherCard(v, owned: false),
            ]),
    );
  }

  Widget _referralCard() {
    final code = (_referral!['code'] ?? '').toString();
    final invited = _referral!['invited'] ?? 0;
    final bonus = _referral!['bonusPoints'] ?? 100;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.card_giftcard_rounded, color: Colors.white, size: 22),
          const SizedBox(width: 8),
          const Expanded(child: Text('Undang Teman', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16))),
          Text('$invited diundang', style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ]),
        const SizedBox(height: 6),
        Text('Bagikan kodemu — kamu & temanmu sama-sama dapat $bonus poin.', style: const TextStyle(color: Colors.white70, fontSize: 12.5, height: 1.4)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.18), borderRadius: BorderRadius.circular(12)),
            child: Text(code, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18, letterSpacing: 2)),
          )),
          const SizedBox(width: 10),
          IconButton(onPressed: () => Share.share('Pakai kode $code di aplikasi Miruum & dapat $bonus poin! Unduh: https://ota.gokar.id'),
            icon: const Icon(Icons.share_rounded, color: Colors.white)),
        ]),
        const SizedBox(height: 12),
        const Text('Punya kode dari teman?', style: TextStyle(color: Colors.white70, fontSize: 12)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(child: TextField(controller: _codeCtl, textCapitalization: TextCapitalization.characters,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(hintText: 'Masukkan kode', hintStyle: const TextStyle(color: Colors.white54),
              filled: true, fillColor: Colors.white.withOpacity(0.15), isDense: true,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none)))),
          const SizedBox(width: 8),
          FilledButton(onPressed: _applyReferral,
            style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: MC.primaryDark),
            child: const Text('Pakai')),
        ]),
      ]),
    );
  }

  Widget _voucherCard(Map v, {required bool owned}) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: MC.surface, borderRadius: BorderRadius.circular(14), boxShadow: [softShadow],
          border: Border.all(color: MC.primary.withOpacity(0.25))),
        child: Row(children: [
          Container(width: 46, height: 46, decoration: BoxDecoration(color: MC.primarySoft, borderRadius: BorderRadius.circular(12)),
            child: Center(child: Text('${v['discountPct']}%', style: const TextStyle(color: MC.primaryDark, fontWeight: FontWeight.w800, fontSize: 15)))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text((v['title'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 2),
            Text('Kode: ${v['code']}', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          ])),
          if (owned)
            const Icon(Icons.check_circle_rounded, color: MC.success)
          else
            SizedBox(height: 34, child: ElevatedButton(onPressed: () => _claim((v['id']).toString()),
              style: ElevatedButton.styleFrom(backgroundColor: MC.primary, foregroundColor: Colors.white, elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))),
              child: const Text('Ambil'))),
        ]),
      );
}
