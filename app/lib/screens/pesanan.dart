import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../bloc/auth/auth_bloc.dart';
import '../bloc/cubits.dart';
import '../bloc/view_state.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'auth.dart';
import 'pembayaran.dart';
import 'hotel_detail.dart';
import 'booking_detail.dart';
import 'review_sheet.dart';

class PesananScreen extends StatelessWidget {
  const PesananScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthBloc>().state;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: const Text('Pesanan'),
        centerTitle: false,
        titleTextStyle: const TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
      ),
      body: SafeArea(
        top: false,
        child: !auth.isLoggedIn
            ? _LoginPrompt(onLogin: () => ensureLoggedIn(context))
            : BlocProvider(
                create: (ctx) => BookingsCubit(ctx.read<Api>())..load(),
                child: const _PesananTabs(),
              ),
      ),
    );
  }
}

class _PesananTabs extends StatelessWidget {
  const _PesananTabs();
  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(children: [
        const TabBar(
          labelColor: MC.primaryDark,
          unselectedLabelColor: MC.inkFaint,
          indicatorColor: MC.primary,
          labelStyle: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
          tabs: [Tab(text: 'Aktif'), Tab(text: 'Riwayat Transaksi')],
        ),
        Expanded(
          child: BlocBuilder<BookingsCubit, ViewState<List<Booking>>>(
            builder: (context, state) {
              if (state.isLoading) {
                return const SkeletonList();
              }
              final all = state.data ?? [];
              final active = all.where((b) => b.status == 'PENDING' || b.status == 'PAID').toList();
              final history = all.where((b) => b.status == 'COMPLETED' || b.status == 'CANCELLED' || b.status == 'REFUNDED').toList();
              return TabBarView(children: [
                _list(context, active, empty: 'Belum ada pesanan aktif'),
                _list(context, history, empty: 'Belum ada riwayat transaksi'),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  Widget _list(BuildContext context, List<Booking> items, {required String empty}) {
    if (items.isEmpty) {
      return EmptyState(icon: Icons.receipt_long_rounded, title: empty,
          subtitle: 'Pesananmu akan muncul di sini', color: MC.primary);
    }
    return RefreshIndicator(
      onRefresh: () => context.read<BookingsCubit>().load(),
      child: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) => _OrderCard(items[i], onChanged: () => context.read<BookingsCubit>().load())
            .animate().fadeIn(delay: (i * 60).ms, duration: 350.ms).slideY(begin: 0.12, end: 0),
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
      if (b.status == 'PENDING')
        Row(children: [
          Expanded(child: OutlineButtonX('Detail', onPressed: () => Navigator.push(context,
              MaterialPageRoute(builder: (_) => BookingDetailScreen(b))))),
          const SizedBox(width: 10),
          Expanded(child: PrimaryButton('Bayar', onPressed: () async {
            await Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: b.id)));
            onChanged();
          })),
        ])
      else if (b.status == 'PAID' || b.status == 'COMPLETED')
        Row(children: [
          Expanded(child: OutlineButtonX('E-Voucher', icon: Icons.receipt_long_rounded, onPressed: () async {
            final ok = await openUrl(context.read<Api>().voucherUrl(b.code));
            if (!ok && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tidak dapat membuka e-voucher')));
            }
          })),
          const SizedBox(width: 10),
          Expanded(child: PrimaryButton('Beri Ulasan', icon: Icons.rate_review_outlined, onPressed: () async {
            final done = await showReviewSheet(context, b.hotel!.id, hotelName: b.hotel!.name);
            if (done && context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Terima kasih atas ulasanmu!'), backgroundColor: MC.primary));
            }
          })),
        ]),
      if (b.status == 'PENDING' || b.status == 'PAID')
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: MC.danger, padding: EdgeInsets.zero),
            icon: const Icon(Icons.cancel_outlined, size: 16),
            label: const Text('Batalkan Pesanan', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
            onPressed: () => _cancel(context),
          ),
        ),
    ]));
  }

  String _refundNote() {
    if (b.status != 'PAID') return 'Pesanan yang belum dibayar akan dibatalkan tanpa biaya.';
    final room = b.room;
    final checkIn = DateTime.tryParse(b.checkIn);
    final hrs = checkIn == null ? 0 : checkIn.difference(DateTime.now()).inHours;
    if (room != null && room.freeCancellation && hrs > 24) return 'Kamu akan mendapat refund 100% (gratis pembatalan).';
    if (room != null && room.refundable && hrs > 24) return 'Kamu akan mendapat refund 50% sesuai kebijakan.';
    return 'Kamar ini non-refundable — tidak ada pengembalian dana.';
  }

  Future<void> _cancel(BuildContext context) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Text('Batalkan Pesanan?'),
      content: Text('${_refundNote()}\n\nNo. Pesanan ${b.code}'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Kembali')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Ya, Batalkan', style: TextStyle(color: MC.danger))),
      ],
    ));
    if (ok != true || !context.mounted) return;
    try {
      final (_, refundPct, refundAmount) = await context.read<Api>().cancelBooking(b.id);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: MC.primary,
        content: Text(refundAmount > 0
            ? 'Pesanan dibatalkan. Refund $refundPct% = ${rupiah(refundAmount)} diproses.'
            : 'Pesanan dibatalkan.'),
      ));
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    }
  }
}

class _LoginPrompt extends StatelessWidget {
  final VoidCallback onLogin;
  const _LoginPrompt({required this.onLogin});
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.lock_outline_rounded,
        title: 'Masuk untuk melihat pesananmu',
        subtitle: 'Kelola & lanjutkan pembayaran pesananmu',
        action: PrimaryButton('Masuk / Daftar', expand: false, onPressed: onLogin),
      );
}
