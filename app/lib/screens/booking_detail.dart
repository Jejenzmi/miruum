import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../feedback.dart';
import '../l10n.dart';
import '../models.dart';
import '../theme.dart';
import '../ui_kit.dart';
import '../widgets.dart';
import 'pembayaran.dart';

/// Dedicated booking-detail page (full info + actions).
class BookingDetailScreen extends StatelessWidget {
  final Booking booking;
  const BookingDetailScreen(this.booking, {super.key});

  ({Color color, String label}) get _status => booking.payAtHotel && booking.status == 'PENDING'
      ? (color: MC.success, label: tr('Terkonfirmasi · Bayar di Hotel', 'Confirmed · Pay at Hotel'))
      : switch (booking.status) {
        'PENDING' => (color: MC.accent, label: tr('Menunggu dibayar', 'Awaiting payment')),
        'PAID' => (color: MC.success, label: tr('Sudah dibayar', 'Paid')),
        'COMPLETED' => (color: MC.primaryDark, label: tr('Selesai', 'Completed')),
        'CANCELLED' => (color: MC.danger, label: tr('Dibatalkan', 'Cancelled')),
        'REFUNDED' => (color: MC.inkMuted, label: tr('Refund diproses', 'Refund processed')),
        _ => (color: MC.inkMuted, label: booking.status),
      };

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final s = _status;
    final fmt = DateFormat('EEE, d MMM yyyy', 'id_ID');
    final ci = DateTime.tryParse(b.checkIn), co = DateTime.tryParse(b.checkOut);
    return Scaffold(
      appBar: AppBar(title: Text(tr('Detail Pesanan', 'Order Details'))),
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
                Text(tr('Paket: ${b.packageTitle}', 'Package: ${b.packageTitle}'), style: const TextStyle(color: MC.primaryDark, fontSize: 11.5, fontWeight: FontWeight.w600)),
              ],
            ])),
          ])),
          const SizedBox(height: 14),
          cardBox(child: Column(children: [
            _row(tr('No. Pesanan', 'Order No.'), b.code),
            _row(tr('Kamar', 'Room'), '${b.rooms}× ${b.room?.name ?? '-'}'),
            if (b.ratePlanName != null && b.ratePlanName!.isNotEmpty) _row(tr('Rate Plan', 'Rate Plan'), b.ratePlanName!),
            _row(tr('Tamu', 'Guests'), tr('${b.guests} dewasa', '${b.guests} adults')),
            _row(tr('Check-in', 'Check-in'), ci != null ? fmt.format(ci) : b.checkIn),
            if ((b.hotel?.checkInInfo ?? '').isNotEmpty) _row(tr('Jam Check-in', 'Check-in Time'), b.hotel!.checkInInfo!),
            _row(tr('Check-out', 'Check-out'), co != null ? fmt.format(co) : b.checkOut),
            if ((b.hotel?.checkOutInfo ?? '').isNotEmpty) _row(tr('Jam Check-out', 'Check-out Time'), b.hotel!.checkOutInfo!),
            _row(tr('Durasi', 'Duration'), tr('${b.nights} malam', '${b.nights} nights')),
            if (b.paymentMethod != null) _row(tr('Pembayaran', 'Payment'), '${b.paymentMethod!}${b.bank != null ? ' · ${b.bank}' : ''}'),
          ])),
          const SizedBox(height: 14),
          cardBox(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr('Detail Kontak Pemesan', 'Booker Contact'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
            const SizedBox(height: 8),
            _row(tr('Nama', 'Name'), b.bookerName),
            _row(tr('Email', 'Email'), b.bookerEmail),
            _row(tr('Telepon', 'Phone'), b.bookerPhone),
            if ((b.specialRequest ?? '').trim().isNotEmpty) ...[
              Divider(height: 20, color: MC.line),
              Align(alignment: Alignment.centerLeft, child: Text(tr('Permintaan Khusus', 'Special Request'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: MC.inkMuted))),
              const SizedBox(height: 4),
              Align(alignment: Alignment.centerLeft, child: Text(b.specialRequest!.trim(), style: const TextStyle(fontSize: 13, height: 1.5))),
            ],
          ])),
          const SizedBox(height: 14),
          cardBox(child: Column(children: [
            _row(tr('Harga Kamar', 'Room Price'), rupiah(b.roomPrice)),
            _row(tr('Pajak & Layanan', 'Tax & Service'), rupiah(b.taxFee)),
            if (b.discount > 0) _row(tr('Diskon${b.promoCode != null ? ' (${b.promoCode})' : ''}', 'Discount${b.promoCode != null ? ' (${b.promoCode})' : ''}'), '- ${rupiah(b.discount)}', color: MC.success),
            Divider(height: 20, color: MC.line),
            _row(tr('Total', 'Total'), rupiah(b.totalPrice), bold: true),
          ])),
          const SizedBox(height: 18),
          if (b.status == 'PENDING' && !b.payAtHotel)
            PrimaryButton(tr('Lanjutkan Pembayaran', 'Continue Payment'), icon: Icons.payment_rounded,
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PembayaranScreen(bookingId: b.id))))
          else if (b.status == 'PAID' || b.status == 'COMPLETED' || b.payAtHotel) ...[
            PrimaryButton(tr('Lihat E-Voucher', 'View E-Voucher'), icon: Icons.picture_as_pdf_rounded, onPressed: () async {
              final ok = await launchUrl(Uri.parse('${Api.base}/vouchers/${b.code}'), mode: LaunchMode.externalApplication);
              if (!ok && context.mounted) showSnack(context, tr('Gagal membuka voucher.', 'Failed to open voucher.'), kind: SnackKind.error);
            }),
            const SizedBox(height: 10),
            OutlineButtonX(tr('Lihat Receipt', 'View Receipt'), icon: Icons.receipt_long_rounded, onPressed: () async {
              final ok = await launchUrl(Uri.parse('${Api.base}/invoices/${b.code}'), mode: LaunchMode.externalApplication);
              if (!ok && context.mounted) showSnack(context, tr('Gagal membuka receipt.', 'Failed to open receipt.'), kind: SnackKind.error);
            }),
            const SizedBox(height: 10),
            OutlineButtonX(tr('Bagikan Voucher', 'Share Voucher'), icon: Icons.ios_share_rounded, onPressed: () =>
                Share.share('${tr('E-Voucher Miruum', 'Miruum E-Voucher')} — ${b.hotel?.name ?? ''}\n${Api.base}/vouchers/${b.code}')),
            const SizedBox(height: 10),
            OutlineButtonX(tr('Lihat Invoice', 'View Invoice'), icon: Icons.description_rounded, onPressed: () async {
              final ok = await openUrl(context.read<Api>().invoiceUrl(b.code));
              if (!ok && context.mounted) showSnack(context, tr('Tidak dapat membuka invoice.', 'Could not open invoice.'), kind: SnackKind.error);
            }),
            if (b.status == 'PAID') ...[
              const SizedBox(height: 10),
              if (b.onlineCheckedIn && (b.keyCode ?? '').isNotEmpty)
                PrimaryButton(tr('Kunci Digital Kamar', 'Digital Room Key'), icon: Icons.vpn_key_rounded, onPressed: () => _showKey(context, b.keyCode!))
              else
                OutlineButtonX(tr('Check-in Online', 'Online Check-in'), icon: Icons.login_rounded, onPressed: () => _doCheckin(context)),
            ],
          ],
        ]),
      ),
    );
  }

  Future<void> _doCheckin(BuildContext context) async {
    try {
      final (_, key) = await context.read<Api>().digitalCheckin(booking.id);
      if (context.mounted) _showKey(context, key, justChecked: true);
    } on ApiException catch (e) {
      if (context.mounted) showSnack(context, e.message, kind: SnackKind.error);
    }
  }

  void _showKey(BuildContext context, String code, {bool justChecked = false}) {
    showDialog(context: context, builder: (_) => Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.vpn_key_rounded, color: MC.primary, size: 30),
          const SizedBox(height: 8),
          Text(justChecked ? tr('Check-in Online Berhasil!', 'Online Check-in Successful!') : tr('Kunci Digital Kamar', 'Digital Room Key'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(tr('Tunjukkan kode ini di resepsionis / gerbang kamar.', 'Show this code at the reception / room gate.'), textAlign: TextAlign.center, style: TextStyle(color: MC.inkMuted, fontSize: 12.5)),
          const SizedBox(height: 16),
          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: MC.line)),
              child: QrImageView(data: code, size: 170, version: QrVersions.auto)),
          const SizedBox(height: 12),
          Text(code, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, letterSpacing: 2, color: MC.primaryDark)),
          const SizedBox(height: 16),
          SizedBox(width: double.infinity, child: PrimaryButton(tr('Tutup', 'Close'), onPressed: () => Navigator.pop(context))),
        ]),
      ),
    ));
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
