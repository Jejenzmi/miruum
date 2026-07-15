import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../feedback.dart';
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
        titleTextStyle: TextStyle(color: MC.ink, fontSize: 20, fontWeight: FontWeight.w800),
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
        TabBar(
          labelColor: MC.primaryDark,
          unselectedLabelColor: MC.inkFaint,
          indicatorColor: MC.primary,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
          tabs: const [Tab(text: 'Aktif'), Tab(text: 'Riwayat Transaksi')],
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
        Text('No. Pesanan : ${b.code}', style: TextStyle(fontSize: 11.5, color: MC.inkMuted)),
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
          Text(b.hotel?.city ?? '', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
          const SizedBox(height: 4),
          Row(children: [
            Icon(Icons.event_rounded, size: 13, color: MC.inkFaint),
            const SizedBox(width: 4),
            Text(dates, style: TextStyle(fontSize: 12, color: MC.inkMuted)),
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
        Row(children: [
          // Reschedule only BEFORE payment — after paying, the price is locked
          // (changing dates would alter the total without a payment settlement).
          if (b.status == 'PENDING') ...[
            TextButton.icon(
              style: TextButton.styleFrom(foregroundColor: MC.primary, padding: EdgeInsets.zero),
              icon: const Icon(Icons.edit_calendar_rounded, size: 16),
              label: const Text('Ubah Tanggal', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
              onPressed: () => _reschedule(context),
            ),
            const SizedBox(width: 6),
          ],
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: MC.danger, padding: EdgeInsets.zero),
            icon: const Icon(Icons.cancel_outlined, size: 16),
            label: const Text('Batalkan', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
            onPressed: () => _cancel(context),
          ),
        ]),
    ]));
  }

  /// Reschedule: pick a new date range → show price-diff quote → apply.
  Future<void> _reschedule(BuildContext context) async {
    final now = DateTime.now();
    final ci0 = DateTime.tryParse(b.checkIn) ?? now.add(const Duration(days: 1));
    final co0 = DateTime.tryParse(b.checkOut) ?? ci0.add(const Duration(days: 1));
    final range = await showDateRangePicker(
      context: context,
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      initialDateRange: DateTimeRange(start: ci0.isAfter(now) ? ci0 : now.add(const Duration(days: 1)), end: co0.isAfter(ci0) ? co0 : ci0.add(const Duration(days: 1))),
      helpText: 'Pilih tanggal baru',
      saveText: 'Lanjut',
    );
    if (range == null || !context.mounted) return;
    Map<String, dynamic> q;
    try {
      q = await context.read<Api>().rescheduleQuote(b.id, range.start, range.end);
    } catch (e) {
      if (context.mounted) showSnack(context, e is ApiException ? e.message : 'Gagal memuat estimasi', kind: SnackKind.error);
      return;
    }
    if (!context.mounted) return;
    if (q['allowed'] != true) {
      showSnack(context, (q['reason'] ?? 'Tidak dapat dijadwal ulang').toString(), kind: SnackKind.error);
      return;
    }
    final diff = (q['diff'] ?? 0) as int;
    final nights = (q['nights'] ?? 0) as int;
    final diffLine = diff > 0
        ? 'Selisih tambahan: ${rupiah(diff)}'
        : diff < 0
            ? 'Kelebihan (kredit): ${rupiah(-diff)}'
            : 'Tanpa selisih harga.';
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Text('Ubah Tanggal?'),
      content: Text('$nights malam baru.\nTotal baru: ${rupiah((q['newTotal'] ?? 0) as int)}\n$diffLine'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Ya, Ubah', style: TextStyle(color: MC.primary, fontWeight: FontWeight.w700))),
      ],
    ));
    if (ok != true || !context.mounted) return;
    try {
      await context.read<Api>().reschedule(b.id, range.start, range.end);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Jadwal berhasil diubah.'), backgroundColor: MC.primary));
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: MC.danger));
    }
  }

  /// Bank-account form for a cash refund. The account holder is locked to the
  /// user's Data Pribadi name (refund must go to the guest's own account).
  /// Returns {bankName, bankAccount, accountHolder} or null if cancelled.
  Future<Map<String, dynamic>?> _collectRefundBank(BuildContext context, String note, String holderName) {
    final bankCtl = TextEditingController();
    final accCtl = TextEditingController();
    String? err;
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setLocal) {
        InputDecoration dec(String label) => InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder());
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          title: const Text('Rekening Refund'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(note, style: TextStyle(fontSize: 13, color: MC.inkMuted)),
              const SizedBox(height: 14),
              TextField(controller: bankCtl, decoration: dec('Nama Bank (mis. BCA)')),
              const SizedBox(height: 12),
              TextField(controller: accCtl, keyboardType: TextInputType.number, decoration: dec('Nomor Rekening')),
              const SizedBox(height: 12),
              TextField(
                enabled: false,
                controller: TextEditingController(text: holderName),
                decoration: dec('Atas Nama (sesuai Data Pribadi)'),
              ),
              const SizedBox(height: 6),
              Text(
                holderName.isEmpty
                    ? '⚠ Lengkapi Nama di Data Pribadi dulu — refund harus atas nama Anda.'
                    : 'Refund hanya bisa ke rekening atas nama Anda sendiri.',
                style: TextStyle(fontSize: 11.5, color: holderName.isEmpty ? MC.danger : MC.inkFaint),
              ),
              if (err != null) ...[
                const SizedBox(height: 8),
                Text(err!, style: const TextStyle(fontSize: 12, color: MC.danger, fontWeight: FontWeight.w600)),
              ],
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Kembali')),
            TextButton(
              onPressed: holderName.isEmpty
                  ? null
                  : () {
                      final bank = bankCtl.text.trim();
                      final acc = accCtl.text.trim();
                      if (bank.isEmpty || acc.isEmpty) {
                        setLocal(() => err = 'Nama bank & nomor rekening wajib diisi.');
                        return;
                      }
                      if (!RegExp(r'^\d{6,20}$').hasMatch(acc.replaceAll(' ', ''))) {
                        setLocal(() => err = 'Nomor rekening harus 6–20 digit angka.');
                        return;
                      }
                      Navigator.pop(ctx, {'bankName': bank, 'bankAccount': acc, 'accountHolder': holderName});
                    },
              child: const Text('Ajukan Refund', style: TextStyle(color: MC.danger, fontWeight: FontWeight.w700)),
            ),
          ],
        );
      }),
    );
  }

  Future<void> _cancel(BuildContext context) async {
    // Fetch the refund estimate from the backend so the wording always matches
    // the actual (configurable) refund policy — single source of truth.
    String note = 'Membatalkan pesanan ini?';
    bool requiresBank = false;
    String holderName = '';
    try {
      final q = await context.read<Api>().refundQuote(b.id);
      note = (q['note'] ?? note).toString();
      requiresBank = q['requiresBank'] == true;
      holderName = (q['accountHolderName'] ?? '').toString();
    } catch (_) {/* keep generic note if the quote can't load */}
    if (!context.mounted) return;

    // Cash refund due → collect the guest's bank account (must be in their name).
    Map<String, dynamic>? bank;
    if (requiresBank) {
      bank = await _collectRefundBank(context, note, holderName);
      if (bank == null || !context.mounted) return; // cancelled the form
    } else {
      final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Batalkan Pesanan?'),
        content: Text('$note\n\nNo. Pesanan ${b.code}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Kembali')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Ya, Batalkan', style: TextStyle(color: MC.danger))),
        ],
      ));
      if (ok != true || !context.mounted) return;
    }
    try {
      final (_, refundPct, refundAmount) = await context.read<Api>().cancelBooking(b.id, bank: bank);
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
