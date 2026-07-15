import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../theme.dart';
import '../widgets.dart';

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});
  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  final _fmt = DateFormat('d MMM yyyy', 'id_ID');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await context.read<Api>().loyalty();
      if (mounted) setState(() => _data = d);
    } catch (e) {
      if (mounted) setState(() => _error = 'Gagal memuat poin');
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final points = (d?['points'] ?? 0) as int;
    final redeemValue = (d?['redeemValue'] ?? 100) as int;
    final earnPer = (d?['earnPer'] ?? 10000) as int;
    final maxPct = (d?['maxRedeemPct'] ?? 30) as int;
    final txns = (d?['txns'] as List?) ?? [];
    final rupiahValue = points * redeemValue;

    return Scaffold(
      backgroundColor: MC.bg,
      appBar: AppBar(title: const Text('Poin Miruum')),
      body: _error != null
          ? Center(child: Text(_error!, style: TextStyle(color: MC.inkMuted)))
          : d == null
              ? const Center(child: CircularProgressIndicator(color: MC.primary))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.all(20), children: [
                    // Balance card
                    Container(
                      padding: const EdgeInsets.all(22),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [MC.primary, MC.primaryDark], begin: Alignment.topLeft, end: Alignment.bottomRight),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [BoxShadow(color: MC.primary.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 8))],
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          const Icon(Icons.stars_rounded, color: Colors.white, size: 22),
                          const SizedBox(width: 8),
                          const Text('Poin Saya', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
                        ]),
                        const SizedBox(height: 10),
                        Text('$points', style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, height: 1)),
                        const SizedBox(height: 2),
                        Text('Senilai ${rupiah(rupiahValue)}', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                      ]),
                    ),
                    const SizedBox(height: 16),
                    // How it works
                    cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Cara Kerja', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      const SizedBox(height: 10),
                      _bullet('Dapat 1 poin setiap ${rupiah(earnPer)} untuk menginap yang dibayar.'),
                      _bullet('1 poin = ${rupiah(redeemValue)} saat ditukar jadi diskon.'),
                      _bullet('Poin bisa menutup hingga $maxPct% dari total pesanan.'),
                    ])),
                    const SizedBox(height: 16),
                    const Padding(padding: EdgeInsets.only(left: 4, bottom: 8), child: Text('Riwayat Poin', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                    if (txns.isEmpty)
                      cardBox(child: Text('Belum ada aktivitas poin. Selesaikan pesanan untuk mulai mengumpulkan poin!', style: TextStyle(color: MC.inkMuted, fontSize: 13)))
                    else
                      ...txns.map((t) {
                        final pts = (t['points'] ?? 0) as int;
                        final earn = pts >= 0;
                        return Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: cardBox(child: Row(children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(color: (earn ? MC.success : MC.primary).withOpacity(0.12), borderRadius: BorderRadius.circular(10)),
                              child: Icon(earn ? Icons.add_rounded : Icons.redeem_rounded, color: earn ? MC.success : MC.primary, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text((t['note'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                              Text(_fmt.format(DateTime.tryParse((t['createdAt'] ?? '').toString()) ?? DateTime.now()), style: TextStyle(color: MC.inkFaint, fontSize: 11)),
                            ])),
                            Text('${earn ? '+' : ''}$pts', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: earn ? MC.success : MC.primary)),
                          ])),
                        );
                      }),
                  ]),
                ),
    );
  }

  Widget _bullet(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 5), child: Icon(Icons.check_circle_rounded, size: 15, color: MC.primary)),
          const SizedBox(width: 8),
          Expanded(child: Text(t, style: TextStyle(fontSize: 12.5, color: MC.inkMuted, height: 1.4))),
        ]),
      );
}
