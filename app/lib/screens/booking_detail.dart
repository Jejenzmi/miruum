import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'pembayaran.dart';

/// Dedicated booking-detail page (full info + actions).
class BookingDetailScreen extends StatelessWidget {
  final Booking booking;
  const BookingDetailScreen(this.booking, {super.key});

  ({Color color, String label}) get _status => switch (booking.status) {
        'PENDING' => (color: MC.accent, label: 'Menunggu dibayar'),
        'PAID' => (color: MC.success, label: 'Sudah dibayar'),
        'COMPLETED' => (color: MC.primaryDark, label: 'Selesai'),
        'CANCELLED' => (color: MC.danger, label: 'Dibatalkan'),
        'REFUNDED' => (color: MC.inkMuted, label: 'Refund diproses'),
        _ => (color: MC.inkMuted, label: booking.status),
      };

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final s = _status;
    final fmt = DateFormat('EEE, d MMM yyyy', 'id_ID');
    final ci = DateTime.tryParse(b.checkIn), co = DateTime.tryParse(b.checkOut);
    return Scaffold(
      appBar: AppBar(title: const Text('Detail Pesanan')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Center(child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(color: s.color.withOpacity(0.12), borderRadius: BorderRadius.circular(20)),
            child: Text(s.label, style: TextStyle(color: s.color, fontWeight: FontWeight.w700)),
          )),
          const SizedBox(height: 18),
          cardBox(child: Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(12), child: NetImage(b.hotel?.imageUrl ?? '', width: 72, height: 72)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(b.hotel?.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 2),
              Text(b.hotel?.city ?? '', style: TextStyle(color: MC.inkMuted, fontSize: 12)),
              if (b.packageTitle != null) ...[
                const SizedBox(height: 4),
                Text('Paket: ${b.packageTitle}', style: const TextStyle(color: MC.primaryDark, fontSize: 11.5, fontWeight: FontWeight.w600)),
              ],
            ])),
          ])),
          const SizedBox(height: 14),
          cardBox(child: Column(children: [
            _row('No. Pesanan', b.code),
            _row('Kamar', '${b.rooms}× ${b.room?.name ?? '-'}'),
            _row('Tamu', '${b.guests} dewasa'),
            _row('Check-in', ci != null ? fmt.format(ci) : b.checkIn),
            _row('Check-out', co != null ? fmt.format(co) : b.checkOut),
            _row('Durasi', '${b.nights} malam'),
            if (b.paymentMethod != null) _row('Pembayaran', b.paymentMethod!),
          ])),
          const SizedBox(height: 14),
          cardBox(child: Column(children: [
            _row('Harga Kamar', rupiah(b.roomPrice)),
            _row('Pajak & Layanan', rupiah(b.taxFee)),
            if (b.discount > 0) _row('Diskon${b.promoCode != null ? ' (${b.promoCode})' : ''}', '- ${rupiah(b.discount)}', color: MC.success),
            Divider(height: 20, color: MC.line),
            _row('Total', rupiah(b.totalPrice), bold: true),
          ])),
          const SizedBox(height: 18),
          if (b.status == 'PENDING')
            PrimaryButton('Lanjutkan Pembayaran', icon: Icons.payment_rounded,
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: b.id))))
          else if (b.status == 'PAID' || b.status == 'COMPLETED')
            OutlineButtonX('Lihat E-Voucher', icon: Icons.receipt_long_rounded, onPressed: () async {
              final ok = await openUrl(context.read<Api>().voucherUrl(b.code));
              if (!ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tidak dapat membuka e-voucher')));
              }
            }),
        ]),
      ),
    );
  }

  Widget _row(String k, String v, {bool bold = false, Color? color}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 120, child: Text(k, style: TextStyle(color: MC.inkMuted, fontSize: 13))),
          Expanded(child: Text(v, textAlign: TextAlign.right,
              style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  fontSize: bold ? 15 : 13, color: color ?? (bold ? MC.primaryDark : MC.ink)))),
        ]),
      );
}
