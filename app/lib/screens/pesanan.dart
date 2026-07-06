import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'auth.dart';
import 'pembayaran.dart';
import 'hotel_detail.dart';

class PesananScreen extends StatefulWidget {
  const PesananScreen({super.key});
  @override
  State<PesananScreen> createState() => _PesananScreenState();
}

class _PesananScreenState extends State<PesananScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);
  Future<List<Booking>>? _future;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    final session = context.read<Session>();
    if (session.isLoggedIn) _future = session.api.bookings();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Pesanan'),
        centerTitle: false,
        titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
        bottom: session.isLoggedIn
            ? TabBar(
                controller: _tab,
                labelColor: MC.primaryDark,
                unselectedLabelColor: MC.inkFaint,
                indicatorColor: MC.primary,
                labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
                tabs: const [Tab(text: 'Aktif'), Tab(text: 'Riwayat Transaksi')],
              )
            : null,
      ),
      body: SafeArea(
        top: false,
        child: !session.isLoggedIn
            ? _LoginPrompt(onLogin: () async {
                if (await ensureLoggedIn(context)) setState(_reload);
              })
            : FutureBuilder<List<Booking>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator(color: MC.primary));
                  }
                  final all = snap.data ?? [];
                  final active = all.where((b) => b.status == 'PENDING' || b.status == 'PAID').toList();
                  final history = all.where((b) => b.status == 'COMPLETED' || b.status == 'CANCELLED' || b.status == 'REFUNDED').toList();
                  return TabBarView(controller: _tab, children: [
                    _list(active, empty: 'Belum ada pesanan aktif'),
                    _list(history, empty: 'Belum ada riwayat transaksi'),
                  ]);
                },
              ),
      ),
    );
  }

  Widget _list(List<Booking> items, {required String empty}) {
    if (items.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.receipt_long_rounded, size: 48, color: MC.inkFaint),
        const SizedBox(height: 12),
        Text(empty, style: const TextStyle(color: MC.inkMuted)),
      ]));
    }
    return RefreshIndicator(
      onRefresh: () async => setState(_reload),
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) => _OrderCard(items[i], onChanged: () => setState(_reload)),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Booking b;
  final VoidCallback onChanged;
  const _OrderCard(this.b, {required this.onChanged});

  ({Color color, String label}) get _status => switch (b.status) {
        'PENDING' => (color: MC.accent, label: 'Menunggu dibayar'),
        'PAID' => (color: MC.primary, label: 'Sudah dibayar'),
        'COMPLETED' => (color: MC.primaryDark, label: 'Selesai'),
        'CANCELLED' => (color: MC.danger, label: 'Dibatalkan'),
        'REFUNDED' => (color: MC.inkMuted, label: 'Refund'),
        _ => (color: MC.inkMuted, label: b.status),
      };

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final fmt = DateFormat('d MMM', 'id_ID');
    final dates = '${fmt.format(DateTime.tryParse(b.checkIn) ?? DateTime.now())} - ${fmt.format(DateTime.tryParse(b.checkOut) ?? DateTime.now())}';
    return cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('No. Pesanan : ${b.code}', style: const TextStyle(fontSize: 11.5, color: MC.inkMuted)),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: s.color.withOpacity(0.12), borderRadius: BorderRadius.circular(8)),
          child: Text(s.label, style: TextStyle(color: s.color, fontSize: 11, fontWeight: FontWeight.w700)),
        ),
      ]),
      const SizedBox(height: 10),
      Row(children: [
        ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(b.hotel?.imageUrl ?? '', width: 72, height: 72)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(b.hotel?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
          const SizedBox(height: 2),
          Text(b.hotel?.city ?? '', style: const TextStyle(color: MC.inkMuted, fontSize: 12)),
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.event_rounded, size: 13, color: MC.inkFaint),
            const SizedBox(width: 4),
            Text(dates, style: const TextStyle(fontSize: 12, color: MC.inkMuted)),
          ]),
          const SizedBox(height: 4),
          Text(rupiah(b.totalPrice), style: const TextStyle(fontWeight: FontWeight.w800, color: MC.primaryDark)),
        ])),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: OutlineButtonX('Rincian', onPressed: () => Navigator.push(context,
            MaterialPageRoute(builder: (_) => HotelDetailScreen(b.hotel!.id))))),
        const SizedBox(width: 10),
        if (b.status == 'PENDING')
          Expanded(child: PrimaryButton('Bayar', onPressed: () async {
            await Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: b.id)));
            onChanged();
          }))
        else if (b.status == 'PAID' || b.status == 'COMPLETED')
          Expanded(child: PrimaryButton('Pesan Lagi', onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => HotelDetailScreen(b.hotel!.id))))),
      ]),
    ]));
  }
}

class _LoginPrompt extends StatelessWidget {
  final VoidCallback onLogin;
  const _LoginPrompt({required this.onLogin});
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.lock_outline_rounded, size: 52, color: MC.inkFaint),
            const SizedBox(height: 14),
            const Text('Masuk untuk melihat pesananmu', style: TextStyle(fontWeight: FontWeight.w600), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            PrimaryButton('Masuk / Daftar', expand: false, onPressed: onLogin),
          ]),
        ),
      );
}
